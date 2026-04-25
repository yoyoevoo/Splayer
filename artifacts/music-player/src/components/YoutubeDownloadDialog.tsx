import { useState, useEffect, useRef } from "react";
import { Download, Loader2, Music2, Youtube } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayer } from "@/lib/player-context";

type Stage = "idle" | "fetching" | "ready" | "downloading" | "done" | "error";

interface VideoInfo {
  title: string;
  author: string;
  durationSecs: number;
  thumbnailUrl: string | null;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isYoutubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url.trim());
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function YoutubeDownloadDialog({ open, onOpenChange }: Props) {
  const { addFiles, updateTrackInfo } = usePlayer();

  const [url, setUrl]         = useState("");
  const [stage, setStage]     = useState<Stage>("idle");
  const [info, setInfo]       = useState<VideoInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const cleanupRef = useRef<(() => void) | null>(null);
  const api = window.electronAPI;

  // Reset every time the dialog opens/closes
  useEffect(() => {
    if (!open) {
      setUrl("");
      setStage("idle");
      setInfo(null);
      setProgress(0);
      setErrorMsg("");
      cleanupRef.current?.();
      cleanupRef.current = null;
    }
  }, [open]);

  // ── Fetch video metadata ────────────────────────────────────────────────────
  const handleFetchInfo = async () => {
    if (!api?.ytGetInfo) return;
    const trimmed = url.trim();
    if (!isYoutubeUrl(trimmed)) {
      setErrorMsg("Please enter a valid YouTube URL");
      setStage("error");
      return;
    }
    setStage("fetching");
    setErrorMsg("");
    setInfo(null);

    const result = await api.ytGetInfo(trimmed);
    if ("error" in result) {
      setErrorMsg(result.error);
      setStage("error");
    } else {
      setInfo(result);
      setStage("ready");
    }
  };

  // ── Download audio ──────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!api?.ytDownload || !api?.onYtProgress || !info) return;
    setStage("downloading");
    setProgress(0);

    // Subscribe to progress events
    const cleanup = api.onYtProgress(({ percent }) => setProgress(percent));
    cleanupRef.current = cleanup;

    const result = await api.ytDownload(url.trim());
    cleanup();
    cleanupRef.current = null;

    if ("error" in result) {
      setErrorMsg(result.error);
      setStage("error");
      return;
    }

    // Build a File from the received bytes
    const safe     = sanitizeFilename(result.title);
    const filename = `${safe}.${result.ext}`;
    const blob     = new Blob([result.bytes], { type: result.mimeType });
    const file     = new File([blob], filename, { type: result.mimeType });

    await addFiles([file]);

    // The track ID is derived from filename + size — update it with correct metadata
    const trackId = `${filename}-${file.size}`;
    await updateTrackInfo(trackId, {
      title:  result.title,
      artist: result.author,
    });

    setStage("done");
  };

  const isElectron = !!api?.ytDownload;
  const busy = stage === "fetching" || stage === "downloading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-500" />
            Download from YouTube
          </DialogTitle>
        </DialogHeader>

        {/* Not running inside Electron */}
        {!isElectron && (
          <div className="py-8 text-center space-y-3">
            <Music2 className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              Available only in the desktop app.
            </p>
          </div>
        )}

        {/* Success */}
        {isElectron && stage === "done" && (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <Download className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm font-medium">Added to your library!</p>
            <p className="text-xs text-muted-foreground truncate px-6">
              {info?.title}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="mt-1"
            >
              Close
            </Button>
          </div>
        )}

        {/* Main form */}
        {isElectron && stage !== "done" && (
          <div className="space-y-4 pt-1">

            {/* URL input + Fetch button */}
            <div className="flex gap-2">
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (stage === "error" || stage === "ready") {
                    setStage("idle");
                    setInfo(null);
                  }
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && stage === "idle" && handleFetchInfo()
                }
                disabled={busy}
                className="flex-1 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleFetchInfo}
                disabled={!url.trim() || busy}
              >
                {stage === "fetching" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Fetch"
                )}
              </Button>
            </div>

            {/* Error message */}
            {stage === "error" && errorMsg && (
              <p className="text-xs text-destructive text-center">{errorMsg}</p>
            )}

            {/* Video info preview */}
            {info && (stage === "ready" || stage === "downloading") && (
              <div className="flex gap-3 rounded-lg border border-card-border bg-card p-3">
                {info.thumbnailUrl ? (
                  <img
                    src={info.thumbnailUrl}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-muted">
                    <Music2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {info.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{info.author}</p>
                  <p className="text-xs text-muted-foreground/60">
                    {formatDuration(info.durationSecs)}
                  </p>
                </div>
              </div>
            )}

            {/* Progress bar */}
            {stage === "downloading" && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Downloading audio…</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Download button */}
            {(stage === "ready" || stage === "downloading") && (
              <Button
                onClick={handleDownload}
                disabled={stage === "downloading"}
                className="w-full gap-2"
              >
                {stage === "downloading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download Audio
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
