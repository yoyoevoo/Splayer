const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-setuid-sandbox");

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

// ── YouTube Innertube helpers ─────────────────────────────────────────────────
// Uses YouTube's internal API (same as the official app). The ANDROID client
// returns direct audio URLs that don't need signature decryption.

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([^&?#\s]{11})/,
    /youtu\.be\/([^?&\s]{11})/,
    /\/embed\/([^?&\s]{11})/,
    /\/v\/([^?&\s]{11})/,
  ];
  for (const p of patterns) {
    const m = String(url).match(p);
    if (m) return m[1];
  }
  return null;
}

// Try multiple Innertube clients in order of reliability
const CLIENTS = [
  {
    name: "IOS",
    headers: {
      "User-Agent":
        "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5 like Mac OS X;)",
      "X-YouTube-Client-Name": "5",
      "X-YouTube-Client-Version": "19.29.1",
    },
    context: {
      clientName: "IOS",
      clientVersion: "19.29.1",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "17.5.1.21F90",
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "ANDROID",
    headers: {
      "User-Agent":
        "com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip",
      "X-YouTube-Client-Name": "3",
      "X-YouTube-Client-Version": "19.29.37",
    },
    context: {
      clientName: "ANDROID",
      clientVersion: "19.29.37",
      androidSdkVersion: 30,
      osName: "Android",
      osVersion: "11",
      hl: "en",
      gl: "US",
    },
  },
];

async function innertubePlayer(videoId, client) {
  const res = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...client.headers },
      body: JSON.stringify({
        videoId,
        context: { client: client.context },
      }),
    },
  );
  if (!res.ok) throw new Error(`Innertube HTTP ${res.status}`);
  return res.json();
}

function pickBestAudioFormat(streamingData) {
  const all = [
    ...(streamingData.adaptiveFormats || []),
    ...(streamingData.formats || []),
  ];
  // Prefer audio-only formats with direct URLs
  const audio = all
    .filter((f) => f.mimeType && f.mimeType.startsWith("audio/") && f.url)
    .sort(
      (a, b) =>
        parseInt(b.bitrate || "0", 10) - parseInt(a.bitrate || "0", 10),
    );
  if (audio.length) return audio[0];

  // Fall back to any format that has audio and a direct URL
  return (
    all
      .filter((f) => f.url && !f.mimeType?.startsWith("video/"))
      .sort(
        (a, b) =>
          parseInt(b.bitrate || "0", 10) - parseInt(a.bitrate || "0", 10),
      )[0] || null
  );
}

async function getPlayerDataWithFallback(videoId) {
  let lastErr;
  for (const client of CLIENTS) {
    try {
      const data = await innertubePlayer(videoId, client);
      const status = data?.playabilityStatus?.status;
      // OK or CONTENT_CHECK_REQUIRED usually still has formats
      if (status === "OK" || status === "CONTENT_CHECK_REQUIRED") {
        const fmt = pickBestAudioFormat(data.streamingData || {});
        if (fmt) return data;
      }
      lastErr = new Error(
        data?.playabilityStatus?.reason ||
          `Status: ${status || "unknown"} (${client.name})`,
      );
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No playable audio format found");
}

// ── IPC: YouTube — fetch video info ─────────────────────────────────────────
ipcMain.handle("yt-get-info", async (_event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const data = await getPlayerDataWithFallback(videoId);
    const d = data.videoDetails || {};
    const thumbs = d.thumbnail?.thumbnails || [];
    return {
      title:        d.title || "Unknown",
      author:       d.author || "Unknown",
      durationSecs: parseInt(d.lengthSeconds || "0", 10),
      thumbnailUrl: thumbs[thumbs.length - 1]?.url ?? null,
    };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — download audio ────────────────────────────────────────────
ipcMain.handle("yt-download", async (event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const data = await getPlayerDataWithFallback(videoId);

    const d = data.videoDetails || {};
    const thumbs = d.thumbnail?.thumbnails || [];
    const meta = {
      title:        d.title || "Unknown",
      author:       d.author || "Unknown",
      durationSecs: parseInt(d.lengthSeconds || "0", 10),
      thumbnailUrl: thumbs[thumbs.length - 1]?.url ?? null,
    };

    const format = pickBestAudioFormat(data.streamingData || {});
    if (!format) throw new Error("No audio format available");

    const rawMime  = format.mimeType || "audio/webm";
    const mimeType = rawMime.split(";")[0].trim();
    const ext = mimeType.includes("mp4") ? "m4a"
      : mimeType.includes("ogg") ? "ogg"
      : "webm";

    // Download the audio stream with native fetch — no ytdl-core needed
    const audioRes = await fetch(format.url, {
      headers: {
        // Re-use the same UA as the client that gave us the URL
        "User-Agent": CLIENTS[0].headers["User-Agent"],
        "Range": "bytes=0-",
      },
    });

    if (!audioRes.ok && audioRes.status !== 206) {
      throw new Error(`Download failed (HTTP ${audioRes.status})`);
    }

    const contentLength =
      audioRes.headers.get("content-range")
        ? parseInt((audioRes.headers.get("content-range") || "").split("/")[1] || "0", 10)
        : parseInt(audioRes.headers.get("content-length") || "0", 10);

    const chunks = [];
    let downloaded = 0;

    const reader = audioRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      downloaded += value.length;
      if (contentLength > 0) {
        event.sender.send("yt-progress", {
          downloaded,
          total: contentLength,
          percent: Math.min(99, Math.round((downloaded / contentLength) * 100)),
        });
      }
    }

    event.sender.send("yt-progress", { downloaded, total: downloaded, percent: 100 });

    const buf = Buffer.concat(chunks);
    return { bytes: new Uint8Array(buf), mimeType, ext, ...meta };
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
