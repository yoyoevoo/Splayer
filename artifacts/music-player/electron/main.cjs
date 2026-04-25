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

// ── IPC: YouTube — fetch video info ─────────────────────────────────────────
ipcMain.handle("yt-get-info", async (_event, url) => {
  try {
    const ytdl = require("@distube/ytdl-core");
    const info = await ytdl.getInfo(url);
    const d = info.videoDetails;
    const thumbs = d.thumbnails || [];
    return {
      title: d.title,
      author: d.author.name,
      durationSecs: parseInt(d.lengthSeconds, 10) || 0,
      thumbnailUrl: thumbs[thumbs.length - 1]?.url ?? null,
    };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
});

// ── IPC: YouTube — download audio ────────────────────────────────────────────
ipcMain.handle("yt-download", async (event, url) => {
  try {
    const ytdl = require("@distube/ytdl-core");

    const info = await ytdl.getInfo(url);
    const d = info.videoDetails;
    const thumbs = d.thumbnails || [];

    const meta = {
      title: d.title,
      author: d.author.name,
      durationSecs: parseInt(d.lengthSeconds, 10) || 0,
      thumbnailUrl: thumbs[thumbs.length - 1]?.url ?? null,
    };

    // Pick highest-bitrate audio-only format
    const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
    audioFormats.sort(
      (a, b) => parseInt(b.bitrate || "0", 10) - parseInt(a.bitrate || "0", 10),
    );
    const format = audioFormats[0];
    if (!format) throw new Error("No audio-only format available for this video");

    const rawMime = format.mimeType || "audio/webm";
    const mimeType = rawMime.split(";")[0].trim();
    const ext = mimeType.includes("mp4") ? "m4a"
      : mimeType.includes("ogg") ? "ogg"
      : "webm";

    const stream = ytdl.downloadFromInfo(info, { format });
    const chunks = [];

    await new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("progress", (_cl, downloaded, total) => {
        if (total > 0) {
          event.sender.send("yt-progress", {
            downloaded,
            total,
            percent: Math.round((downloaded / total) * 100),
          });
        }
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const buf = Buffer.concat(chunks);
    // Return as Uint8Array so structured clone handles it efficiently
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
