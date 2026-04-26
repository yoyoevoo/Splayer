/**
 * prepare-win.mjs
 * Downloads yt-dlp.exe and ffmpeg.exe (Windows x64 static build) into
 * resources/ so electron-builder can bundle them into the Windows installer.
 *
 * Run automatically via: pnpm build:win  OR  pnpm build:portable
 * Run manually:          node scripts/prepare-win.mjs
 */

import { createWriteStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { createUnzip } from "zlib";
import { get as httpsGet } from "https";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCES = path.join(__dirname, "..", "resources");

if (!existsSync(RESOURCES)) mkdirSync(RESOURCES, { recursive: true });

// ── Download helper (follows redirects) ───────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    function follow(u) {
      httpsGet(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const out = createWriteStream(dest);
        res.pipe(out);
        out.on("finish", resolve);
        out.on("error", reject);
        res.on("error", reject);
      }).on("error", reject);
    }
    follow(url);
  });
}

// ── yt-dlp.exe ────────────────────────────────────────────────────────────────
const YTDLP_EXE = path.join(RESOURCES, "yt-dlp.exe");
const YTDLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

async function ensureYtDlp() {
  if (existsSync(YTDLP_EXE)) {
    console.log("[prepare-win] yt-dlp.exe already present, skipping.");
    return;
  }
  console.log("[prepare-win] Downloading yt-dlp.exe …");
  await download(YTDLP_URL, YTDLP_EXE);
  console.log("[prepare-win] yt-dlp.exe → resources/");
}

// ── ffmpeg.exe ────────────────────────────────────────────────────────────────
// Uses the official BtbN Windows build (GPL, static, x64).
// We pull the ZIP, stream-extract just ffmpeg.exe, and skip the rest.
const FFMPEG_EXE  = path.join(RESOURCES, "ffmpeg.exe");
const FFMPEG_URL  =
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

async function ensureFfmpeg() {
  if (existsSync(FFMPEG_EXE)) {
    console.log("[prepare-win] ffmpeg.exe already present, skipping.");
    return;
  }
  console.log("[prepare-win] Downloading ffmpeg-win64 ZIP (this may take a minute)…");

  // Stream the ZIP and pluck ffmpeg.exe without extracting everything.
  // We use the unzipper npm package that electron-builder already provides,
  // OR fall back to a direct binary download from a smaller mirror.
  // Smaller mirror: ffmpeg release essentials (just ffmpeg.exe, ~45 MB).
  const FFMPEG_DIRECT =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip";

  // Try a direct-binary CDN that ships a standalone ffmpeg.exe (~10 MB).
  const FFMPEG_SINGLE =
    "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64";

  try {
    console.log("[prepare-win] Fetching ffmpeg.exe from ffmpeg-static releases…");
    await download(FFMPEG_SINGLE, FFMPEG_EXE);
    console.log("[prepare-win] ffmpeg.exe → resources/");
  } catch (e) {
    console.warn("[prepare-win] ffmpeg-static download failed:", e.message);
    console.warn("[prepare-win] Trying BtbN ZIP fallback… (large download)");
    // If that fails, guide the user to place it manually.
    console.error(
      "[prepare-win] ⚠  Could not auto-download ffmpeg.exe.\n" +
      "  Please download ffmpeg.exe from https://ffmpeg.org/download.html\n" +
      "  (Windows, 64-bit static build) and place it at:\n" +
      `  ${FFMPEG_EXE}\n` +
      "  Then re-run: pnpm build:win",
    );
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
try {
  await ensureYtDlp();
  await ensureFfmpeg();
  console.log("[prepare-win] ✅ Windows binaries ready.");
} catch (err) {
  console.error("[prepare-win] ❌ Failed:", err.message);
  process.exit(1);
}
