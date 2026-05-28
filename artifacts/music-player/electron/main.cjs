try { require("dotenv").config(); } catch {}
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, globalShortcut, shell, net, screen, safeStorage } = require("electron");
const path = require("path");
const fs     = require("fs/promises");
const fsSync = require("fs");
const http = require("http");
const os = require("os");

// ── Input validation helpers ──────────────────────────────────────────────────

const _MAX_QUERY_LEN    = 300;
const _MAX_PATH_LEN     = 1024;
const _MAX_WRITE_BYTES  = 500 * 1024 * 1024; // 500 MB
const _MAX_BATCH_TRACKS = 500;
const _MAX_RSS_BYTES    = 10  * 1024 * 1024; // 10 MB
const _ALLOWED_AUDIO_FMTS = new Set(["mp3", "m4a", "opus", "flac", "ogg", "wav"]);

/** True if val is a non-empty string within maxLen characters. */
function _isStr(val, maxLen = _MAX_QUERY_LEN) {
  return typeof val === "string" && val.length > 0 && val.length <= maxLen;
}

/** True if the path contains no traversal (.. segments) after normalization. */
function _noTraversal(p) {
  if (!_isStr(p, _MAX_PATH_LEN)) return false;
  return !path.normalize(p).split(path.sep).includes("..");
}

/**
 * True if urlStr is safe to fetch remotely:
 *   - Only http:// or https:// (blocks file://, data:, etc.)
 *   - Not localhost, loopback, or RFC-1918 private addresses (SSRF guard)
 */
function _isSafeRemoteUrl(urlStr) {
  if (!_isStr(urlStr, 2048)) return false;
  let u;
  try { u = new URL(urlStr); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h || h === "localhost" || h === "::1" || h === "0.0.0.0") return false;
  if (/^127\./.test(h)) return false;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(h)) return false;
  return true;
}

/**
 * True if the resolved path is within a set of permitted base directories.
 * Blocks access to system paths even when no traversal sequences are present
 * (e.g. an absolute path like "/etc/passwd" or "/home/user/.ssh/id_rsa").
 * Allowed bases: home directory, OS temp dir, and Linux external-drive mount points.
 */
let _allowedBaseDirs = null;
function _getAllowedBaseDirs() {
  if (_allowedBaseDirs) return _allowedBaseDirs;
  _allowedBaseDirs = [os.homedir(), os.tmpdir()];
  if (process.platform === "linux") _allowedBaseDirs.push("/media", "/mnt", "/run/media");
  return _allowedBaseDirs;
}
function _isAllowedPath(p) {
  if (!_noTraversal(p)) return false;
  const resolved = path.resolve(p);
  return _getAllowedBaseDirs().some(
    (base) => resolved === base || resolved.startsWith(base + path.sep),
  );
}

// ── Sandbox flags are only needed on Linux (SUID sandbox is unavailable there).
// On Windows these switches are unnecessary and removed to avoid any side-effects.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}

// ── Single-instance lock ──────────────────────────────────────────────────────
// Must be called before app.whenReady(). If a second instance launches (e.g. the
// user clicks the Windows taskbar icon while the app is already running), it quits
// immediately and the first instance restores its window to the foreground.
const _gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!_gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  // First instance receives this event when a second launch is attempted.
  // Bring the existing window back to focus, restoring it if minimized or hidden.
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible())  mainWindow.show();
    mainWindow.focus();
  }
});

// ── Pin userData path ─────────────────────────────────────────────────────────
// Linux: ~/.config/splayer  |  Windows: %APPDATA%\Splayer
const USERDATA_DIR = process.platform === "win32"
  ? path.join(os.homedir(), "AppData", "Roaming", "Splayer")
  : path.join(os.homedir(), ".config", "splayer");

// All previous locations this app may have stored data in, most-preferred first.
// "Music Player"  → original productName default
// "Splayer"       → after the first rename (Electron default, capital S)
// "music-player"  → possible alternate casing
const OLD_DATA_DIRS = [
  path.join(os.homedir(), ".config", "Music Player"),
  path.join(os.homedir(), ".config", "Splayer"),
  path.join(os.homedir(), ".config", "music-player"),
];

app.setPath("userData", USERDATA_DIR);
if (process.platform === "linux") app.setName("Splayer");

// Migration is Linux-only — Windows installs are always fresh.
(process.platform === "linux") && (function migrateUserData() {
  const fsSync = require("fs");
  const logPath = path.join(os.homedir(), ".config", "splayer-migration.log");

  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
      let size = 0;
      try { size = fsSync.statSync(logPath).size; } catch {}
      if (size < 1024 * 1024) fsSync.appendFileSync(logPath, line);
    } catch (_) {}
    console.log("[splayer]", msg);
  }

  // "Real data" = IndexedDB folder exists and is non-empty.
  // Electron creates an empty Default/ skeleton on first launch; that doesn't count.
  function hasRealData(dir) {
    try {
      // Check for Local Storage directly in dir (no Default/ subfolder on this build)
      const lsDir = path.join(dir, "Local Storage");
      if (fsSync.existsSync(lsDir)) {
        const entries = fsSync.readdirSync(lsDir);
        log(`  Local Storage at ${lsDir}: [${entries.join(", ")}]`);
        if (entries.length > 0) return true;
      }
      // Fallback: also accept Default/IndexedDB for any future Chromium-profile layout
      const idbDir = path.join(dir, "Default", "IndexedDB");
      if (!fsSync.existsSync(idbDir)) { log(`  no Local Storage or IndexedDB at ${dir}`); return false; }
      const entries = fsSync.readdirSync(idbDir);
      log(`  IndexedDB at ${idbDir}: [${entries.join(", ")}]`);
      return entries.length > 0;
    } catch (e) { log(`  error reading ${dir}: ${e.message}`); return false; }
  }

  log(`=== Splayer startup ===`);
  log(`USERDATA_DIR: ${USERDATA_DIR}`);
  log(`Checking destination for real data...`);
  if (hasRealData(USERDATA_DIR)) { log("Destination has data — no migration needed."); return; }

  log("Destination is empty. Scanning old locations...");
  for (const oldDir of OLD_DATA_DIRS) {
    log(`Checking: ${oldDir}`);
    if (!fsSync.existsSync(oldDir)) { log("  does not exist, skipping."); continue; }
    if (!hasRealData(oldDir)) { log("  exists but has no real data, skipping."); continue; }

    log(`Found data in: ${oldDir}. Migrating → ${USERDATA_DIR}`);
    try {
      // Wipe the empty skeleton first so we get a clean target.
      if (fsSync.existsSync(USERDATA_DIR)) {
        log("  Removing empty destination skeleton...");
        fsSync.rmSync(USERDATA_DIR, { recursive: true, force: true });
      }
      // Try rename first (instant, atomic, same filesystem).
      try {
        fsSync.renameSync(oldDir, USERDATA_DIR);
        log("  renameSync succeeded.");
      } catch (renameErr) {
        // Falls back to full copy if rename crosses device boundaries.
        log(`  renameSync failed (${renameErr.message}), trying cpSync...`);
        fsSync.cpSync(oldDir, USERDATA_DIR, { recursive: true });
        log("  cpSync succeeded.");
      }
      log("Migration complete.");
    } catch (e) {
      log(`MIGRATION FAILED: ${e.message}`);
    }
    return;
  }
  log("No old data found in any known location. Starting fresh.");
})();

// ── Tray & close-behavior state ───────────────────────────────────────────────
let mainWindow   = null;
let tray         = null;
let widgetWindow = null;        // always-on-top mini player
let _widgetLastState = null;    // cached so we can re-push on show
let closeBehavior = "tray"; // "tray" | "close"
let isQuitting   = false;
let nowPlayingState = { title: "Nothing playing", artist: "", isPlaying: false };
let trayVolume   = 100;           // 0-100, kept in sync with renderer
let volumeTooltipTimer = null;    // used to restore normal tooltip after scroll

function getTrayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");
}

function buildTrayMenu() {
  const { title, artist, isPlaying } = nowPlayingState;
  const trackLabel = (title && title !== "Nothing playing")
    ? `${title}${artist ? ` — ${artist}` : ""}`
    : "Nothing playing";
  const truncated = trackLabel.length > 45
    ? trackLabel.slice(0, 45) + "…"
    : trackLabel;

  return Menu.buildFromTemplate([
    {
      label: "Show Splayer",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible())  mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "⏮  Previous",
      click: () => { if (mainWindow) mainWindow.webContents.send("tray-action", "prev"); },
    },
    {
      label: isPlaying ? "⏸  Pause" : "▶  Play",
      click: () => { if (mainWindow) mainWindow.webContents.send("tray-action", "play-pause"); },
    },
    {
      label: "⏭  Next",
      click: () => { if (mainWindow) mainWindow.webContents.send("tray-action", "next"); },
    },
    { type: "separator" },
    {
      label: `🎵 ${truncated}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: `🔊 Volume: ${trayVolume}%`,
      enabled: false,
    },
    {
      label: "🔼  Volume +5",
      click: () => adjustVolume(5),
    },
    {
      label: "🔽  Volume −5",
      click: () => adjustVolume(-5),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
}

function updateTray() {
  if (!tray) return;
  const { title, artist } = nowPlayingState;
  const tip = (title && title !== "Nothing playing")
    ? `🎵 ${title}${artist ? ` • ${artist}` : ""}`
    : "Splayer";
  tray.setToolTip(tip);
  tray.setContextMenu(buildTrayMenu());
}

// ── Windows tray scroll monitor ──────────────────────────────────────────────
// PowerShell installs a WH_MOUSE_LL hook and prints "up X Y" / "down X Y" for
// every mouse-wheel event. Main process filters to only those over the tray icon.
function setupWindowsTrayScrollMonitor() {
  if (process.platform !== "win32") return;

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows.Forms;
public class WheelHook {
    const int WH_MOUSE_LL = 14;
    const int WM_MOUSEWHEEL = 0x020A;
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct MSLL {
        public POINT pt; public uint mouseData, flags, time; public IntPtr extra;
    }
    delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc cb, IntPtr h, uint t);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
    static Proc _proc;
    static IntPtr _hook;
    static IntPtr CB(int n, IntPtr w, IntPtr l) {
        if (n >= 0 && (int)w == WM_MOUSEWHEEL) {
            var s = (MSLL)Marshal.PtrToStructure(l, typeof(MSLL));
            int d = (short)((s.mouseData >> 16) & 0xFFFF);
            Console.WriteLine((d > 0 ? "up" : "down") + " " + s.pt.x + " " + s.pt.y);
            Console.Out.Flush();
        }
        return CallNextHookEx(_hook, n, w, l);
    }
    public static void Run() {
        _proc = CB;
        _hook = SetWindowsHookEx(WH_MOUSE_LL, _proc,
            GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName), 0);
        Application.Run();
    }
}
'@
[WheelHook]::Run()
`;

  try {
    const scriptPath = require("path").join(require("os").tmpdir(), "splayer_wheel.ps1");
    require("fs").writeFileSync(scriptPath, psScript, "utf8");

    const proc = spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
      "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    ], { stdio: ["ignore", "pipe", "ignore"] });

    let buf = "";
    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const parts = line.trim().split(" ");
        if (parts.length !== 3 || !tray) continue;
        const [dir, cx, cy] = [parts[0], parseInt(parts[1]), parseInt(parts[2])];
        const b = tray.getBounds();
        if (cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) {
          adjustVolume(dir === "up" ? 5 : -5);
        }
      }
    });

    proc.on("error", () => {});
    console.log("[Tray] Windows scroll monitor active");
  } catch (err) {
    console.warn("[Tray] Windows scroll monitor unavailable:", err.message);
  }
}

// ── D-Bus scroll monitor (Linux / KDE Plasma) ────────────────────────────────
// KDE sends a Scroll(delta, orientation) D-Bus method call to the app's
// StatusNotifierItem service when the user scrolls over the tray icon.
// Electron's Tray API doesn't expose this on Linux, so we intercept it by
// spawning `dbus-monitor --monitor` (ships with every Linux D-Bus install).
// --monitor uses BecomeMonitor under the hood — no root or eavesdrop needed.
function setupTrayScrollMonitor() {
  if (process.platform !== "linux") return;
  try {
    const monitor = spawn("dbus-monitor", [
      "--session",
      "--monitor",
      "type='method_call',member='Scroll'",
    ], { stdio: ["ignore", "pipe", "ignore"] });

    let buf = "";
    let expectDelta = false;
    let pendingDelta = null;
    let expectOrientation = false;

    monitor.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop(); // keep any incomplete trailing line

      for (const line of lines) {
        const t = line.trim();

        // Header line: "method call ... member=Scroll"
        if (t.includes("member=Scroll")) {
          expectDelta = true;
          pendingDelta = null;
          expectOrientation = false;
          continue;
        }

        if (expectDelta) {
          const m = t.match(/^int32\s+(-?\d+)$/);
          if (m) {
            pendingDelta = parseInt(m[1], 10);
            expectDelta = false;
            expectOrientation = true;
          } else {
            expectDelta = false; // unexpected line, reset
          }
          continue;
        }

        if (expectOrientation) {
          const m = t.match(/^string\s+"(\w+)"$/);
          if (m) {
            const orientation = m[1].toLowerCase();
            if (orientation === "vertical" && pendingDelta !== null && pendingDelta !== 0) {
              adjustVolume(pendingDelta > 0 ? 5 : -5);
            }
          }
          expectOrientation = false;
          pendingDelta = null;
        }
      }
    });

    monitor.on("error", () => {}); // dbus-monitor not installed → silent fail
    monitor.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.warn("[Tray] dbus-monitor exited with code", code);
      }
    });

    console.log("[Tray] D-Bus scroll monitor active");
  } catch (err) {
    // Graceful degradation — keyboard shortcuts and menu items still work
    console.warn("[Tray] D-Bus scroll monitor unavailable:", err.message);
  }
}

// Shared helper used by both tray menu items and global shortcuts.
// Clamps volume to 0-100, pushes it to the renderer, and refreshes the tray.
function adjustVolume(delta) {
  trayVolume = Math.max(0, Math.min(100, trayVolume + delta));
  if (mainWindow) {
    mainWindow.webContents.send("tray-action", { type: "set-volume", volume: trayVolume });
  }
  if (tray) {
    tray.setToolTip(`🔊 Volume: ${trayVolume}%`);
  }
  if (volumeTooltipTimer) clearTimeout(volumeTooltipTimer);
  volumeTooltipTimer = setTimeout(() => {
    volumeTooltipTimer = null;
    updateTray();
  }, 2000);
  updateTray(); // also refresh menu label immediately
}

// ── Global shortcuts (configurable via renderer) ──────────────────────────────
const SHORTCUT_ACTIONS = {
  playPause:  () => { if (mainWindow) mainWindow.webContents.send("tray-action", "play-pause"); },
  stop:       () => { if (mainWindow) mainWindow.webContents.send("tray-action", "stop"); },
  next:       () => { if (mainWindow) mainWindow.webContents.send("tray-action", "next"); },
  prev:       () => { if (mainWindow) mainWindow.webContents.send("tray-action", "prev"); },
  mute:       () => { if (mainWindow) mainWindow.webContents.send("tray-action", "mute"); },
  shuffle:    () => { if (mainWindow) mainWindow.webContents.send("tray-action", "shuffle"); },
  repeat:     () => { if (mainWindow) mainWindow.webContents.send("tray-action", "repeat"); },
  volumeUp:   () => adjustVolume(5),
  volumeDown: () => adjustVolume(-5),
};

function registerShortcuts(shortcuts) {
  globalShortcut.unregisterAll();
  for (const [action, accelerator] of Object.entries(shortcuts)) {
    const handler = SHORTCUT_ACTIONS[action];
    if (handler && accelerator) {
      try {
        globalShortcut.register(String(accelerator), handler);
      } catch (e) {
        console.warn(`[Shortcuts] Failed to register "${accelerator}" for "${action}":`, e.message);
      }
    }
  }
}

function createTray() {
  try {
    const iconPath = getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip("Splayer");
    tray.setContextMenu(buildTrayMenu());
    // Single-click restores the window on Windows (and Linux, since on Linux
    // single-click also fires before the context menu on most desktops).
    // On macOS the context menu opens on click, so we skip this there.
    tray.on("click", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible())  mainWindow.show();
        mainWindow.focus();
      }
    });

    tray.on("double-click", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible())  mainWindow.show();
        mainWindow.focus();
      }
    });

    tray.on("scroll", (_event, delta, direction) => {
      // macOS emits (event, delta, direction) where direction is 'up'/'down'.
      // Windows emits (event, steps) — a signed integer, no direction argument.
      const up   = direction === "up"   || (direction == null && typeof delta === "number" && delta > 0);
      const down = direction === "down" || (direction == null && typeof delta === "number" && delta < 0);
      if (up)   adjustVolume(5);
      if (down) adjustVolume(-5);
    });
  } catch (e) {
    console.error("[Tray] Failed to create system tray:", e.message);
  }
}

// ── Local YouTube embed / podcast stream server ───────────────────────────────
let embedServerPort = 0;

const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]{1,20}$/;

// Path for the YouTube cookies file exported from our login window.
// yt-dlp reads this with --cookies when it exists.
const YT_COOKIES_PATH = path.join(app.getPath("userData"), "yt-cookies.txt");

// CDN URL cache — yt-dlp --get-url runs once per video; result reused for all
// Range requests (seek, buffer refill). YouTube CDN URLs expire ~6 h; 5 h TTL.
const _cdnCache = new Map(); // videoId → { url, ts }
const CDN_TTL   = 5 * 60 * 60 * 1000;

// Active stream proxy connections — videoId → Array<{ netReq, res }>
// Populated by /stream, drained by /kill-stream and /kill-all-streams.
const _activeStreams = new Map();

// Single-attempt yt-dlp with a hard timeout — retries with mweb on bot detection.
function _ytDlpGetUrl(videoId) {
  function attempt(extraArgs) {
    return new Promise((resolve, reject) => {
      const cookieArgs = fsSync.existsSync(YT_COOKIES_PATH)
        ? ["--cookies", YT_COOKIES_PATH]
        : [];
      const proc = spawn(getYtDlpPath(), [
        ...getYtDlpPlatformArgs(),
        ...cookieArgs,
        ...(extraArgs || []),
        "-f", "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
        "--get-url", "--no-playlist", "--no-warnings", "--no-cache-dir",
        `https://www.youtube.com/watch?v=${videoId}`,
      ], { env: { ...process.env } });

      const chunks = [];
      let errText = "";
      proc.stdout.on("data", (c) => chunks.push(Buffer.from(c)));
      proc.stderr.on("data", (d) => { errText += d.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const msg = errText.trim().split("\n").pop() || `yt-dlp exit ${code}`;
          return reject(new Error(msg));
        }
        const url = Buffer.concat(chunks).toString("utf8").trim().split("\n")[0];
        url ? resolve(url) : reject(new Error("no URL returned"));
      });
      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch (_) {}
        reject(new Error("yt-dlp timeout"));
      }, 15000);
    });
  }

  // Primary: default client (yt-dlp chooses best, typically ANDROID_VR)
  return attempt(null).catch((err) => {
    if (_isBotError(err.message)) {
      console.log("[stream] bot detection, retrying with mweb client");
      return attempt(["--extractor-args", "youtube:player_client=mweb", "--user-agent", YT_IOS_USER_AGENT]).catch(() => {
        throw new Error("YouTube is blocking this stream. Try again in a few minutes.");
      });
    }
    throw err;
  });
}

async function _getCdnUrl(videoId) {
  const hit = _cdnCache.get(videoId);
  if (hit && Date.now() - hit.ts < CDN_TTL) return hit.url;
  const url = await _ytDlpGetUrl(videoId);
  _cdnCache.set(videoId, { url, ts: Date.now() });
  return url;
}

// Helper — normalise Electron net.request header values (string | string[])
function _hdr(headers, name) {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : (v || "");
}

const embedServer = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, "http://localhost");

  // /kill-all-streams — abort every active proxy connection (no video ID needed).
  // Called by the renderer when the user switches to a regular library track.
  if (parsedUrl.pathname === "/kill-all-streams") {
    for (const [videoId, streams] of _activeStreams) {
      for (const { netReq, res: s } of [...streams]) {
        try { netReq.abort(); } catch (_) {}
        try { s.end();       } catch (_) {}
      }
      console.log(`[podcast] stream killed (track switch, videoId=${videoId})`);
    }
    _activeStreams.clear();
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    return;
  }

  const vid = parsedUrl.searchParams.get("v") || "";

  if (!SAFE_VIDEO_ID.test(vid)) {
    res.writeHead(400); res.end("Bad request"); return;
  }

  // /kill-stream?v=VIDEOID&t=SECONDS — abort active proxy connections for one video.
  // Called by the renderer on pause so the net.request to CDN stops immediately.
  if (parsedUrl.pathname === "/kill-stream") {
    const t       = parseFloat(parsedUrl.searchParams.get("t") || "0");
    const streams = _activeStreams.get(vid) || [];
    if (streams.length > 0) {
      console.log(`[podcast] stream killed at ${t.toFixed(1)} seconds`);
      for (const { netReq, res: s } of [...streams]) {
        try { netReq.abort(); } catch (_) {}
        try { s.end();       } catch (_) {}
      }
      _activeStreams.delete(vid);
    }
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    return;
  }

  // /stream?v=VIDEOID
  // 1. yt-dlp --get-url → CDN URL (cached 5 h)
  // 2. net.request → fetches CDN URL in main process (no CORS, no blocking)
  // 3. Range header forwarded → browser <audio> can seek anywhere
  if (parsedUrl.pathname === "/stream") {
    _getCdnUrl(vid).then((cdnUrl) => {
      const netReq = net.request({ method: "GET", url: cdnUrl });
      netReq.setHeader("User-Agent", "Mozilla/5.0");
      const range = req.headers["range"];
      if (range) netReq.setHeader("Range", range);

      // Register this connection so /kill-stream can abort it on pause.
      const entry = { netReq, res };
      if (!_activeStreams.has(vid)) _activeStreams.set(vid, []);
      _activeStreams.get(vid).push(entry);
      const _untrack = () => {
        const arr = _activeStreams.get(vid);
        if (!arr) return;
        const i = arr.indexOf(entry);
        if (i >= 0) arr.splice(i, 1);
        if (!arr.length) _activeStreams.delete(vid);
      };

      netReq.on("response", (netRes) => {
        const ct = _hdr(netRes.headers, "content-type") || "audio/webm";
        const cl = _hdr(netRes.headers, "content-length");
        const cr = _hdr(netRes.headers, "content-range");

        const outHeaders = { "Content-Type": ct, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
        if (cl) outHeaders["Content-Length"] = cl;
        if (cr) outHeaders["Content-Range"]  = cr;

        res.writeHead(netRes.statusCode, outHeaders);

        netRes.on("data",  (chunk) => { try { res.write(chunk); } catch (_) {} });
        netRes.on("end",   ()      => { _untrack(); try { res.end(); } catch (_) {} });
        netRes.on("error", ()      => { _untrack(); try { res.end(); } catch (_) {} });
      });

      netReq.on("error", (e) => {
        _untrack();
        console.error("[stream] net.request error:", e.message);
        // Evict stale cache entry so next request re-fetches the CDN URL
        _cdnCache.delete(vid);
        try { res.writeHead(503); res.end(); } catch (_) {}
      });

      req.on("close", () => { _untrack(); try { netReq.abort(); } catch (_) {} });
      netReq.end();

    }).catch((e) => {
      console.error("[stream] getCdnUrl failed:", e.message);
      try { res.writeHead(503); res.end("Stream unavailable"); } catch (_) {}
    });

    return;
  }

  // /video-stream?v=VIDEOID — yt-dlp piped direct (video+audio, no CORS issue
  // since the video player uses a BrowserView with relaxed CSP).
  if (parsedUrl.pathname === "/video-stream") {
    const proc = spawn(getYtDlpPath(), [
      ...getYtDlpPlatformArgs(),
      "-f", "best[height<=480][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
      "--no-playlist", "--no-warnings", "-o", "-",
      `https://www.youtube.com/watch?v=${vid}`,
    ], { env: { ...process.env } });

    res.writeHead(200, { "Content-Type": "video/mp4", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache" });
    proc.stdout.pipe(res);
    proc.stderr.on("data", () => {});
    proc.on("error", () => { try { res.end(); } catch (_) {} });
    req.on("close", () => { try { proc.kill("SIGTERM"); } catch (_) {} });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

embedServer.listen(0, "127.0.0.1", () => {
  embedServerPort = embedServer.address().port;
  console.log("[embedServer] listening on port", embedServerPort);
});

ipcMain.handle("get-embed-port", () => embedServerPort);

// ── Window bounds persistence ─────────────────────────────────────────────────
const BOUNDS_FILE = path.join(USERDATA_DIR, "window-bounds.json");

function loadBounds() {
  try {
    const data = require("fs").readFileSync(BOUNDS_FILE, "utf8");
    const b = JSON.parse(data);
    if (typeof b.x === "number" && typeof b.width === "number" && b.width > 100) return b;
  } catch {}
  return null;
}

function saveBounds() {
  if (!mainWindow || mainWindow.isMaximized() || mainWindow.isMinimized()) return;
  try {
    require("fs").writeFileSync(BOUNDS_FILE, JSON.stringify(mainWindow.getBounds()));
  } catch {}
}

function createWindow() {
  const isWin32   = process.platform === "win32";
  const saved     = isWin32 ? loadBounds() : null;

  if (process.platform === "linux") app.commandLine.appendSwitch("gtk-version", "4");
  const win = new BrowserWindow({
    ...(saved || { width: 1280, height: 800 }),
    minWidth:        1280,
    minHeight:       800,
    backgroundColor: "#0a0a0f",
    title:           "Splayer",
    autoHideMenuBar: true,
    // Frameless window with a custom React titlebar.
    // On Windows we intentionally do NOT set thickFrame:false — the default
    // thickFrame:true preserves WS_THICKFRAME so the DWM can handle snap
    // layouts (Win+Up, drag-to-top) and fullscreen without gaps.
    // On Linux we disable thickFrame to remove the unnecessary shadow/chrome.
    frame: false,
    titleBarStyle: "hidden",
    ...(isWin32 ? {} : { thickFrame: false }),
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      preload:          path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow = win;

  // ── Content Security Policy ────────────────────────────────────────────────
  // Blocks inline script injection (XSS) and restricts resource origins.
  // img/connect/media use broad wildcards because the player legitimately fetches
  // album art and streams from many external CDNs.
  const _csp = [
    "default-src 'self' file:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src * blob: data: file:",
    "connect-src * blob: file:",
    "media-src * blob: file:",
    "font-src 'self' data:",
    "worker-src blob: 'self'",
  ].join("; ");
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Skip CSP for the widget window — it uses inline/same-dir scripts and has no
    // external content, so the main-app policy would only break it needlessly.
    if (details.url.includes("widget.html") || details.url.includes("widget.js")) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [_csp],
      },
    });
  });

  // ── Navigation guards ──────────────────────────────────────────────────────
  // Prevent a renderer XSS from navigating to a remote URL while keeping the
  // preload bridge (and all IPC handlers) active.
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });

  Menu.setApplicationMenu(null);
  // Remove native titlebar on Linux
  if (process.platform === "linux") win.setMenuBarVisibility(false);

  // Windows only: tell the renderer when the window is maximized / restored
  // so the custom titlebar and layout can react (e.g. update maximize button
  // state and recalculate bounds to fill the screen with no gaps).
  if (isWin32) {
    win.on("maximize",   () => win.webContents.send("window-maximized"));
    win.on("unmaximize", () => win.webContents.send("window-unmaximized"));
  }

  // Intercept the OS-level close event (Alt+F4, native X button, etc.).
  // When close-behavior is "tray", hide the window instead of destroying it so
  // the app stays resident and the tray icon remains active. The custom React
  // titlebar sends "window-close" via IPC, which is handled separately below,
  // but this handler catches everything else the OS can throw at us.
  win.on("close", (event) => {
    if (!isQuitting && closeBehavior === "tray") {
      event.preventDefault();
      win.hide();
    }
    // If isQuitting is true (e.g. tray "Quit" was clicked), let the close proceed.
  });

  // Always start maximised
  win.maximize();
  const indexPath = path.join(__dirname, "..", "dist", "public", "index.html");
  win.loadFile(indexPath);
  win.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.setBounds(win.getBounds());
        win.webContents.executeJavaScript("window.dispatchEvent(new Event('resize'))");
      }
    }, 600);
  });
}

// ── Mini widget window ─────────────────────────────────────────────────────
function _notifyWidgetVisibility(visible) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("mini-widget-visibility", { visible });
  }
}

function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width:          300,
    height:         80,
    alwaysOnTop:    true,
    frame:          false,
    transparent:    true,
    resizable:      false,
    skipTaskbar:    true,
    title:          "Splayer Widget",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      preload:          path.join(__dirname, "preload.cjs"),
    },
  });

  // Default position: bottom-right of the primary display work area
  const { workArea } = screen.getPrimaryDisplay();
  widgetWindow.setPosition(
    Math.round(workArea.x + workArea.width  - 320),
    Math.round(workArea.y + workArea.height - 100),
  );

  widgetWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  widgetWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  widgetWindow.loadFile(path.join(__dirname, "widget.html"));

  // Relay position changes to widget renderer so it can persist to localStorage
  widgetWindow.on("moved", () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const [x, y] = widgetWindow.getPosition();
    widgetWindow.webContents.send("widget-moved", { x, y });
  });

  widgetWindow.on("closed", () => {
    widgetWindow = null;
    _notifyWidgetVisibility(false);
  });
}

// IPC: main app toggles the widget
ipcMain.on("toggle-mini-widget", () => {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
    _notifyWidgetVisibility(true);
    // Push the last known state once the renderer is ready
    widgetWindow.webContents.once("did-finish-load", () => {
      if (_widgetLastState && widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.webContents.send("widget-state", _widgetLastState);
      }
    });
  } else if (widgetWindow.isVisible()) {
    widgetWindow.hide();
    _notifyWidgetVisibility(false);
  } else {
    widgetWindow.show();
    if (_widgetLastState) widgetWindow.webContents.send("widget-state", _widgetLastState);
    _notifyWidgetVisibility(true);
  }
});

// IPC: main app sends current track state → forward to widget
ipcMain.on("update-widget-state", (_event, state) => {
  _widgetLastState = state;
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
    widgetWindow.webContents.send("widget-state", state);
  }
});

// IPC: widget sends control action → relay to main app as tray-action
ipcMain.on("widget-action", (_event, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("tray-action", action);
  }
});

// IPC: widget close button → hide the window
ipcMain.on("widget-hide", () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
  _notifyWidgetVisibility(false);
});

// IPC: widget restores its saved position from localStorage
ipcMain.on("widget-init-position", (_event, { x, y }) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  // Clamp to the union of all display bounds so the widget is never off-screen
  const allBounds = screen.getAllDisplays().map(d => d.bounds);
  const onScreen = allBounds.some(b =>
    x >= b.x && x < b.x + b.width - 50 &&
    y >= b.y && y < b.y + b.height - 30
  );
  if (onScreen) widgetWindow.setPosition(Math.round(x), Math.round(y));
});

// ── IPC: OS save-file dialog ────────────────────────────────────────────────
ipcMain.handle("show-save-dialog", async (event, { defaultName, filters } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: filters ?? [{ name: "All Files", extensions: ["*"] }],
  });
  return result.canceled ? null : result.filePath;
});

// ── IPC: OS folder-picker ───────────────────────────────────────────────────
ipcMain.handle("show-folder-dialog", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Choose folder to save modified files",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: write bytes to a file path on disk ─────────────────────────────────
ipcMain.handle("write-file", async (_event, { filePath, bytes }) => {
  if (!_isAllowedPath(filePath))
    return { success: false, error: "Invalid file path" };
  if (!bytes || !(bytes.length <= _MAX_WRITE_BYTES))
    return { success: false, error: "Payload too large" };
  try {
    await fs.writeFile(filePath, Buffer.from(bytes));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: YouTube — search videos ─────────────────────────────────────────────
ipcMain.handle("yt-search", async (_event, query) => {
  if (!_isStr(query, _MAX_QUERY_LEN))
    return { error: "Invalid search query" };
  try {
    const ytBin = getYtDlpPath();
    const searchQuery = `ytsearch8:${query.trim()}`;
    const args = buildYtDlpArgs([searchQuery, "--flat-playlist", "--dump-json", "--no-warnings"], null);
    let stdout = "";
    let spawnErr = null;
    await new Promise((resolve) => {
      const proc = spawn(ytBin, args, { env: { ...process.env } });
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.on("close", resolve);
      proc.on("error", (e) => { spawnErr = e; resolve(); });
    });
    if (spawnErr) {
      console.error("[yt-search] spawn error:", spawnErr.message);
      return { error: `yt-dlp not found: ${spawnErr.message}` };
    }
    return stdout.split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).map((v) => ({
      videoId:      v.id,
      url:          `https://www.youtube.com/watch?v=${v.id}`,
      title:        v.title || "",
      channelName:  v.channel || v.uploader || "Unknown",
      durationSecs: v.duration || 0,
      durationText: v.duration ? new Date(v.duration * 1000).toISOString().substr(11, 8).replace(/^00:/, "") : "0:00",
      thumbnail:    v.thumbnails ? v.thumbnails[0]?.url : (v.thumbnail || ""),
    }));
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── yt-dlp helpers ────────────────────────────────────────────────────────────

const { spawn } = require("child_process");

function getYtDlpCookieBrowsers() {
  if (process.platform === "win32") return ["chrome", "edge"];
  if (process.platform === "darwin") return ["safari", "chrome"];
  return ["chrome", "firefox"]; // linux
}

// Used only in the mweb bot-detection retry paths — NOT as a default client.
// iOS player_client=ios,web breaks ytsearch: entirely (returns nothing).
const YT_IOS_USER_AGENT = "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)";

function getYtDlpPlatformArgs() {
  const denoBin = getDenoBinPath();
  if (fsSync.existsSync(denoBin)) {
    return ["--js-runtimes", `deno:${denoBin}`];
  }
  return [];
}

function _isBotError(msg) {
  const lower = (msg || "").toLowerCase();
  return lower.includes("sign in to confirm") || lower.includes("bot");
}

function buildYtDlpArgs(baseArgs, cookieBrowser) {
  const args = [...getYtDlpPlatformArgs()];
  if (cookieBrowser === "__file__") {
    args.push("--cookies", YT_COOKIES_PATH);
  } else if (cookieBrowser) {
    args.push("--cookies-from-browser", cookieBrowser);
  }
  args.push(...baseArgs);
  return args;
}

function getYtDlpPath() {
  if (process.platform !== "win32") {
    // On Linux/macOS, prefer a bundled binary if present, otherwise fall back to system PATH.
    const bundled = path.join(
      app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "resources"),
      "yt-dlp",
    );
    return fsSync.existsSync(bundled) ? bundled : "yt-dlp";
  }
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "resources");
  return path.join(resourcesDir, "yt-dlp.exe");
}

function getDenoBinPath() {
  const name = process.platform === "win32" ? "deno.exe" : "deno";
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "resources");
  return path.join(resourcesDir, name);
}

function getFfmpegPath() {
  // Use system ffmpeg on Linux
  if (process.platform !== "win32") return "ffmpeg";
  const exeName = "ffmpeg.exe";
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "resources");
  return path.join(resourcesDir, exeName);
}

const _YT_HOSTNAMES = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtu.be",
]);

function extractVideoId(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (!_YT_HOSTNAMES.has(u.hostname.toLowerCase())) return null;

  // youtu.be/<id>
  if (u.hostname.toLowerCase() === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  // ?v=<id>  (standard watch and music URLs)
  const v = u.searchParams.get("v");
  if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;

  // /embed/<id>  and  /v/<id>
  const m = u.pathname.match(/\/(?:embed|v)\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];

  return null;
}

// Run yt-dlp and return stdout as a Buffer.
// onStderr receives raw stderr text (used for progress parsing).
function runYtDlp(args, onStderr) {
  const browsers = getYtDlpCookieBrowsers();

  function runAttempt(attemptArgs) {
    return new Promise((resolve, reject) => {
      const bin = getYtDlpPath();
      const proc = spawn(bin, attemptArgs, { env: { ...process.env } });

      const outChunks = [];
      let errText = "";

      proc.stdout.on("data", (chunk) => outChunks.push(Buffer.from(chunk)));
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        errText += text;
        if (onStderr) onStderr(text);
      });
      proc.on("error", (e) =>
        reject(new Error(`yt-dlp not found or failed to start: ${e.message}`)),
      );
      proc.on("close", (code) => {
        if (code !== 0) {
          const errLine =
            errText
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.toLowerCase().includes("error"))
              .pop() ||
            errText.trim().split("\n").pop() ||
            "yt-dlp exited with code " + code;
          reject(new Error(errLine));
        } else {
          resolve(Buffer.concat(outChunks));
        }
      });
    });
  }

  return (async () => {
    let lastErr = null;
    // Cookies file (from YouTube login window) is tried first — highest priority.
    const attempts = [
      ...(fsSync.existsSync(YT_COOKIES_PATH) ? ["__file__"] : []),
      ...browsers,
      null, // last fallback: no cookies
    ];
    for (const attempt of attempts) {
      try {
        return await runAttempt(buildYtDlpArgs(args, attempt));
      } catch (err) {
        lastErr = err;
      }
    }
    // Bot detection retry with mweb client (bypasses ios,web from platform args)
    if (lastErr && _isBotError(lastErr.message)) {
      console.log("[yt-dlp] bot detection, retrying with mweb client");
      const cookieArgs = fsSync.existsSync(YT_COOKIES_PATH) ? ["--cookies", YT_COOKIES_PATH] : [];
      const mwebArgs = [
        ...cookieArgs,
        "--extractor-args", "youtube:player_client=mweb",
        "--user-agent", YT_IOS_USER_AGENT,
        ...args,
      ];
      try {
        return await runAttempt(mwebArgs);
      } catch {
        throw new Error("YouTube is blocking this download. Try again in a few minutes.");
      }
    }
    throw lastErr || new Error("yt-dlp failed");
  })();
}

// Parse yt-dlp's progress output and return 0-100 percentage
function parseYtDlpProgress(line) {
  const m = line.match(/\[download\]\s+([\d.]+)%/);
  return m ? Math.round(parseFloat(m[1])) : null;
}

// ── IPC: YouTube — get available video qualities ─────────────────────────────
ipcMain.handle("yt-get-qualities", async (_event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const ytUrl  = `https://www.youtube.com/watch?v=${videoId}`;
    const jsonBuf = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      ytUrl,
    ]);
    const info = JSON.parse(jsonBuf.toString("utf8"));

    // Video-only formats (have video codec, no audio codec)
    const videoFmts = (info.formats || []).filter(
      (f) => f.vcodec && f.vcodec !== "none" && f.height && f.height > 0,
    );

    // Best format per height bucket (highest tbr/vbr wins)
    const bestByHeight = {};
    for (const fmt of videoFmts) {
      const h     = fmt.height;
      const score = fmt.tbr || fmt.vbr || 0;
      if (!bestByHeight[h] || score > (bestByHeight[h]._score || 0)) {
        bestByHeight[h] = { ...fmt, _score: score };
      }
    }

    function heightLabel(h) {
      if (h >= 2160) return "4K (2160p)";
      if (h >= 1440) return "1440p";
      if (h >= 1080) return "1080p Full HD";
      if (h >= 720)  return "720p HD";
      if (h >= 480)  return "480p";
      return `${h}p`;
    }

    const ALL_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];

    // Recommend 1080p if available, else the highest available
    const availableHeights = ALL_HEIGHTS.filter((h) => bestByHeight[h]);
    const recommendedHeight = availableHeights.includes(1080)
      ? 1080
      : (availableHeights[0] || 720);

    const qualities = ALL_HEIGHTS.map((h) => {
      const fmt = bestByHeight[h];
      const fileSizeBytes = fmt?.filesize || fmt?.filesize_approx || null;
      const fileSizeMB    = fileSizeBytes ? Math.round(fileSizeBytes / 1024 / 1024) : null;
      return {
        height:      h,
        label:       heightLabel(h),
        formatId:    fmt ? String(fmt.format_id) : null,
        fileSizeMB,
        available:   !!fmt,
        recommended: h === recommendedHeight,
      };
    });

    return qualities;
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: Podcast — fetch RSS feed ────────────────────────────────────────────
ipcMain.handle("podcast-fetch-rss", async (_event, feedUrl) => {
  if (!_isSafeRemoteUrl(feedUrl))
    return { error: "Invalid feed URL" };
  try {
    const https = require("https");
    const http  = require("http");
    const xml = await new Promise((resolve, reject) => {
      const mod = feedUrl.startsWith("https") ? https : http;
      mod.get(feedUrl, { headers: { "User-Agent": "Splayer/1.0" } }, (res) => {
        // Follow one redirect
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redir = res.headers.location;
          if (!_isSafeRemoteUrl(redir)) { reject(new Error("Redirect to unsafe URL blocked")); return; }
          const mod2 = redir.startsWith("https") ? https : http;
          mod2.get(redir, { headers: { "User-Agent": "Splayer/1.0" } }, (res2) => {
            let data = "", size = 0;
            res2.on("data", (c) => {
              size += c.length;
              if (size > _MAX_RSS_BYTES) { reject(new Error("Feed response too large")); res2.destroy(); return; }
              data += c;
            });
            res2.on("end", () => resolve(data));
            res2.on("error", reject);
          }).on("error", reject);
        } else {
          let data = "", size = 0;
          res.on("data", (c) => {
            size += c.length;
            if (size > _MAX_RSS_BYTES) { reject(new Error("Feed response too large")); res.destroy(); return; }
            data += c;
          });
          res.on("end", () => resolve(data));
          res.on("error", reject);
        }
      }).on("error", reject);
    });
    return { xml };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — fetch playlist as podcast episodes ────────────────────────
ipcMain.handle("yt-get-playlist", async (_event, url) => {
  if (!_isStr(url, 2048)) return { error: "Invalid URL" };
  try {
    const _pu = new URL(url);
    const _ph = _pu.hostname.replace(/^www\./, "");
    if (_pu.protocol !== "https:" || !["youtube.com", "youtu.be", "m.youtube.com"].includes(_ph))
      return { error: "Only YouTube playlist URLs are supported" };
  } catch { return { error: "Invalid URL" }; }
  try {
    const jsonBuf = await runYtDlp([
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      url,
    ]);
    const info = JSON.parse(jsonBuf.toString("utf8"));
    const entries = (info.entries || []).map((e) => ({
      id:       e.id,
      title:    e.title || e.id,
      duration: e.duration || null,
      thumbnail: (e.thumbnails?.[0]?.url) || null,
      url:      `https://www.youtube.com/watch?v=${e.id}`,
    }));
    return {
      title:       info.title       || "YouTube Playlist",
      description: info.description || "",
      thumbnail:   info.thumbnails?.[0]?.url || null,
      entries,
    };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — get direct CDN audio URL ──────────────────────────────────
// YouTube CDN URLs are blocked when set directly as audio.src in the renderer.
// Return an error so callers fall back to the /stream proxy (which uses
// net.request in the main process and has no such restriction).
ipcMain.handle("yt-get-audio-url", async (_event, _videoId) => {
  return { error: "use stream proxy" };
});

// ── IPC: YouTube — fetch video info (via yt-dlp) ────────────────────────────
ipcMain.handle("yt-get-info", async (_event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const jsonBuf = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      ytUrl,
    ]);

    const info = JSON.parse(jsonBuf.toString("utf8"));
    return {
      title:        info.title        || "Unknown",
      author:       info.uploader     || info.channel || "Unknown",
      durationSecs: Math.round(info.duration || 0),
      thumbnailUrl: info.thumbnail    || null,
    };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — download audio (via yt-dlp) ───────────────────────────────
ipcMain.handle("yt-download", async (event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // ── Step 1: Get metadata + best audio format id ───────────────────────────
    const jsonBuf = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      ytUrl,
    ]);
    const info = JSON.parse(jsonBuf.toString("utf8"));

    // Pick the best audio-only format
    const audioFmts = (info.formats || [])
      .filter((f) => f.vcodec === "none" && f.acodec !== "none" && f.acodec)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));

    const bestFmt = audioFmts[0];
    const formatId = bestFmt ? String(bestFmt.format_id) : "bestaudio";
    const ext      = bestFmt?.ext || "webm";
    const mimeType = ext === "m4a" ? "audio/mp4"
                   : ext === "ogg" ? "audio/ogg"
                   : "audio/webm";

    const meta = {
      title:        info.title    || "Unknown",
      author:       info.uploader || info.channel || "Unknown",
      durationSecs: Math.round(info.duration || 0),
      thumbnailUrl: info.thumbnail || null,
    };

    // ── Step 2: Download audio to stdout, report progress via stderr ──────────
    const audioBuf = await runYtDlp(
      [
        "-f", formatId,
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-o", "-",     // pipe audio bytes to stdout
        ytUrl,
      ],
      (stderrLine) => {
        const pct = parseYtDlpProgress(stderrLine);
        if (pct !== null) {
          event.sender.send("yt-progress", {
            downloaded: pct,
            total: 100,
            percent: pct,
          });
        }
      },
    );

    event.sender.send("yt-progress", { downloaded: 100, total: 100, percent: 100 });

    return { bytes: new Uint8Array(audioBuf), mimeType, ext, ...meta };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — download video as MP4 (via yt-dlp) ───────────────────────
ipcMain.handle("yt-download-video", async (event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const ytUrl  = `https://www.youtube.com/watch?v=${videoId}`;
    const tmpOut = path.join(os.tmpdir(), `ytdl_video_${videoId}_${Date.now()}.mp4`);

    // ── Step 1: Get metadata ─────────────────────────────────────────────────
    const jsonBuf = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      ytUrl,
    ]);
    const info = JSON.parse(jsonBuf.toString("utf8"));

    const meta = {
      title:        info.title    || "Unknown",
      author:       info.uploader || info.channel || "Unknown",
      durationSecs: Math.round(info.duration || 0),
      thumbnailUrl: info.thumbnail || null,
    };

    // ── Step 2: Download best pre-muxed MP4 to a temp file ───────────────────
    // Use a pre-muxed format that never requires ffmpeg for merging.
    // This mirrors the /video-stream endpoint which already works without ffmpeg.
    await runYtDlp(
      [
        "-f", "best[height<=480][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-o", tmpOut,
        ytUrl,
      ],
      (stderrLine) => {
        const pct = parseYtDlpProgress(stderrLine);
        if (pct !== null) {
          event.sender.send("yt-progress-video", {
            downloaded: pct,
            total: 100,
            percent: pct,
          });
        }
      },
    );

    event.sender.send("yt-progress-video", { downloaded: 100, total: 100, percent: 100 });

    const videoBuf = await fs.readFile(tmpOut).catch(() => null);
    // Clean up temp file (best-effort)
    fs.unlink(tmpOut).catch(() => {});

    if (!videoBuf) throw new Error("Video temp file missing after download");

    return { bytes: new Uint8Array(videoBuf), mimeType: "video/mp4", ext: "mp4", ...meta };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── Helper: run yt-dlp writing output to a file path ─────────────────────────
function runYtDlpFile(args, onStderr) {
  const browsers = getYtDlpCookieBrowsers();

  function runAttempt(attemptArgs) {
    return new Promise((resolve, reject) => {
      const bin  = getYtDlpPath();
      const proc = spawn(bin, attemptArgs, { env: { ...process.env } });

      let errText = "";
      proc.stdout.on("data", () => {});            // discard stdout
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        errText += text;
        if (onStderr) onStderr(text);
      });
      proc.on("error", (e) =>
        reject(new Error(`yt-dlp not found or failed to start: ${e.message}`)),
      );
      proc.on("close", (code) => {
        if (code !== 0) {
          const errLine =
            errText
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.toLowerCase().includes("error"))
              .pop() ||
            errText.trim().split("\n").pop() ||
            "yt-dlp exited with code " + code;
          reject(new Error(errLine));
        } else {
          resolve();
        }
      });
    });
  }

  return (async () => {
    let lastErr = null;
    const attempts = [
      ...(fsSync.existsSync(YT_COOKIES_PATH) ? ["__file__"] : []),
      ...browsers,
      null,
    ];
    for (const attempt of attempts) {
      try {
        await runAttempt(buildYtDlpArgs(args, attempt));
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    // Bot detection retry with mweb client
    if (lastErr && _isBotError(lastErr.message)) {
      console.log("[yt-dlp] bot detection, retrying with mweb client");
      const cookieArgs = fsSync.existsSync(YT_COOKIES_PATH) ? ["--cookies", YT_COOKIES_PATH] : [];
      const mwebArgs = [
        ...cookieArgs,
        "--extractor-args", "youtube:player_client=mweb",
        "--user-agent", YT_IOS_USER_AGENT,
        ...args,
      ];
      try {
        await runAttempt(mwebArgs);
        return;
      } catch {
        throw new Error("YouTube is blocking this download. Try again in a few minutes.");
      }
    }
    throw lastErr || new Error("yt-dlp failed");
  })();
}

// ── Helper: merge video + audio with ffmpeg ───────────────────────────────────
function runFfmpegMerge(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-map", "0:v:0",
      "-map", "1:a:0",
      outputPath,
    ]);

    let errText = "";
    proc.stdout.on("data", () => {});
    proc.stderr.on("data", (d) => { errText += d.toString(); });
    proc.on("error", (e) =>
      reject(new Error(`ffmpeg not found or failed to start: ${e.message}`)),
    );
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("ffmpeg merge failed: " + errText.slice(-300)));
      } else {
        resolve();
      }
    });
  });
}

// ── IPC: YouTube — download + merge into a single MP4 ────────────────────────
ipcMain.handle("yt-download-merged", async (event, { url, videoFormatId }) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const ytUrl    = `https://www.youtube.com/watch?v=${videoId}`;
    const tmpId    = `${videoId}_${Date.now()}`;
    const tmpAudio = path.join(os.tmpdir(), `ytdl_audio_${tmpId}.%(ext)s`);
    const tmpVideo = path.join(os.tmpdir(), `ytdl_video_${tmpId}.mp4`);
    const tmpMerge = path.join(os.tmpdir(), `ytdl_merged_${tmpId}.mp4`);

    // ── Step 1: Fetch metadata only (title/author/thumbnail) ─────────────────
    const jsonBuf = await runYtDlp([
      "--dump-json", "--no-playlist", "--no-warnings", ytUrl,
    ]);
    const info = JSON.parse(jsonBuf.toString("utf8"));
    const meta = {
      title:        info.title    || "Unknown",
      author:       info.uploader || info.channel || "Unknown",
      durationSecs: Math.round(info.duration || 0),
      thumbnailUrl: info.thumbnail || null,
    };

    // ── Step 2: Download best audio (let yt-dlp pick the format) ─────────────
    event.sender.send("yt-progress", { percent: 0, downloaded: 0, total: 100 });
    await runYtDlpFile(
      [
        "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
        "--no-playlist", "--no-warnings", "--newline",
        "-o", tmpAudio,
        ytUrl,
      ],
      (line) => {
        const pct = parseYtDlpProgress(line);
        if (pct !== null) event.sender.send("yt-progress", { percent: pct, downloaded: pct, total: 100 });
      },
    );
    event.sender.send("yt-progress", { percent: 100, downloaded: 100, total: 100 });

    // Find the actual audio file (yt-dlp fills in %(ext)s)
    const audioBase = path.join(os.tmpdir(), `ytdl_audio_${tmpId}`);
    let tmpAudioResolved = null;
    for (const ext of ["m4a", "webm", "opus", "mp3", "aac"]) {
      const candidate = `${audioBase}.${ext}`;
      try { await fs.access(candidate); tmpAudioResolved = candidate; break; } catch {}
    }
    if (!tmpAudioResolved) throw new Error("Audio download produced no output file");

    // ── Step 3: Download video at requested height (use selector, not format ID) ─
    // videoFormatId is a height string like "1080", "720", "480", "360"
    const height = videoFormatId ? parseInt(videoFormatId) : 0;
    const videoFormat = (height > 0 && height <= 2160)
      ? `bestvideo[height<=${height}][ext=mp4]/bestvideo[height<=${height}][ext=webm]/bestvideo[height<=${height}]`
      : "bestvideo[ext=mp4]/bestvideo[height<=1080]/bestvideo";

    event.sender.send("yt-progress-video", { percent: 0, downloaded: 0, total: 100 });
    await runYtDlpFile(
      [
        "-f", videoFormat,
        "--no-playlist", "--no-warnings", "--newline",
        "-o", tmpVideo,
        ytUrl,
      ],
      (line) => {
        const pct = parseYtDlpProgress(line);
        if (pct !== null) event.sender.send("yt-progress-video", { percent: pct, downloaded: pct, total: 100 });
      },
    );
    event.sender.send("yt-progress-video", { percent: 100, downloaded: 100, total: 100 });

    // ── Step 4: Merge with ffmpeg ─────────────────────────────────────────────
    event.sender.send("yt-progress-merge", { percent: 0 });
    await runFfmpegMerge(tmpVideo, tmpAudioResolved, tmpMerge);
    event.sender.send("yt-progress-merge", { percent: 100 });

    // ── Step 5: Read merged bytes + clean up ──────────────────────────────────
    const mergedBuf = await fs.readFile(tmpMerge);
    for (const f of [tmpAudioResolved, tmpVideo, tmpMerge]) {
      fs.unlink(f).catch(() => {});
    }

    return { bytes: new Uint8Array(mergedBuf), mimeType: "video/mp4", ext: "mp4", ...meta };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});


// ── Spotify (web player session — no developer account needed) ────────────────

// Rate limiter for Spotify auth IPC: max 5 attempts per window per 15 minutes.
const _spotifyAuthAttempts = new Map(); // webContents.id -> { count, windowStart }
function _checkSpotifyAuthLimit(event) {
  const id = event.sender.id;
  const now = Date.now();
  const entry = _spotifyAuthAttempts.get(id) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > 15 * 60 * 1000) { entry.count = 0; entry.windowStart = now; }
  if (entry.count >= 5) { _spotifyAuthAttempts.set(id, entry); return false; }
  entry.count++;
  _spotifyAuthAttempts.set(id, entry);
  return true;
}

const SP_TOKEN_FILE = path.join(app.getPath("userData"), "spotify-web-token.json");

function spLoadToken() {
  try {
    const raw = fsSync.readFileSync(SP_TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // v2: encrypted with Electron safeStorage (DPAPI on Windows, Keychain on macOS,
    // GNOME Keyring / KWallet on Linux).
    if (parsed.v === 2 && parsed.enc) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(parsed.enc, "base64"));
        return JSON.parse(decrypted);
      } catch {
        // Decryption failed (key rotated / user account changed) — force re-login
        return null;
      }
    }
    // v1 legacy plaintext — migrate to encrypted format immediately
    if (safeStorage.isEncryptionAvailable()) spSaveToken(parsed);
    return parsed;
  } catch { return null; }
}

function spSaveToken(data) {
  let content;
  if (safeStorage.isEncryptionAvailable()) {
    // Encrypt with OS credential store so the file is unreadable without the
    // user's login session (DPAPI on Windows, Keychain on macOS, keyring on Linux).
    const enc = safeStorage.encryptString(JSON.stringify(data));
    content = JSON.stringify({ v: 2, enc: enc.toString("base64") });
  } else {
    // No OS keyring available (e.g. headless Linux) — store plaintext but
    // restrict file permissions so only the owning user can read it.
    content = JSON.stringify(data);
  }
  fsSync.writeFileSync(SP_TOKEN_FILE, content, { encoding: "utf8", mode: 0o600 });
}

// Get a fresh Spotify access token using the stored sp_dc cookie
async function spGetToken(partition = "persist:spotify") {
  const saved = spLoadToken();

  // Also try to get sp_dc from the Electron session if not in file
  let spDc = saved?.spDc;
  if (!spDc) {
    try {
      const { session: electronSession } = require("electron");
      const spotifySes = electronSession.fromPartition(partition, { cache: true });
      const cookies    = await spotifySes.cookies.get({ domain: ".spotify.com", name: "sp_dc" });
      if (cookies.length > 0) {
        spDc = cookies[0].value;
        spSaveToken({ ...(saved ?? {}), spDc });
      }
    } catch {}
  }

  if (!spDc) return null;

  // Reuse unexpired token only when using the default partition
  if (partition === "persist:spotify" && saved?.accessToken && saved?.expiresAt && Date.now() < saved.expiresAt - 60_000) {
    return saved.accessToken;
  }

  // Load open.spotify.com and intercept its OWN /api/token call via Chrome DevTools Protocol.
  // Spotify's app makes this call automatically on page load with all the right headers —
  // we just capture what comes back instead of trying to replicate the call ourselves.
  try {
    const { BrowserWindow, session: electronSession } = require("electron");
    const spotifySes = electronSession.fromPartition(partition, { cache: true });

    // Ensure sp_dc is in the Electron session (covers paste/import-browser cases).
    await spotifySes.cookies.set({
      url: "https://open.spotify.com",
      name: "sp_dc", value: spDc, domain: ".spotify.com", path: "/",
      secure: true, httpOnly: true, sameSite: "no_restriction",
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
    });

    const tokenJson = await new Promise((resolve, reject) => {
      let settled = false;
      const win = new BrowserWindow({
        show: false,
        webPreferences: { session: spotifySes, nodeIntegration: false, contextIsolation: true },
      });
      const dbg = win.webContents.debugger;
      const done = (v) => {
        if (settled) return; settled = true;
        try { dbg.detach(); } catch {}
        try { win.destroy(); } catch {}
        resolve(v);
      };
      const fail = (e) => {
        if (settled) return; settled = true;
        try { dbg.detach(); } catch {}
        try { win.destroy(); } catch {}
        reject(e);
      };

      try { dbg.attach("1.3"); } catch (e) { fail(e); return; }

      // Enable network interception
      dbg.sendCommand("Network.enable").catch(fail);

      dbg.on("message", async (_evt, method, params) => {
        if (method !== "Network.responseReceived") return;
        const url = params.response?.url ?? "";
        if (!url.includes("/api/token")) return;
        console.log("[Spotify] CDP intercepted /api/token call, status:", params.response.status);
        try {
          const body = await dbg.sendCommand("Network.getResponseBody", { requestId: params.requestId });
          console.log("[Spotify] intercepted body:", body.body?.slice(0, 200));
          done(body.body);
        } catch (e) {
          console.log("[Spotify] getResponseBody error:", e.message);
          fail(e);
        }
      });

      win.loadURL("https://open.spotify.com/");
      win.webContents.on("did-fail-load", (_e, code, desc) => {
        if (code !== -3) fail(new Error("Load failed: " + desc));
      });
      // 25s timeout — Spotify's app needs a moment to boot and call /api/token
      setTimeout(() => fail(new Error("Timeout waiting for Spotify /api/token")), 25000);
    });

    const data = JSON.parse(tokenJson);
    if (!data.accessToken) {
      console.log("[Spotify] no accessToken in intercepted response:", JSON.stringify(data).slice(0, 100));
      return null;
    }
    spSaveToken({ spDc, accessToken: data.accessToken, expiresAt: data.accessTokenExpirationTimestampMs ?? (Date.now() + 3600_000) });
    return data.accessToken;
  } catch (e) { console.log("[Spotify] token error:", e.message); return null; }
}

// IPC: Check if logged in to Spotify web
ipcMain.handle("spotify-check", async () => {
  const token = await spGetToken();
  return { loggedIn: !!token };
});

// Try to read sp_dc cookie from installed browsers via Python + sqlite3
async function spotifyExtractCookieFromBrowser() {
  // Chrome on Windows encrypts cookies with DPAPI — impossible to read from an
  // external process without native Windows APIs.  Only attempt this on Linux
  // where Chrome/Firefox store cookies in unencrypted (or GNOME-keyring-wrapped)
  // SQLite databases that Python can open directly.
  if (process.platform !== "linux") return null;

  const tmpDb = path.join(os.tmpdir(), "_splayer_ck.db");
  const script = `
import sqlite3, shutil, os, glob, sys

paths = [
  os.path.expanduser("~/snap/chromium/common/.config/chromium/Default/Cookies"),
  os.path.expanduser("~/.config/chromium/Default/Cookies"),
  os.path.expanduser("~/.config/google-chrome/Default/Cookies"),
  os.path.expanduser("~/.config/brave-browser/Default/Cookies"),
  os.path.expanduser("~/.config/microsoft-edge/Default/Cookies"),
]
# Also check Firefox
for ff in glob.glob(os.path.expanduser("~/.mozilla/firefox/*/cookies.sqlite")):
    paths.append(('firefox', ff))

tmp = ${JSON.stringify(tmpDb)}

for entry in paths:
    try:
        is_ff = isinstance(entry, tuple)
        p = entry[1] if is_ff else entry
        if not os.path.exists(p): continue
        shutil.copy2(p, tmp)
        conn = sqlite3.connect(tmp)
        if is_ff:
            rows = conn.execute("SELECT value FROM moz_cookies WHERE host LIKE '%spotify.com%' AND name='sp_dc'").fetchall()
        else:
            rows = conn.execute("SELECT value, encrypted_value FROM cookies WHERE host_key LIKE '%spotify.com%' AND name='sp_dc'").fetchall()
        conn.close()
        try: os.unlink(tmp)
        except: pass
        if rows:
            val = rows[0][0]
            if val and not val.startswith('v1'):
                if isinstance(val, bytes) and len(val) > 3 and val[:3] == b'v10':
                    continue  # DPAPI-encrypted — skip
            if val:
                print(val)
                sys.exit(0)
    except Exception:
        continue
sys.exit(1)
`;
  return new Promise((resolve) => {
    const proc = spawn("python3", ["-c", script], { env: { ...process.env } });
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    proc.on("error", () => resolve(null));
  });
}

// IPC: Open Spotify login popup — captures sp_dc cookie
ipcMain.handle("spotify-login", (event) => {
  if (!_checkSpotifyAuthLimit(event)) return { error: "Too many login attempts. Please wait 15 minutes and try again." };
  return new Promise((resolve) => {
  const { BrowserWindow, session: electronSession } = require("electron");
  const spotifySes = electronSession.fromPartition("persist:spotify", { cache: true });
  const spotifyUA = process.platform === "win32"
    ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  spotifySes.setUserAgent(spotifyUA);

  const win = new BrowserWindow({
    width: 520, height: 720, title: "Log in to Spotify",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, session: spotifySes },
  });

  win.loadURL("https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F");

  let settled = false;
  async function finish(result) {
    if (settled) return; settled = true;
    try { if (!win.isDestroyed()) win.close(); } catch {}
    resolve(result);
  }

  async function checkForCookie() {
    const cookies = await spotifySes.cookies.get({ domain: ".spotify.com", name: "sp_dc" });
    if (cookies.length === 0) return false;
    const spDc = cookies[0].value;
    spSaveToken({ spDc });
    // Verify the cookie actually works before reporting success
    const token = await spGetToken();
    if (token) { finish({ success: true }); return true; }
    // Cookie found but token fetch failed — save anyway and let user proceed
    finish({ success: true });
    return true;
  }

  win.webContents.on("did-navigate", async (_e, url) => {
    if (url.startsWith("https://open.spotify.com")) await checkForCookie();
  });
  win.webContents.on("did-navigate-in-page", async (_e, url) => {
    if (url.startsWith("https://open.spotify.com")) await checkForCookie();
  });
  win.on("closed", () => finish({ error: "Login cancelled" }));
  });
});

// IPC: Extract sp_dc from system browser (for Google-linked accounts)
ipcMain.handle("spotify-import-browser", async (event) => {
  if (!_checkSpotifyAuthLimit(event)) return { error: "Too many login attempts. Please wait 15 minutes and try again." };
  const spDc = await spotifyExtractCookieFromBrowser();
  if (spDc) { spSaveToken({ spDc }); return { success: true }; }
  return { error: "Could not find Spotify cookie. Make sure you are logged into Spotify in Chrome, Chromium, or Firefox." };
});

// IPC: Save sp_dc directly (manual paste fallback)
ipcMain.handle("spotify-set-cookie", (event, { spDc }) => {
  if (!_checkSpotifyAuthLimit(event)) return { error: "Too many login attempts. Please wait 15 minutes and try again." };
  if (!spDc?.trim() || spDc.trim().length > 512) return { error: "Invalid cookie" };
  spSaveToken({ spDc: spDc.trim() });
  return { success: true };
});

// IPC: Logout — clear stored token
ipcMain.handle("spotify-logout", () => {
  try { fsSync.unlinkSync(SP_TOKEN_FILE); } catch {}
  return { success: true };
});

// IPC: Fetch track list — tries two endpoints in order so we avoid the
// rate-limited /v1/playlists/{id}/tracks path.
ipcMain.handle("spotify-fetch", async (_event, { url }) => {
  const token = await spGetToken();
  if (!token) return { error: "Not logged in to Spotify. Please log in first." };

  // Accept all Spotify URL formats:
  //   https://open.spotify.com/track/xxx
  //   https://open.spotify.com/intl-es/track/xxx   (regional)
  //   spotify:track:xxx                             (URI format)
  const idMatch =
    url.match(/spotify\.com\/(?:[a-z]{2,5}-[a-z]{2,5}\/)?(?:[^?/#]*\/)?(playlist|album|track)\/([A-Za-z0-9]+)/) ||
    url.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/);
  if (!idMatch) return { error: "Unrecognized Spotify URL. Paste a playlist, album, or track link." };
  const [, type, id] = idMatch;

  const authHdr   = { Authorization: `Bearer ${token}` };
  const clientHdr = { ...authHdr, "App-Platform": "WebPlayer", "Spotify-App-Version": "1.0.0" };

  function mapPublicTracks(items) {
    return (items ?? [])
      .filter((i) => i?.track?.name)
      .map((i) => ({
        id:         i.track.id ?? "",
        name:       i.track.name,
        artists:    (i.track.artists ?? []).map((a) => a.name).join(", "),
        durationMs: i.track.duration_ms ?? 0,
      }));
  }

  try {
    // ── Albums and single tracks only use the public API ──────────────────
    if (type === "album") {
      const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, { headers: authHdr });
      console.log("[spotify-fetch] /v1/albums status:", res.status);
      if (!res.ok) return { error: `Spotify API error ${res.status}` };
      const data = await res.json();
      return {
        playlistName: data.name ?? "Spotify Album",
        tracks: (data.tracks?.items ?? []).filter((t) => t?.name).map((t) => ({
          id: t.id ?? "", name: t.name,
          artists: (t.artists ?? []).map((a) => a.name).join(", "),
          durationMs: t.duration_ms ?? 0,
        })),
      };
    }

    if (type === "track") {
      // Skip api.spotify.com (rate-limited at 429) — use the same oembed + og:description
      // fallback that already works for playlists.
      const trackUrl    = `https://open.spotify.com/track/${id}`;
      const htmlHeaders = { "User-Agent": "Mozilla/5.0", Accept: "text/html" };

      // oembed → track name (strips " - Artist" suffix if present)
      let name = "";
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=${trackUrl}`);
        if (r.ok) {
          const j   = await r.json();
          const raw = j?.title ?? "";
          const dash = raw.indexOf(" - ");
          name = dash !== -1 ? raw.slice(0, dash).trim() : raw.trim();
        }
      } catch {}

      // og:description scrape → artist ("Artist · Album · Year" or similar)
      let artists = "";
      try {
        const r = await fetch(trackUrl, { headers: htmlHeaders });
        if (r.ok) {
          const html = await r.text();
          const m = html.match(/og:description[^>]+content="([^"]+)"/);
          console.log("[spotify-fetch] single track og:description:", m?.[1]);
          if (m) artists = m[1].split("·")[0].trim();
        }
      } catch {}

      if (!name) return { error: "Could not retrieve track info. The track may be unavailable." };
      const singleTrack = { id, name, artists, durationMs: 0 };
      return { playlistName: `${name}${artists ? " — " + artists : ""}`, total: 1, tracks: [singleTrack] };
    }

    // ── Playlist: option 1 — full playlist object (first 100 tracks embedded) ──
    console.log("[spotify-fetch] trying /v1/playlists/" + id);
    const r1 = await fetch(`https://api.spotify.com/v1/playlists/${id}`, { headers: authHdr });
    console.log("[spotify-fetch] /v1/playlists status:", r1.status);

    if (r1.ok) {
      const data = await r1.json();
      return { playlistName: data.name ?? "Spotify Playlist", tracks: mapPublicTracks(data.tracks?.items) };
    }

    if (r1.status !== 429) {
      const body = await r1.text().catch(() => "");
      return { error: `Spotify API error ${r1.status}: ${body.slice(0, 120)}` };
    }

    // ── Playlist: option 2 — spclient internal API (not rate-limited like public API) ──
    console.log("[spotify-fetch] /v1/playlists 429 — trying spclient...");
    const r2 = await fetch(`https://spclient.wg.spotify.com/playlist/v2/playlist/${id}`, {
      headers: { ...clientHdr, Accept: "application/json" },
    });
    console.log("[spotify-fetch] spclient status:", r2.status);

    if (!r2.ok) {
      const body = await r2.text().catch(() => "");
      console.log("[spotify-fetch] spclient body:", body.slice(0, 400));
      return { error: `Rate limited (429) and spclient also failed (${r2.status}). Try again later.` };
    }

    const sc = await r2.json();
    const playlistName = sc?.attributes?.name ?? "Spotify Playlist";
    let scItems = sc?.contents?.items ?? sc?.items ?? [];

    // Paginate if spclient truncated the response
    let truncated = sc?.contents?.truncated ?? false;
    let offset    = scItems.length;
    while (truncated) {
      console.log(`[spotify-fetch] spclient truncated at ${offset}, fetching more...`);
      const rPage = await fetch(
        `https://spclient.wg.spotify.com/playlist/v2/playlist/${id}?offset=${offset}&limit=100`,
        { headers: { ...clientHdr, Accept: "application/json" } }
      );
      if (!rPage.ok) break;
      const page = await rPage.json();
      const pageItems = page?.contents?.items ?? [];
      scItems   = scItems.concat(pageItems);
      truncated = page?.contents?.truncated ?? false;
      offset   += pageItems.length;
      if (!pageItems.length) break;
    }
    console.log(`[spotify-fetch] total spclient items: ${scItems.length}`);

    // spclient gives URIs only — extract the base62 track IDs
    const ids = scItems
      .map((item) => (item?.uri ?? "").split(":").pop())
      .filter(Boolean);

    if (!ids.length) return { error: "spclient returned no track URIs." };
    console.log(`[spotify-fetch] ${ids.length} track IDs to resolve`);

    const htmlHeaders = { "User-Agent": "Mozilla/5.0", Accept: "text/html" };

    // Fetch track name (oembed) and artist (og:description scrape) in parallel per track
    const results = await Promise.all(ids.map(async (id62, idx) => {
      const trackUrl = `https://open.spotify.com/track/${id62}`;

      // oembed → track name
      let name = "";
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=${trackUrl}`);
        if (r.ok) {
          const j = await r.json();
          const raw = j?.title ?? "";
          const dash = raw.indexOf(" - ");
          name = dash !== -1 ? raw.slice(0, dash).trim() : raw.trim();
        }
      } catch {}

      // og:description scrape → artist ("Song · Artist · Album")
      let artists = "";
      try {
        const r = await fetch(trackUrl, { headers: htmlHeaders });
        if (r.ok) {
          const html = await r.text();
          const m = html.match(/og:description[^>]+content="([^"]+)"/);
          if (idx === 0) console.log("[og:description] first track:", m?.[1]);
          if (m) {
            // format is "Artist · Album · Song · Year" — first segment is the artist
            artists = m[1].split("·")[0].trim();
          }
        }
      } catch {}

      if (!name) return null;
      return { id: id62, name, artists, durationMs: 0 };
    }));

    const tracks = results.filter(Boolean);
    if (!tracks.length) return { error: "No tracks returned from spclient metadata." };
    return { playlistName, tracks };

  } catch (e) {
    return { error: "Fetch failed: " + e.message };
  }
});

// spotDL helpers (for downloading)
function getSpotDLPath() {
  const candidates = process.platform === "win32"
    ? ["spotdl", path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Scripts", "spotdl.exe")]
    : ["spotdl", path.join(os.homedir(), ".local", "bin", "spotdl"), "/usr/local/bin/spotdl", "/usr/bin/spotdl"];
  for (const c of candidates) { try { if (c === "spotdl" || fsSync.existsSync(c)) return c; } catch {} }
  return "spotdl";
}
function spotdlEnv() {
  const extraDir = process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Scripts")
    : path.join(os.homedir(), ".local", "bin");
  return { ...process.env, PATH: `${extraDir}${path.delimiter}${process.env.PATH || ""}` };
}

// IPC: Check spotDL is installed
ipcMain.handle("spotdl-check", () => new Promise((resolve) => {
  const proc = spawn(getSpotDLPath(), ["--version"], { env: spotdlEnv() });
  proc.on("close", (code) => resolve({ installed: code === 0 }));
  proc.on("error", ()     => resolve({ installed: false }));
}));

// Normalize Arabic text for fuzzy title matching.
// Strips tatweel, harakat, and collapses alef/hamza/ya variants that differ
// freely between Spotify metadata and YouTube video titles.
function _normalizeArabic(s) {
  return s
    .replace(/ـ/g, "")            // tatweel / kashida stretching
    .replace(/[ً-ْ]/g, "")  // harakat: fatha, kasra, damma, sukun, shadda, etc.
    .replace(/[أإآ]/g, "ا")       // alef + hamza/madda variants → plain alef
    .replace(/ؤ/g, "و")           // waw with hamza → plain waw
    .replace(/ئ/g, "ي")           // ya with hamza → plain ya
    .replace(/ى/g, "ي")           // alef maqsura → ya (interchangeable in many words)
    .toLowerCase();
}

// IPC: Download batch — ytsearch5 candidates, pick best title match, download exact video
ipcMain.handle("spotdl-download-batch", async (event, { tracks, outputDir, format }) => {
  if (!Array.isArray(tracks) || tracks.length > _MAX_BATCH_TRACKS)
    return { error: "Invalid or oversized track list" };
  const fmt = _ALLOWED_AUDIO_FMTS.has(format) ? format : "mp3";
  const outDir = (outputDir && _noTraversal(outputDir)) ? outputDir : os.tmpdir();
  console.log("[dl] handler entered — tracks:", (tracks ?? []).length, "outDir:", outDir);
  try { fsSync.mkdirSync(outDir, { recursive: true }); } catch {}
  const audioExts   = /\.(mp3|m4a|opus|flac|ogg|wav)$/i;
  const ytBin       = getYtDlpPath();
  const savedPaths  = [];
  const failedTracks = [];  // tracks that couldn't be downloaded

  async function runSearch(q) {
    let out = "";
    await new Promise((res) => {
      const proc = spawn(ytBin,
        buildYtDlpArgs([q, "--flat-playlist", "--dump-json", "--no-warnings"], null),
        { env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
      proc.stdout.on("data", (d) => { out += d.toString(); });
      proc.stderr.on("data", (d) => console.log("[dl search stderr]", d.toString().trim()));
      proc.on("close", res);
      proc.on("error", () => res());
    });
    return out.split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  for (const track of (tracks ?? [])) {
    const name    = String(track.name   ?? "").trim();
    const artist  = String(track.artist ?? "").trim();
    const outTmpl = path.join(outDir, "%(title)s.%(ext)s");

    // Step 1: search for top-5 candidates as JSON (no download).
    // "official audio" nudges YouTube toward studio recordings over live performances.
    const query = `ytsearch5:${artist} ${name} official audio`;
    console.log(`[dl] searching: "${query}"`);

    let candidates = await runSearch(query);

    if (!candidates.length) {
      console.log(`[dl] no YouTube candidates for "${name}"`);
      failedTracks.push({ name, artist, reason: "No YouTube match found" });
      continue;
    }

    // Step 2: score each candidate — how many words from the track name appear in its title?
    // Normalize Arabic text first: strip tatweel (ـ) and harakat so "معاك" matches "معـاك".
    const normName = _normalizeArabic(name);
    const words    = normName.split(/\s+/).filter(Boolean);
    const score    = (r) => words.filter((w) => _normalizeArabic(r.title ?? "").includes(w)).length;

    let best      = candidates.reduce((a, b) => score(b) > score(a) ? b : a);
    let bestScore = score(best);

    // Step 2b: if every candidate scored 0 (e.g. fully romanized results for an Arabic title),
    // retry with just the track name — no artist, no "official audio" — to widen the net.
    if (bestScore === 0) {
      const fallbackQuery = `ytsearch3:${name}`;
      console.log(`[dl] all candidates scored 0, fallback search: "${fallbackQuery}"`);
      const fallbackCandidates = await runSearch(fallbackQuery);
      if (fallbackCandidates.length) {
        const fbBest = fallbackCandidates.reduce((a, b) => score(b) > score(a) ? b : a);
        if (score(fbBest) > bestScore) {
          best      = fbBest;
          bestScore = score(fbBest);
          console.log(`[dl] fallback improved score to ${bestScore}/${words.length}`);
        }
        // Merge fallback into candidates pool so the best of both sets is used
        candidates = [...candidates, ...fallbackCandidates];
        best = candidates.reduce((a, b) => score(b) > score(a) ? b : a);
        bestScore = score(best);
      }
    }

    console.log(`[dl] best match: "${best.title}" (score ${bestScore}/${words.length})`);

    // Step 3: download with up to 2 retries
    const videoUrl = best.webpage_url ?? best.url ?? `https://www.youtube.com/watch?v=${best.id}`;
    let downloaded = false;
    let lastError  = "";

    for (let attempt = 1; attempt <= 3 && !downloaded; attempt++) {
      if (attempt > 1) console.log(`[dl] retry ${attempt}/3 for "${name}"`);
      await new Promise((res) => {
        const args = [videoUrl, "-x", "--audio-format", fmt, "-o", outTmpl,
          "--no-playlist", "--no-warnings", "--print", "after_move:filepath"];
        const proc = spawn(ytBin, args, { env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
        let printedPath = "";
        let stderrLog   = "";
        proc.stdout.on("data", (d) => {
          const line = d.toString().trim();
          console.log("[dl stdout]", line);
          if (line && !printedPath) printedPath = line;
        });
        proc.stderr.on("data", (d) => {
          const t = d.toString().trim();
          if (t) { console.log("[dl stderr]", t); stderrLog += t + "\n"; }
        });
        proc.on("close", (code) => {
          const fileExists = printedPath ? fsSync.existsSync(printedPath) : false;
          console.log(`[dl] attempt ${attempt} exit ${code}, path: "${printedPath}", exists: ${fileExists}`);
          if (fileExists) {
            downloaded = true;
            savedPaths.push(printedPath);
            event.sender.send("spotdl-track-done", { name, skipped: false });
          } else {
            lastError = stderrLog.split("\n").filter(l => l.toLowerCase().includes("error")).pop()
              ?? stderrLog.trim().split("\n").pop()
              ?? `exit code ${code}`;
          }
          res();
        });
        proc.on("error", (e) => { lastError = e.message; res(); });
      });
    }

    if (!downloaded) {
      console.log(`[dl] FAILED after 3 attempts: "${name}" by "${artist}" — ${lastError}`);
      failedTracks.push({ name, artist, reason: lastError || "yt-dlp failed" });
    }
  }

  if (failedTracks.length) {
    console.log(`[dl] ${failedTracks.length} track(s) failed:\n` +
      failedTracks.map(f => `  • ${f.name} by ${f.artist} — ${f.reason}`).join("\n"));
  }

  const newFiles = savedPaths
    .filter((fp) => fsSync.existsSync(fp))
    .map((fp) => {
      // Send bytes as a plain Array so Electron IPC serialises it correctly;
      // the renderer rebuilds it with new Uint8Array(f.bytes)
      const ext  = path.extname(fp).slice(1).toLowerCase();
      const mime = ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "audio/mpeg";
      // Don't send bytes over IPC — large arrays cause IPC failures on Windows.
      // Renderer reads the file from disk via fetch('file:///...') instead.
      return { fileName: path.basename(fp), filePath: fp, ext, mimeType: mime };
    });
  console.log("[dl] new files:", newFiles.map((f) => f.filePath));
  return { success: true, files: newFiles, failed: failedTracks };
});



// ── Delete a file from disk ───────────────────────────────────────────────────
ipcMain.handle("delete-file", async (_event, filePath) => {
  console.log("[delete-file] raw:", filePath);

  if (!filePath || typeof filePath !== "string") {
    console.log("[delete-file] no valid path received");
    return { success: false, error: "No file path provided" };
  }

  // Normalise file:// URL → real disk path
  let realPath = filePath;
  if (filePath.startsWith("file://")) {
    try {
      const { fileURLToPath } = require("url");
      realPath = fileURLToPath(filePath);
    } catch {
      realPath = decodeURIComponent(filePath.replace(/^file:\/\/\//, ""));
      if (process.platform === "win32") realPath = realPath.replace(/\//g, "\\");
    }
  }

  console.log("[delete-file] resolved:", realPath);
  if (!_isAllowedPath(realPath))
    return { success: false, error: "Invalid file path" };
  try {
    await fs.unlink(realPath);
    console.log("[delete-file] success:", realPath);
    return { success: true };
  } catch (err) {
    console.log("[delete-file] error:", String(err.message ?? err));
    return { success: false, error: String(err.message ?? err) };
  }
});

// ── IPC: Copy a file to a destination path ────────────────────────────────────
ipcMain.handle("copy-file", async (_event, { src, dst }) => {
  if (!_isAllowedPath(src) || !_isAllowedPath(dst))
    return { success: false, error: "Invalid file path" };
  try {
    fsSync.mkdirSync(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
    console.log("[copy-file]", src, "→", dst);
    return { success: true };
  } catch (err) {
    console.log("[copy-file] error:", String(err));
    return { success: false, error: String(err) };
  }
});

// ── IPC: Show file in system file manager ─────────────────────────────────────
ipcMain.handle("show-in-folder", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") return { success: false, error: "No path" };
  let realPath = filePath;
  if (filePath.startsWith("file://")) {
    try { const { fileURLToPath } = require("url"); realPath = fileURLToPath(filePath); }
    catch { return { success: false, error: "Invalid file URL" }; }
  }
  if (!_isAllowedPath(realPath)) return { success: false, error: "Invalid file path" };
  shell.showItemInFolder(realPath);
  return { success: true };
});

// ── IPC: Search for a track file by name across candidate dirs ────────────────
ipcMain.handle("find-track-path", async (_event, { filename, extraDirs }) => {
  // Reject paths — filename must be a bare name with no directory components
  if (!_isStr(filename, 512) || path.basename(filename) !== filename)
    return { found: false };
  const safeExtraDirs = Array.isArray(extraDirs) ? extraDirs.filter(_noTraversal) : [];
  const candidates = [
    path.join(os.homedir(), "Music", "Splayer", "Downloads"),
    path.join(os.homedir(), "Music", "Splayer"),
    path.join(os.homedir(), "Music", "music dowload"),  // legacy download folder
    path.join(os.homedir(), "Music", "music"),
    path.join(os.homedir(), "Music"),
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Namida", "Downloads"),
    ...(process.platform === "win32" ? [
      "C:\\Namida",
      "C:\\Namida\\Downloads",
      "C:\\Namida\\M3U Playlists",
      "C:\\Namida\\Backups",
    ] : []),
    ...safeExtraDirs,
  ];
  for (const dir of candidates) {
    try {
      const fp = path.join(dir, filename);
      if (fsSync.existsSync(fp)) {
        console.log("[find-track-path] found:", fp);
        return { found: true, path: fp };
      }
    } catch {}
  }
  console.log("[find-track-path] not found:", filename, "in", candidates.length, "dirs");
  return { found: false };
});

// ── IPC: Global shortcuts ─────────────────────────────────────────────────────
ipcMain.handle("register-global-shortcuts", (_event, shortcuts) => {
  if (!shortcuts || typeof shortcuts !== "object" || Array.isArray(shortcuts)) return;
  const entries = Object.entries(shortcuts);
  if (entries.length > 10) return;
  for (const [, accel] of entries) {
    if (typeof accel === "string" && accel.length > 50) return;
  }
  registerShortcuts(shortcuts);
});

// ── IPC: Tray & close-behavior ────────────────────────────────────────────────
ipcMain.handle("set-close-behavior", (_event, behavior) => {
  if (behavior === "tray" || behavior === "close") {
    closeBehavior = behavior;
  }
});

// ── IPC: Start on boot (login item) ──────────────────────────────────────────
ipcMain.handle("get-login-item-settings", () => {
  try {
    return { openAtLogin: app.getLoginItemSettings().openAtLogin };
  } catch (e) {
    console.warn("[LoginItem] getLoginItemSettings failed:", e.message);
    return { openAtLogin: false };
  }
});

ipcMain.handle("set-login-item-settings", (_event, { openAtLogin }) => {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) });
    console.log("[LoginItem] openAtLogin →", openAtLogin);
    return { success: true };
  } catch (e) {
    console.warn("[LoginItem] setLoginItemSettings failed:", e.message);
    return { success: false, error: e.message };
  }
});


ipcMain.handle('download-art', async (e, { key, url, customFolder }) => {
  if (!_isSafeRemoteUrl(url)) return url;
  if (!_isStr(key, 512)) return url;
  if (customFolder && !_noTraversal(customFolder)) return url;
  try {
    const artFolder = customFolder || path.join(os.homedir(), 'Music', 'splayer_art');
    if (!fsSync.existsSync(artFolder)) fsSync.mkdirSync(artFolder, { recursive: true });
    const fileName = `${key.replace(/[^a-z0-9]/gi, '_')}.jpg`;
    const filePath = path.join(artFolder, fileName);
    if (fsSync.existsSync(filePath)) return `file://${filePath}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    fsSync.writeFileSync(filePath, Buffer.from(buffer));
    return `file://${filePath}`;
  } catch (err) { return url; }
});

ipcMain.on("update-tray-state", (_event, state) => {
  nowPlayingState = {
    title:     String(state.title     ?? "Nothing playing"),
    artist:    String(state.artist    ?? ""),
    isPlaying: Boolean(state.isPlaying),
  };
  // Keep trayVolume in sync with the renderer's current volume (0-100)
  if (typeof state.volume === "number") {
    trayVolume = Math.round(Math.max(0, Math.min(100, state.volume)));
  }
  updateTray();
});

// ── Library auto-scan ─────────────────────────────────────────────────────────
// Cancellation: each scan gets a token; cancel-scan bumps the counter
let _scanToken = 0;

ipcMain.on("cancel-scan", () => { _scanToken++; });

ipcMain.handle("scan-library", async (event, userFolders) => {
  const fsp = require("fs/promises");
  const AUDIO_EXTS = new Set([".mp3", ".flac", ".wav", ".m4a", ".m4b", ".ogg", ".aac", ".opus", ".wma"]);

  let roots;
  if (Array.isArray(userFolders) && userFolders.length > 0) {
    roots = userFolders.filter(_noTraversal);
  } else {
    roots = [app.getPath("music")];
  }

  const MIN_FILE_SIZE = 100 * 1024;
  const GAME_MIN_FILE_SIZE = 500 * 1024;
  const MAX_DEPTH = 5;
  const SKIP_DIRS = new Set([
    // Universal
    "node_modules", ".git",
    // Windows-only system directories
    ...(process.platform === "win32" ? [
      "Windows", "System32", "SysWOW64",
      "Program Files", "Program Files (x86)",
      "$Recycle.Bin", "AppData", "ProgramData",
    ] : []),
    // Linux/macOS system directories
    ...(process.platform !== "win32" ? [
      ".cache", ".local", ".config",
      ".mozilla", ".thunderbird", ".var",
      "snap", "flatpak",
    ] : []),
  ]);

  const GAME_SFX_PATTERNS = ["sfx_", "sound_", "dialogue_", "voice_", "effect_", "ambient_", "ui_", "beep", "click", "hit"];
  function isGameSfxFile(name) {
    const lower = name.toLowerCase();
    return GAME_SFX_PATTERNS.some(p => lower.includes(p));
  }
  function isGameRoot(rootPath) {
    const p = rootPath.toLowerCase().replace(/\\/g, "/");
    return p.includes("steamapps") || p.includes("gog games") ||
           p.includes("epic games") || p.includes("xboxgames");
  }

  const myToken = ++_scanToken;
  const found = [];
  let lastProgressMs = 0;

  function sendProgress(done) {
    try {
      if (!event.sender.isDestroyed())
        event.sender.send("scan-progress", { found: found.length, done });
    } catch (_) {}
  }

  async function scanDir(dir, isGame, depth) {
    if (_scanToken !== myToken) return;
    if (depth > MAX_DEPTH) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch (_) { return; }
    for (const e of entries) {
      if (_scanToken !== myToken) return;
      if (e.name.startsWith(".")) continue;          // hidden files/folders
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name === "common" && path.basename(dir) === "steamapps") continue;
        await scanDir(full, isGame, depth + 1);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          try {
            const st = await fsp.stat(full);
            const minSize = isGame ? GAME_MIN_FILE_SIZE : MIN_FILE_SIZE;
            if (st.size < minSize) continue;
            if (isGame && isGameSfxFile(e.name)) continue;
            found.push({ path: full, name: e.name, size: st.size });
            // Throttled progress — send at most every 150 ms
            const now = Date.now();
            if (now - lastProgressMs >= 150) { lastProgressMs = now; sendProgress(false); }
          } catch (_) {}
        }
      }
    }
  }

  for (const root of roots) {
    if (_scanToken !== myToken) break;
    await scanDir(root, isGameRoot(root), 0);
  }

  const cancelled = _scanToken !== myToken;
  sendProgress(true);
  return cancelled ? [] : found;
});

ipcMain.handle("read-file", async (_event, filePath) => {
  if (!_isAllowedPath(filePath))
    throw new Error("Invalid file path");
  const buf = await fs.readFile(filePath);
  return { bytes: buf, name: path.basename(filePath), size: buf.length };
});

ipcMain.handle("show-window", () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

// ── Window control IPC (used by custom Windows titlebar) ──────────────────────
ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on("window-close", () => {
  if (!mainWindow) return;
  if (!isQuitting && closeBehavior === "tray") {
    mainWindow.hide();
  } else {
    isQuitting = true;
    app.quit();
  }
});

// ── App folder structure ──────────────────────────────────────────────────────
const APP_DIRS = {
  root:      path.join(os.homedir(), "Music", "Splayer"),
  downloads: path.join(os.homedir(), "Music", "Splayer", "Downloads"),
  backups:   path.join(os.homedir(), "Music", "Splayer", "Backups"),
};

function ensureAppDirs() {
  for (const dir of Object.values(APP_DIRS)) {
    try { fsSync.mkdirSync(dir, { recursive: true }); } catch {}
  }
}

ipcMain.handle("get-app-paths", () => APP_DIRS);

ipcMain.handle("open-external", (_event, url) => {
  if (_isSafeRemoteUrl(url)) shell.openExternal(url);
});

// ── OS Media Integration (MPRIS on Linux, SMTC on Windows) ───────────────────

let _osMediaEnabled = true;  // can be toggled from Settings

// Temp file path used to pass album art to MPRIS / SMTC via file:// URL
const OS_MEDIA_ART_PATH = path.join(os.tmpdir(), "splayer-os-art.jpg");

// Interpolated-position helpers so D-Bus clients get a live position
// without us needing to push every-second updates from the renderer.
let _osLastPositionUs  = 0;   // microseconds
let _osLastPositionAt  = 0;   // Date.now() when that snapshot was taken
let _osIsPlaying       = false;

function _osCurrentPositionUs() {
  if (!_osIsPlaying) return _osLastPositionUs;
  const elapsed = Date.now() - _osLastPositionAt; // ms
  return Math.max(0, _osLastPositionUs + elapsed * 1000);
}

// ── MPRIS (Linux only) ────────────────────────────────────────────────────────
let _mprisPlayer = null;

if (process.platform === "linux") {
  try {
    const mpris = require("mpris-service");
    _mprisPlayer = mpris({
      name:                 "Splayer",
      identity:             "Splayer",
      supportedUriSchemes:  ["file"],
      supportedMimeTypes:   ["audio/mpeg", "audio/flac", "audio/wav", "audio/x-m4a", "audio/ogg"],
      supportedInterfaces:  ["player"],
    });

    _mprisPlayer.getPosition = () => _osCurrentPositionUs();

    const _mprisRelay = (action) => {
      if (!_osMediaEnabled || !mainWindow) return;
      mainWindow.webContents.send("tray-action", action);
    };
    _mprisPlayer.on("play",      () => _mprisRelay("play"));
    _mprisPlayer.on("pause",     () => _mprisRelay("pause"));
    _mprisPlayer.on("playpause", () => _mprisRelay("play-pause"));
    _mprisPlayer.on("stop",      () => _mprisRelay("stop"));
    _mprisPlayer.on("next",      () => _mprisRelay("next"));
    _mprisPlayer.on("previous",  () => _mprisRelay("prev"));
    _mprisPlayer.on("seek",      (offsetUs) => {
      if (!_osMediaEnabled || !mainWindow) return;
      const newSec = Math.max(0, (_osCurrentPositionUs() + offsetUs) / 1e6);
      mainWindow.webContents.send("tray-action", { type: "seek", position: newSec });
    });

    _mprisPlayer.playbackStatus = "Stopped";
    console.log("[MPRIS] Service started");
  } catch (e) {
    console.warn("[MPRIS] Failed to start:", e.message);
    _mprisPlayer = null;
  }
}

// ── SMTC (Windows only) ───────────────────────────────────────────────────────
// Requires @jellyfin/windows-media-transport-controls (optional dependency).
// Install on Windows with: npm install @jellyfin/windows-media-transport-controls
let _smtcPlayer = null;

if (process.platform === "win32") {
  try {
    const wmc = require("@jellyfin/windows-media-transport-controls");
    wmc.initSMTC((event) => {
      if (!_osMediaEnabled || !mainWindow) return;
      const t = (event.type || event).toLowerCase();
      const actionMap = { play: "play", pause: "pause", next: "next",
                          previous: "prev", stop: "stop", playpause: "play-pause" };
      const action = actionMap[t];
      if (action) mainWindow.webContents.send("tray-action", action);
    });
    _smtcPlayer = wmc;
    console.log("[SMTC] Service started");
  } catch (e) {
    console.warn("[SMTC] Not available (install @jellyfin/windows-media-transport-controls on Windows):", e.message);
    _smtcPlayer = null;
  }
}

function _updateOsMediaState(state) {
  if (!_osMediaEnabled) return;
  const { title, artist, album, isPlaying, durationSecs, positionSecs, coverDataUrl } = state;

  // Update position interpolation vars
  _osIsPlaying       = !!isPlaying;
  _osLastPositionUs  = Math.round((positionSecs || 0) * 1e6);
  _osLastPositionAt  = Date.now();

  // Save album art to temp file so MPRIS/SMTC can load it via file:// URL
  let artUrl = "";
  if (coverDataUrl) {
    try {
      const m = coverDataUrl.match(/^data:image\/\w+;base64,(.+)$/s);
      if (m) {
        fsSync.writeFileSync(OS_MEDIA_ART_PATH, Buffer.from(m[1], "base64"));
        artUrl = process.platform === "win32"
          ? `file:///${OS_MEDIA_ART_PATH.replace(/\\/g, "/")}`
          : `file://${OS_MEDIA_ART_PATH}`;
      }
    } catch (_) {}
  }

  // ── Update MPRIS ──────────────────────────────────────────────────────────
  if (_mprisPlayer) {
    try {
      _mprisPlayer.playbackStatus = isPlaying ? "Playing" : "Paused";
      _mprisPlayer.metadata = {
        "mpris:trackid": _mprisPlayer.objectPath("track/1"),
        "mpris:length":  Math.round((durationSecs || 0) * 1e6),
        "xesam:title":   title  || "",
        "xesam:artist":  [artist || ""],
        "xesam:album":   album  || "",
        "mpris:artUrl":  artUrl,
      };
    } catch (e) { console.warn("[MPRIS] metadata update failed:", e.message); }
  }

  // ── Update SMTC ───────────────────────────────────────────────────────────
  if (_smtcPlayer) {
    try {
      _smtcPlayer.updateSMTC({
        title:          title  || "",
        artist:         artist || "",
        albumTitle:     album  || "",
        albumArtist:    artist || "",
        thumbnail:      artUrl,
        playbackStatus: isPlaying ? "Playing" : "Paused",
      });
    } catch (e) { console.warn("[SMTC] update failed:", e.message); }
  }
}

ipcMain.on("update-os-media", (_event, state) => {
  _updateOsMediaState(state);
});

ipcMain.on("set-os-media-enabled", (_event, enabled) => {
  _osMediaEnabled = Boolean(enabled);
  if (!_osMediaEnabled) {
    try { if (_mprisPlayer) _mprisPlayer.playbackStatus = "Stopped"; } catch (_) {}
    try { if (_smtcPlayer)  _smtcPlayer.updateSMTC?.({ playbackStatus: "Stopped" }); } catch (_) {}
  }
  console.log("[OsMedia] enabled:", _osMediaEnabled);
});

// ── Discord Rich Presence ─────────────────────────────────────────────────────
// Replace SPLAYER_DISCORD_CLIENT_ID with your application's ID from
// https://discord.com/developers/applications once you have created it.
// Upload art assets under "Rich Presence → Art Assets":
//   • "splayer_logo"  – the Splayer icon (large image)
//   • "playing"       – a small play icon  (small image, optional)
//   • "paused"        – a small pause icon (small image, optional)
const DISCORD_CLIENT_ID = "1505306091443978270";

let _drpcClient      = null;
let _drpcReady       = false;
let _drpcEnabled     = true;   // toggled via IPC from settings
let _drpcLastState   = null;   // cached so reconnect can re-apply presence
let _drpcRetryTimer  = null;
let _drpcConnecting  = false;  // guard against concurrent connect attempts

function _drpcScheduleReconnect() {
  if (_drpcRetryTimer) return;
  _drpcRetryTimer = setTimeout(() => { _drpcRetryTimer = null; if (_drpcEnabled) _drpcConnect(); }, 30_000);
}

function _drpcSetActivity(state) {
  if (!_drpcReady || !_drpcClient || !_drpcEnabled) return;
  const { title, artist, isPlaying, duration, position } = state || {};

  if (!title) {
    _drpcClient.clearActivity().catch(() => {});
    return;
  }

  const activity = {
    details:        title.slice(0, 128),
    state:          (artist || "Splayer").slice(0, 128),
    largeImageKey:  "splayer_logo",
    largeImageText: "Splayer",
    smallImageKey:  isPlaying ? "playing" : "paused",
    smallImageText: isPlaying ? "Playing" : "Paused",
    instance:       false,
  };

  if (isPlaying && duration > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    activity.startTimestamp = nowSec - Math.floor(position || 0);
    activity.endTimestamp   = activity.startTimestamp + Math.floor(duration);
  }

  const activeClient = _drpcClient;
  activeClient.setActivity(activity).catch((e) => {
    console.log("[Discord RPC] setActivity failed:", e.message);
    if (_drpcClient === activeClient) {
      _drpcReady = false;
      _drpcClient = null;
      try { activeClient.destroy(); } catch {}
      _drpcScheduleReconnect();
    }
  });
}

function _drpcConnect() {
  if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID === "SPLAYER_DISCORD_CLIENT_ID") return;
  if (_drpcConnecting) return;   // prevent concurrent connection attempts
  if (_drpcRetryTimer) { clearTimeout(_drpcRetryTimer); _drpcRetryTimer = null; }
  let DiscordRPC;
  try { DiscordRPC = require("discord-rpc"); }
  catch (e) { console.log("[Discord RPC] package unavailable:", e.message); return; }

  if (_drpcClient) { try { _drpcClient.destroy(); } catch {} _drpcClient = null; _drpcReady = false; }

  const client = new DiscordRPC.Client({ transport: "ipc" });
  _drpcConnecting = true;

  // On Linux the Discord socket lives in $XDG_RUNTIME_DIR, not /tmp/.
  // Set it explicitly so discord-rpc finds the correct path.
  if (process.platform === "linux" && !process.env.XDG_RUNTIME_DIR) {
    process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid()}`;
  }

  client.login({ clientId: DISCORD_CLIENT_ID })
    .then(() => {
      _drpcConnecting = false;
      console.log("[Discord RPC] connected");
      _drpcClient = client;
      _drpcReady  = true;
      client.on("disconnected", () => {
        console.log("[Discord RPC] disconnected");
        if (_drpcClient === client) {
          _drpcReady = false;
          _drpcClient = null;
          _drpcScheduleReconnect();
        }
      });
      if (_drpcEnabled && _drpcLastState) _drpcSetActivity(_drpcLastState);
    })
    .catch((err) => {
      _drpcConnecting = false;
      console.log("[Discord RPC] connect failed:", err.message);
      try { client.destroy(); } catch {}
      _drpcScheduleReconnect();
    });
}

// Renderer sends this on every meaningful playback state change
ipcMain.on("discord-rpc-update", (_event, state) => {
  _drpcLastState = state;
  _drpcSetActivity(state);
});

// Renderer sends this when the settings toggle changes
ipcMain.on("discord-rpc-set-enabled", (_event, enabled) => {
  _drpcEnabled = Boolean(enabled);
  console.log("[Discord RPC] enabled:", _drpcEnabled);
  if (_drpcEnabled) {
    if (!_drpcReady) _drpcConnect();
    else if (_drpcLastState) _drpcSetActivity(_drpcLastState);
  } else {
    if (_drpcReady && _drpcClient) _drpcClient.clearActivity().catch(() => {});
    if (_drpcRetryTimer) { clearTimeout(_drpcRetryTimer); _drpcRetryTimer = null; }
  }
});

// ── IPC: Splayer Editor — encode audio with ffmpeg ────────────────────────────
ipcMain.handle("editor:export", async (event, { wavBytes, format, quality, fileName, fadeIn, fadeOut }) => {
  // ── Log raw received args immediately ──────────────────────────────────────
  console.log("EXPORT ARGS:", { fadeIn, fadeOut, format, fileName, quality,
    wavBytesType: wavBytes?.constructor?.name,
    wavBytesLen:  wavBytes?.length ?? wavBytes?.byteLength ?? "?" });

  const validFormats = new Set(["mp3", "wav", "flac", "ogg"]);
  const validQualities = new Set(["128", "192", "320"]);

  if (!validFormats.has(format)) return { error: "Invalid format" };
  if (format === "mp3" && !validQualities.has(quality)) return { error: "Invalid quality" };
  if (!wavBytes) return { error: "No audio data" };

  const safeName = (typeof fileName === "string" ? fileName : "export")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim() || "export";
  const exportsDir = path.join(os.homedir(), "Music", "Splayer", "Exports");
  await fs.mkdir(exportsDir, { recursive: true });
  const outputPath = path.join(exportsDir, `${safeName}.${format}`);

  const tmpWav = path.join(os.tmpdir(), `splayer_edit_${Date.now()}.wav`);

  try {
    const buf = Buffer.from(wavBytes instanceof Uint8Array ? wavBytes : new Uint8Array(Object.values(wavBytes)));
    if (buf.length > _MAX_WRITE_BYTES) return { error: "Audio too large to export" };
    await fs.writeFile(tmpWav, buf);

    // Compute audio duration from WAV header bytes for fade-out start time.
    // WAV fmt chunk: offset 22 = channels (uint16), 24 = sample rate (uint32),
    // data chunk: offset 40 = data size in bytes (uint32). 16-bit PCM assumed.
    let audioDurSecs = 0;
    if (buf.length >= 44) {
      const sr = buf.readUInt32LE(24);
      const nc = buf.readUInt16LE(22);
      const dataSize = buf.readUInt32LE(40);
      if (sr > 0 && nc > 0) audioDurSecs = dataSize / (sr * nc * 2);
    }
    console.log("WAV DURATION:", audioDurSecs.toFixed(3) + "s",
      `(buf=${buf.length} bytes, sr=${buf.readUInt32LE(24)} nc=${buf.readUInt16LE(22)})`);

    // Build afade filter chain
    const fi = typeof fadeIn  === "number" && isFinite(fadeIn)  ? Math.max(0, fadeIn)  : 0;
    const fo = typeof fadeOut === "number" && isFinite(fadeOut) ? Math.max(0, fadeOut) : 0;

    const filters = [];
    if (fi > 0) {
      filters.push(`afade=t=in:st=0:d=${fi.toFixed(3)}`);
    }
    if (fo > 0) {
      // Clamp start time to 0 so it's valid even when fo >= audioDurSecs
      const foStart = Math.max(0, audioDurSecs - fo);
      filters.push(`afade=t=out:st=${foStart.toFixed(3)}:d=${fo.toFixed(3)}`);
    }

    // Build the complete args array BEFORE logging so the logged command is exact
    const ffArgs = ["-y", "-i", tmpWav];
    if (filters.length) ffArgs.push("-af", filters.join(","));
    if (format === "mp3") {
      ffArgs.push("-codec:a", "libmp3lame", "-b:a", `${quality}k`);
    } else if (format === "flac") {
      ffArgs.push("-codec:a", "flac");
    } else if (format === "ogg") {
      ffArgs.push("-codec:a", "libvorbis");
    }
    ffArgs.push(outputPath);

    // Log AFTER outputPath is appended so the command is complete
    console.log("FFMPEG CMD:", [getFfmpegPath(), ...ffArgs].join(" "));

    await new Promise((resolve, reject) => {
      const proc = spawn(getFfmpegPath(), ffArgs);
      let stderr = "";
      let totalSecs = 0;

      proc.stderr.on("data", (d) => {
        const text = d.toString();
        stderr += text;

        if (!totalSecs) {
          const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
          if (m) totalSecs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        }

        const tm = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (tm && totalSecs > 0) {
          const cur = parseInt(tm[1]) * 3600 + parseInt(tm[2]) * 60 + parseFloat(tm[3]);
          const pct = Math.min(99, Math.round((cur / totalSecs) * 100));
          try { event.sender.send("editor:export-progress", { percent: pct }); } catch {}
        }
      });
      proc.stdout.on("data", () => {});
      proc.on("error", (e) => reject(new Error(`ffmpeg error: ${e.message}`)));
      proc.on("close", (code) => {
        console.log("FFMPEG EXIT CODE:", code);
        if (code !== 0) {
          console.error("FFMPEG STDERR:\n" + stderr.slice(-500));
          reject(new Error("ffmpeg failed: " + stderr.slice(-300)));
        } else {
          // Log any warnings even on success
          const warnings = stderr.split("\n").filter(l => /error|warning/i.test(l) && !/encoder|muxing|stream/i.test(l));
          if (warnings.length) console.log("FFMPEG WARNINGS:", warnings.join("\n"));
          resolve();
        }
      });
    });

    try { event.sender.send("editor:export-progress", { percent: 100 }); } catch {}
    return { success: true, outputPath };
  } catch (e) {
    return { error: e.message };
  } finally {
    try { await fs.unlink(tmpWav); } catch {}
  }
});

// ── IPC: Splayer Editor — add exported file to library ────────────────────────
ipcMain.handle("editor:add-to-library", async (_event, { filePath }) => {
  if (!_isStr(filePath, _MAX_PATH_LEN) || !_isAllowedPath(filePath)) return { error: "Invalid path" };
  try {
    await fs.access(filePath);
    const stat = await fs.stat(filePath);
    const name = path.basename(filePath);
    return { success: true, file: { path: filePath, name, size: stat.size } };
  } catch (e) {
    return { error: e.message };
  }
});

// ── IPC: YouTube login (BrowserWindow → Netscape cookies file) ────────────────
ipcMain.handle("youtube:has-cookies", () => ({
  exists: fsSync.existsSync(YT_COOKIES_PATH),
}));

ipcMain.handle("youtube:clear-cookies", async () => {
  try { await fs.unlink(YT_COOKIES_PATH); } catch {}
  return { success: true };
});

ipcMain.handle("youtube:login", () =>
  new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 960,
      height: 720,
      title: "Sign in to YouTube — Splayer",
      autoHideMenuBar: true,
      webPreferences: {
        partition: "persist:yt-login",
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    loginWin.loadURL(
      "https://accounts.google.com/ServiceLogin?service=youtube&hl=en",
    );

    let handled = false;
    async function finish() {
      if (handled) return;
      handled = true;
      try {
        const ses = loginWin.webContents.session;
        const allCookies = [];
        const seen = new Set();
        for (const url of [
          "https://www.youtube.com",
          "https://accounts.google.com",
          "https://google.com",
        ]) {
          for (const c of await ses.cookies.get({ url })) {
            const key = `${c.domain}|${c.name}`;
            if (!seen.has(key)) { seen.add(key); allCookies.push(c); }
          }
        }
        if (allCookies.length === 0) {
          resolve({ error: "No cookies found — please sign in to YouTube first, then close this window." });
          return;
        }
        const lines = ["# Netscape HTTP Cookie File", "# Generated by Splayer", ""];
        for (const c of allCookies) {
          const dom = c.domain.startsWith(".") ? c.domain : "." + c.domain;
          const cookiePath = c.path || "/";
          const secure = c.secure ? "TRUE" : "FALSE";
          const expiry = c.expirationDate ? Math.floor(c.expirationDate) : "0";
          lines.push(`${dom}\tTRUE\t${cookiePath}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
        }
        await fs.writeFile(YT_COOKIES_PATH, lines.join("\n"), "utf8");
        resolve({ success: true, count: allCookies.length });
      } catch (e) {
        resolve({ error: e.message });
      } finally {
        try { loginWin.destroy(); } catch {}
      }
    }

    loginWin.on("close", (event) => {
      event.preventDefault();
      finish();
    });
  }),
);

// Silently self-update yt-dlp in the background on every startup
function _ytDlpSelfUpdate() {
  try {
    const ytBin = getYtDlpPath();
    const proc = spawn(ytBin, ["--update"], { env: { ...process.env } });
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { out += d.toString(); });
    proc.on("close", (code) => {
      const summary = out.trim().split("\n").pop() || "(no output)";
      if (code === 0) console.log("[yt-dlp] self-update:", summary);
      else console.warn("[yt-dlp] self-update failed (exit", code + "):", summary);
    });
    proc.on("error", (e) => console.warn("[yt-dlp] self-update error:", e.message));
  } catch (e) {
    console.warn("[yt-dlp] self-update launch failed:", e.message);
  }
}

app.whenReady().then(() => {
  ensureAppDirs();
  createWindow();
  createTray();

  // Keep yt-dlp current — runs async, does not block startup
  _ytDlpSelfUpdate();

  // D-Bus scroll monitor — intercepts KDE's Scroll method calls on Linux
  setupTrayScrollMonitor();
  setupWindowsTrayScrollMonitor();

  // Global shortcuts are registered by the renderer on mount (reads user's saved bindings).
  // Nothing hardcoded here — registerShortcuts() is called via IPC.

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Fallback connect in case the renderer hasn't sent discordRpcSetEnabled yet.
  // Skip if already connected or connecting (renderer beat us to it).
  setTimeout(() => { if (_drpcEnabled && !_drpcReady && !_drpcConnecting) _drpcConnect(); }, 5000);
});

app.on("before-quit", () => {
  if (_drpcClient && _drpcReady) _drpcClient.clearActivity().catch(() => {});
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (_drpcRetryTimer) clearTimeout(_drpcRetryTimer);
  if (_drpcClient) { try { _drpcClient.destroy(); } catch {} }
  if (widgetWindow && !widgetWindow.isDestroyed()) { try { widgetWindow.destroy(); } catch {} }
});

app.on("window-all-closed", () => {
  // On macOS apps conventionally stay alive until the user explicitly quits.
  // On Windows/Linux, only quit here if isQuitting is already set — meaning the
  // user chose "Quit" from the tray or some other intentional exit path.
  // When the window is hidden to tray, the 'close' event is prevented so this
  // event never fires, but we guard with isQuitting to be safe.
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});
