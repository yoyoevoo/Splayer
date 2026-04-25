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

// ── YouTube download helpers ──────────────────────────────────────────────────

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

// Innertube clients — each has its own API key and exact context fields.
// IOS client is tried first; it returns direct (non-encrypted) audio URLs.
const INNERTUBE_CLIENTS = [
  {
    name: "IOS",
    apiKey: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
    headers: {
      "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5 like Mac OS X;)",
      "X-YouTube-Client-Name": "5",
      "X-YouTube-Client-Version": "19.29.1",
      "Origin": "https://www.youtube.com",
    },
    context: {
      clientName: "IOS",
      clientVersion: "19.29.1",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      userAgent: "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5 like Mac OS X;)",
      osName: "iPhone",
      osVersion: "17.5.1.21F90",
      hl: "en",
      gl: "US",
      timeZone: "UTC",
      utcOffsetMinutes: 0,
    },
  },
  {
    name: "ANDROID",
    apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    headers: {
      "User-Agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US; Pixel 8) gzip",
      "X-YouTube-Client-Name": "3",
      "X-YouTube-Client-Version": "19.29.37",
      "Origin": "https://www.youtube.com",
    },
    context: {
      clientName: "ANDROID",
      clientVersion: "19.29.37",
      userAgent: "com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US; Pixel 8) gzip",
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
      hl: "en",
      gl: "US",
      timeZone: "UTC",
      utcOffsetMinutes: 0,
    },
  },
];

async function innertubePlayer(videoId, client) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...client.headers },
      body: JSON.stringify({
        videoId,
        context: { client: client.context },
        playbackContext: {
          contentPlaybackContext: { signatureTimestamp: 0 },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Innertube HTTP ${res.status} (${client.name})`);
  return res.json();
}

function pickBestAudioFormat(streamingData) {
  const all = [
    ...(streamingData.adaptiveFormats || []),
    ...(streamingData.formats || []),
  ];
  // Direct-URL audio-only formats (no cipher needed)
  const audio = all
    .filter((f) => f.mimeType?.startsWith("audio/") && f.url)
    .sort((a, b) => parseInt(b.bitrate || "0", 10) - parseInt(a.bitrate || "0", 10));
  return audio[0] || null;
}

// Extract video details from Innertube player data into a normalised struct
function normalisePlayerData(data) {
  const d = data.videoDetails || {};
  const thumbs = d.thumbnail?.thumbnails || [];
  return {
    meta: {
      title:        d.title || "Unknown",
      author:       d.author || "Unknown",
      durationSecs: parseInt(d.lengthSeconds || "0", 10),
      thumbnailUrl: thumbs[thumbs.length - 1]?.url ?? null,
    },
    format: pickBestAudioFormat(data.streamingData || {}),
  };
}

// Try Innertube clients in order, then fall back to @distube/ytdl-core
async function resolveAudio(videoId) {
  const errors = [];

  // ── Strategy 1: Innertube clients ──────────────────────────────────────────
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const data = await innertubePlayer(videoId, client);
      const status = data?.playabilityStatus?.status;
      if (status === "OK" || status === "CONTENT_CHECK_REQUIRED") {
        const { meta, format } = normalisePlayerData(data);
        if (format) return { meta, format, ua: client.headers["User-Agent"] };
      }
      errors.push(`${client.name}: ${data?.playabilityStatus?.reason || status}`);
    } catch (e) {
      errors.push(`${client.name}: ${e.message}`);
    }
  }

  // ── Strategy 2: @distube/ytdl-core with session agent ───────────────────────
  try {
    const ytdl = require("@distube/ytdl-core");
    const agent = ytdl.createAgent();
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(ytUrl, { agent });
    const d = info.videoDetails;
    const thumbs = d.thumbnails || [];
    const meta = {
      title:        d.title || "Unknown",
      author:       typeof d.author === "string" ? d.author : (d.author?.name || "Unknown"),
      durationSecs: parseInt(d.lengthSeconds || "0", 10),
      thumbnailUrl: thumbs[thumbs.length - 1]?.url ?? null,
    };
    const audioFmts = ytdl.filterFormats(info.formats, "audioonly")
      .sort((a, b) => parseInt(b.bitrate || "0", 10) - parseInt(a.bitrate || "0", 10));
    if (!audioFmts.length) throw new Error("No audio-only format from ytdl");
    const fmt = audioFmts[0];
    return {
      meta,
      format: { url: fmt.url, mimeType: fmt.mimeType, bitrate: fmt.bitrate },
      ua: "Mozilla/5.0",
    };
  } catch (e) {
    errors.push(`ytdl-core: ${e.message}`);
  }

  throw new Error(errors.join(" | "));
}

// ── IPC: YouTube — fetch video info ─────────────────────────────────────────
ipcMain.handle("yt-get-info", async (_event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");
    const { meta } = await resolveAudio(videoId);
    return meta;
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — download audio ────────────────────────────────────────────
ipcMain.handle("yt-download", async (event, url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const { meta, format, ua } = await resolveAudio(videoId);

    const rawMime  = (format.mimeType || "audio/webm").split(";")[0].trim();
    const ext = rawMime.includes("mp4") ? "m4a"
              : rawMime.includes("ogg") ? "ogg"
              : "webm";

    // Stream the audio bytes with progress reporting
    const audioRes = await fetch(format.url, {
      headers: { "User-Agent": ua, "Range": "bytes=0-" },
    });

    if (!audioRes.ok && audioRes.status !== 206) {
      throw new Error(`Audio fetch failed (HTTP ${audioRes.status})`);
    }

    const contentLength = (() => {
      const cr = audioRes.headers.get("content-range");
      if (cr) return parseInt(cr.split("/")[1] || "0", 10);
      return parseInt(audioRes.headers.get("content-length") || "0", 10);
    })();

    const chunks = [];
    let downloaded = 0;

    const reader = audioRes.body.getReader();
    for (;;) {
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
    return { bytes: new Uint8Array(buf), mimeType: rawMime, ext, ...meta };
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
