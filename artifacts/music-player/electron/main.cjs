const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const http = require("http");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-setuid-sandbox");

// ── Local YouTube embed server ────────────────────────────────────────────────
// Electron loads from file://, so YouTube's iframe embed blocks with Error 153
// (null origin). We serve a tiny HTML shim from http://localhost so YouTube
// sees a valid http origin and allows the embed.
let embedServerPort = 0;

const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]{1,20}$/;

const embedServer = http.createServer((req, res) => {
  const url  = new URL(req.url, "http://localhost");
  const vid  = url.searchParams.get("v") || "";

  if (!SAFE_VIDEO_ID.test(vid)) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; height: 100vh; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe
    src="https://www.youtube.com/embed/${vid}?autoplay=1&controls=1&rel=0&modestbranding=1"
    allow="autoplay; encrypted-media; fullscreen"
    allowfullscreen
  ></iframe>
</body>
</html>`);
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
    title: "Music Player",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  Menu.setApplicationMenu(null);

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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
