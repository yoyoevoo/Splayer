import { Router, type IRouter } from "express";
import { spawn } from "child_process";

const router: IRouter = Router();

// Override binary path via env var; falls back to whatever is on PATH.
const YT_DLP_BIN = process.env.YT_DLP_PATH ?? "yt-dlp";

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ytDlpSearch(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP_BIN, [
      `ytsearch10:${query}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--no-download",
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      // Resolve with partial output rather than rejecting — yt-dlp can exit
      // non-zero even when some results were collected (e.g. age-restricted entries).
      if (!stdout && code !== 0) {
        reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(0, 200)}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", reject);
  });
}

router.get("/youtube/search", async (req, res) => {
  const q = (req.query["q"] as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: "Missing query parameter q" });
    return;
  }
  if (q.length > 300) {
    res.status(400).json({ error: "Query too long (max 300 characters)" });
    return;
  }

  try {
    const raw = await ytDlpSearch(q);

    const results = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as Record<string, unknown>; }
        catch { return null; }
      })
      .filter((v): v is Record<string, unknown> => v !== null)
      .map((v) => {
        const id  = String(v["id"] ?? "");
        const dur = typeof v["duration"] === "number" ? (v["duration"] as number) : 0;

        // Use the largest available thumbnail; fall back to the direct thumbnail field.
        const thumbs = Array.isArray(v["thumbnails"]) ? (v["thumbnails"] as { url?: string }[]) : [];
        const thumb  = thumbs[thumbs.length - 1]?.url
          ?? (typeof v["thumbnail"] === "string" ? (v["thumbnail"] as string) : "");

        return {
          videoId:      id,
          url:          `https://www.youtube.com/watch?v=${id}`,
          title:        String(v["title"]   ?? ""),
          channelName:  String(v["channel"] ?? v["uploader"] ?? "Unknown"),
          durationSecs: dur,
          durationText: dur > 0 ? formatDuration(dur) : "0:00",
          thumbnail:    thumb,
        };
      });

    res.json({ results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
