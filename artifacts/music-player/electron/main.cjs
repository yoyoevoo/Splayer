const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-setuid-sandbox");

// ── Pin userData path ─────────────────────────────────────────────────────────
// Keep the storage directory fixed at ~/.config/splayer forever.
// This prevents any future rename from relocating library / settings data.
const USERDATA_DIR = path.join(os.homedir(), ".config", "splayer");

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

// Migrate data from the first old directory that has real Electron session data.
// "Real data" means the IndexedDB directory exists and has at least one database —
// an empty skeleton created by a previous launch will NOT have that.
(function migrateUserData() {
  const fsSync = require("fs");

  // Helper: does this userData dir contain actual track / playlist data?
  function hasRealData(dir) {
    try {
      const idbDir = path.join(dir, "Default", "IndexedDB");
      return fsSync.existsSync(idbDir) && fsSync.readdirSync(idbDir).length > 0;
    } catch (_) { return false; }
  }

  // Skip migration only if the DESTINATION already has real user data.
  if (hasRealData(USERDATA_DIR)) return;

  for (const oldDir of OLD_DATA_DIRS) {
    // Only migrate from a source that actually has real data.
    if (!hasRealData(oldDir)) continue;
    try {
      // Remove the empty skeleton so cpSync can copy cleanly.
      if (fsSync.existsSync(USERDATA_DIR)) {
        fsSync.rmSync(USERDATA_DIR, { recursive: true, force: true });
      }
      fsSync.cpSync(oldDir, USERDATA_DIR, { recursive: true });
      console.log("[splayer] Migrated user data:", oldDir, "→", USERDATA_DIR);
    } catch (e) {
      console.warn("[splayer] Migration warning:", e.message);
    }
    break; // only migrate from the first (best) source found
  }
})();

// ── Tray & close-behavior state ───────────────────────────────────────────────
let mainWindow   = null;
let tray         = null;
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
      label: "🖥  Open Splayer",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    {
      label: "❌ Quit",
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
    tray.on("double-click", () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });

    tray.on("scroll", (_event, _delta, direction) => {
      if (direction === "up")        adjustVolume(1);
      else if (direction === "down") adjustVolume(-1);
    });
  } catch (e) {
    console.error("[Tray] Failed to create system tray:", e.message);
  }
}

// ── Local YouTube embed server ────────────────────────────────────────────────
// Electron loads from file://, so YouTube's iframe embed blocks with Error 153
// (null origin). We serve a tiny HTML shim from http://localhost so YouTube
// sees a valid http origin and allows the embed.
let embedServerPort = 0;

const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]{1,20}$/;

const embedServer = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, "http://localhost");
  const vid       = parsedUrl.searchParams.get("v") || "";

  if (!SAFE_VIDEO_ID.test(vid)) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  // /stream?v=VIDEOID — pipe yt-dlp audio output straight to the browser's
  // <audio> element; works for every video regardless of embedding restrictions.
  if (parsedUrl.pathname === "/stream") {
    const ytUrl = `https://www.youtube.com/watch?v=${vid}`;

    // Prefer webm/opus (native in Electron/Chromium). Fall back to best audio.
    const proc = spawn(
      getYtDlpPath(),
      [
        "-f", "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
        "--no-playlist",
        "--no-warnings",
        "-o", "-",
        ytUrl,
      ],
      { env: { ...process.env } },
    );

    res.writeHead(200, {
      "Content-Type":      "audio/webm",
      "Transfer-Encoding": "chunked",
      "Cache-Control":     "no-cache",
    });

    proc.stdout.pipe(res);
    proc.stderr.on("data", () => {}); // suppress console noise

    proc.on("error", () => {
      try { res.end(); } catch (_) {}
    });

    // Kill yt-dlp as soon as the client disconnects (close preview / change track)
    req.on("close", () => {
      try { proc.kill("SIGTERM"); } catch (_) {}
    });

    return;
  }

  // /video-stream?v=VIDEOID — pipe yt-dlp's combined video+audio stream to a
  // <video> element. Uses a single-file format (no ffmpeg merge needed) so it
  // works even when YouTube blocks iframe embeds ("Video unavailable").
  if (parsedUrl.pathname === "/video-stream") {
    const ytUrl = `https://www.youtube.com/watch?v=${vid}`;

    // Select a single-container format that includes both video + audio.
    // "best[height<=480]" targets <=480p combined streams (reliable without ffmpeg).
    // Fallback chain ensures something always plays.
    const proc = spawn(
      getYtDlpPath(),
      [
        "-f", "best[height<=480][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
        "--no-playlist",
        "--no-warnings",
        "-o", "-",
        ytUrl,
      ],
      { env: { ...process.env } },
    );

    res.writeHead(200, {
      "Content-Type":      "video/mp4",
      "Transfer-Encoding": "chunked",
      "Cache-Control":     "no-cache",
    });

    proc.stdout.pipe(res);
    proc.stderr.on("data", () => {});

    proc.on("error", () => {
      try { res.end(); } catch (_) {}
    });

    req.on("close", () => {
      try { proc.kill("SIGTERM"); } catch (_) {}
    });

    return;
  }

  // Fallback 404
  res.writeHead(404);
  res.end("Not found");
});

embedServer.listen(0, "127.0.0.1", () => {
  embedServerPort = embedServer.address().port;
});

ipcMain.handle("get-embed-port", () => embedServerPort);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    title: "Splayer",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow = win;
  Menu.setApplicationMenu(null);

  // Minimize-to-tray / close fully depending on user setting
  win.on("close", (e) => {
    if (!isQuitting && closeBehavior === "tray") {
      e.preventDefault();
      win.hide();
    }
  });

  const indexPath = path.join(__dirname, "..", "dist", "public", "index.html");
  win.loadFile(indexPath);
}

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
  try {
    await fs.writeFile(filePath, Buffer.from(bytes));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: YouTube — search videos ─────────────────────────────────────────────
ipcMain.handle("yt-search", async (_event, query) => {
  try {
    const yts = require("yt-search");
    const r = await yts(query.trim());
    return r.videos.slice(0, 8).map((v) => ({
      videoId:      v.videoId,
      url:          v.url,
      title:        v.title,
      channelName:  v.author ? v.author.name : "Unknown",
      durationSecs: v.seconds || 0,
      durationText: v.timestamp || "0:00",
      thumbnail:    v.thumbnail || v.image || "",
    }));
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── yt-dlp helpers ────────────────────────────────────────────────────────────

const { spawn } = require("child_process");

function getYtDlpPath() {
  // In packaged AppImage: process.resourcesPath = .../resources/
  // In dev: resources/ is next to electron/
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "resources");
  return path.join(resourcesDir, "yt-dlp");
}

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/v\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = String(url).match(p);
    if (m) return m[1];
  }
  return null;
}

// Run yt-dlp and return stdout as a Buffer.
// onStderr receives raw stderr text (used for progress parsing).
function runYtDlp(args, onStderr) {
  return new Promise((resolve, reject) => {
    const bin = getYtDlpPath();
    const proc = spawn(bin, args, { env: { ...process.env } });

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
        // Extract the most meaningful error line from stderr
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
  return new Promise((resolve, reject) => {
    const bin  = getYtDlpPath();
    const proc = spawn(bin, args, { env: { ...process.env } });

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

// ── Helper: merge video + audio with ffmpeg ───────────────────────────────────
function runFfmpegMerge(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
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
    const tmpAudio = path.join(os.tmpdir(), `ytdl_audio_${tmpId}`);
    const tmpVideo = path.join(os.tmpdir(), `ytdl_video_${tmpId}.mp4`);
    const tmpMerge = path.join(os.tmpdir(), `ytdl_merged_${tmpId}.mp4`);

    // ── Step 1: Get metadata + best audio format ──────────────────────────────
    const jsonBuf = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      ytUrl,
    ]);
    const info = JSON.parse(jsonBuf.toString("utf8"));

    const audioFmts = (info.formats || [])
      .filter((f) => f.vcodec === "none" && f.acodec !== "none" && f.acodec)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));
    const bestFmt    = audioFmts[0];
    const audioFmtId = bestFmt ? String(bestFmt.format_id) : "bestaudio";
    const audioExt   = bestFmt?.ext || "webm";

    const meta = {
      title:        info.title    || "Unknown",
      author:       info.uploader || info.channel || "Unknown",
      durationSecs: Math.round(info.duration || 0),
      thumbnailUrl: info.thumbnail || null,
    };

    // ── Step 2: Download audio to temp file ───────────────────────────────────
    const tmpAudioWithExt = `${tmpAudio}.${audioExt}`;
    event.sender.send("yt-progress", { percent: 0, downloaded: 0, total: 100 });

    await runYtDlpFile(
      [
        "-f", audioFmtId,
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-o", tmpAudioWithExt,
        ytUrl,
      ],
      (stderrLine) => {
        const pct = parseYtDlpProgress(stderrLine);
        if (pct !== null) {
          event.sender.send("yt-progress", { percent: pct, downloaded: pct, total: 100 });
        }
      },
    );
    event.sender.send("yt-progress", { percent: 100, downloaded: 100, total: 100 });

    // ── Step 3: Download video (video-only stream) to temp file ───────────────
    event.sender.send("yt-progress-video", { percent: 0, downloaded: 0, total: 100 });

    // Use caller-specified format if provided; else fall back to best available
    const videoFormat = videoFormatId
      ? String(videoFormatId)
      : "bestvideo[ext=mp4]/bestvideo[height<=1080]/bestvideo";

    await runYtDlpFile(
      [
        "-f", videoFormat,
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-o", tmpVideo,
        ytUrl,
      ],
      (stderrLine) => {
        const pct = parseYtDlpProgress(stderrLine);
        if (pct !== null) {
          event.sender.send("yt-progress-video", { percent: pct, downloaded: pct, total: 100 });
        }
      },
    );
    event.sender.send("yt-progress-video", { percent: 100, downloaded: 100, total: 100 });

    // ── Step 4: Merge with ffmpeg ─────────────────────────────────────────────
    event.sender.send("yt-progress-merge", { percent: 0 });
    await runFfmpegMerge(tmpVideo, tmpAudioWithExt, tmpMerge);
    event.sender.send("yt-progress-merge", { percent: 100 });

    // ── Step 5: Read merged bytes + clean up temp files ───────────────────────
    const mergedBuf = await fs.readFile(tmpMerge);

    for (const f of [tmpAudioWithExt, tmpVideo, tmpMerge]) {
      fs.unlink(f).catch(() => {});
    }

    return { bytes: new Uint8Array(mergedBuf), mimeType: "video/mp4", ext: "mp4", ...meta };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: Spotify — fetch all tracks from a playlist URL ──────────────────────
ipcMain.handle("spotify-fetch-playlist", async (_event, { playlistUrl, clientId, clientSecret }) => {
  try {
    // Parse playlist ID from various URL formats
    // e.g. https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
    const match = playlistUrl.match(/playlist\/([A-Za-z0-9]+)/);
    if (!match) return { error: "Invalid Spotify playlist URL. Paste a link like open.spotify.com/playlist/..." };
    const playlistId = match[1];

    if (!clientId || !clientSecret) {
      return { error: "Spotify credentials not configured. Add your Client ID and Client Secret in Settings." };
    }

    // Step 1 — get an access token via Client Credentials flow
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return { error: tokenData.error_description ?? "Spotify authentication failed. Check your Client ID and Secret." };
    }
    const token = tokenData.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    // Step 2 — fetch playlist metadata + first page of tracks
    const fields = encodeURIComponent(
      "name,tracks.total,tracks.next,tracks.items(track(id,name,artists(name),duration_ms))"
    );
    const playlistRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=${fields}`,
      { headers },
    );
    if (!playlistRes.ok) {
      const err = await playlistRes.json().catch(() => ({}));
      return { error: err.error?.message ?? `Failed to fetch playlist (HTTP ${playlistRes.status})` };
    }
    const playlistData = await playlistRes.json();

    const mapItem = (item) => {
      if (!item?.track) return null;
      return {
        id:         item.track.id ?? Math.random().toString(36).slice(2),
        name:       item.track.name ?? "Unknown",
        artists:    (item.track.artists ?? []).map((a) => a.name).join(", ") || "Unknown Artist",
        durationMs: item.track.duration_ms ?? 0,
      };
    };

    let allTracks = (playlistData.tracks.items ?? []).map(mapItem).filter(Boolean);

    // Step 3 — paginate through remaining pages (100 items per page)
    let nextUrl = playlistData.tracks.next;
    while (nextUrl) {
      const pageRes = await fetch(nextUrl, { headers });
      if (!pageRes.ok) break;
      const pageData = await pageRes.json();
      const pageTracks = (pageData.items ?? []).map(mapItem).filter(Boolean);
      allTracks = allTracks.concat(pageTracks);
      nextUrl = pageData.next ?? null;
    }

    return {
      playlistName: playlistData.name ?? "Spotify Playlist",
      total:        playlistData.tracks.total ?? allTracks.length,
      tracks:       allTracks,
    };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
});

// ── Delete a file from disk ───────────────────────────────────────────────────
ipcMain.handle("delete-file", async (_event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err.message ?? err) };
  }
});

// ── IPC: Global shortcuts ─────────────────────────────────────────────────────
ipcMain.handle("register-global-shortcuts", (_event, shortcuts) => {
  if (shortcuts && typeof shortcuts === "object") {
    registerShortcuts(shortcuts);
  }
});

// ── IPC: Tray & close-behavior ────────────────────────────────────────────────
ipcMain.handle("set-close-behavior", (_event, behavior) => {
  if (behavior === "tray" || behavior === "close") {
    closeBehavior = behavior;
  }
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

ipcMain.handle("show-window", () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  // D-Bus scroll monitor — intercepts KDE's Scroll method calls on Linux
  setupTrayScrollMonitor();

  // Global shortcuts are registered by the renderer on mount (reads user's saved bindings).
  // Nothing hardcoded here — registerShortcuts() is called via IPC.

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    isQuitting = true;
    app.quit();
  }
});
