const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");

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
ipcMain.handle("yt-download-merged", async (event, url) => {
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

    await runYtDlpFile(
      [
        "-f", "bestvideo[ext=mp4]/bestvideo[height<=1080]/bestvideo",
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

// ── Delete a file from disk ───────────────────────────────────────────────────
ipcMain.handle("delete-file", async (_event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err.message ?? err) };
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
