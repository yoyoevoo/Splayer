import { useState, useEffect, useRef } from "react";
import { Download, Loader2, Music2, Play, Search, X, Youtube } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayer } from "@/lib/player-context";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Mode  = "search" | "url";
type Stage =
  | "idle"        // waiting for user input
  | "searching"   // search query in flight
  | "results"     // search results ready
  | "fetching"    // URL mode: fetching video info
  | "ready"       // URL mode: info ready, awaiting download click
  | "downloading" // download in progress (both modes)
  | "done"        // download complete (both modes)
  | "error";      // error (both modes)

interface VideoInfo {
  title:       string;
  author:      string;
  durationSecs: number;
  thumbnailUrl: string | null;
}

interface SearchResult {
  videoId:      string;
  url:          string;
  title:        string;
  channelName:  string;
  durationSecs: number;
  durationText: string;
  thumbnail:    string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function YoutubeDownloadDialog({ open, onOpenChange }: Props) {
  const { addFiles, updateTrackInfo } = usePlayer();

  const [mode,          setMode]          = useState<Mode>("search");
  const [stage,         setStage]         = useState<Stage>("idle");

  // Search-mode state
  const [query,         setQuery]         = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewId,     setPreviewId]     = useState<string | null>(null);

  // URL-mode state
  const [url,           setUrl]           = useState("");
  const [urlInfo,       setUrlInfo]       = useState<VideoInfo | null>(null);

  // Shared download state
  const [downloadInfo,  setDownloadInfo]  = useState<VideoInfo | null>(null);
  const [progress,      setProgress]      = useState(0);
  const [errorMsg,      setErrorMsg]      = useState("");

  // Port of the local embed proxy server (avoids YouTube Error 153 on file://)
  const [embedPort,     setEmbedPort]     = useState(0);

  const cleanupRef = useRef<(() => void) | null>(null);
  const api        = window.electronAPI;

  // Fetch the embed server port once when the dialog first opens
  useEffect(() => {
    if (open && api?.getEmbedPort && embedPort === 0) {
      api.getEmbedPort().then(setEmbedPort);
    }
  }, [open, api, embedPort]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setMode("search");
      setStage("idle");
      setQuery("");
      setSearchResults([]);
      setDownloadingId(null);
      setPreviewId(null);
      setUrl("");
      setUrlInfo(null);
      setDownloadInfo(null);
      setProgress(0);
      setErrorMsg("");
      cleanupRef.current?.();
      cleanupRef.current = null;
    }
  }, [open]);

  // ── Search handler ──────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!api?.ytSearch || !query.trim()) return;
    setStage("searching");
    setSearchResults([]);
    setErrorMsg("");

    const results = await api.ytSearch(query.trim());
    if ("error" in results) {
      setErrorMsg(results.error);
      setStage("error");
    } else {
      setSearchResults(results);
      setStage("results");
    }
  };

  // ── URL fetch handler ───────────────────────────────────────────────────────
  const handleFetchUrl = async () => {
    if (!api?.ytGetInfo) return;
    const trimmed = url.trim();
    if (!isYoutubeUrl(trimmed)) {
      setErrorMsg("Please enter a valid YouTube URL");
      setStage("error");
      return;
    }
    setStage("fetching");
    setErrorMsg("");
    setUrlInfo(null);

    const result = await api.ytGetInfo(trimmed);
    if ("error" in result) {
      setErrorMsg(result.error);
      setStage("error");
    } else {
      setUrlInfo(result);
      setStage("ready");
    }
  };

  // ── Core download (shared by both modes) ────────────────────────────────────
  const performDownload = async (videoUrl: string, info: VideoInfo) => {
    if (!api?.ytDownload || !api?.onYtProgress) return;

    setDownloadInfo(info);
    setStage("downloading");
    setProgress(0);

    const cleanup = api.onYtProgress(({ percent }) => setProgress(percent));
    cleanupRef.current = cleanup;

    const result = await api.ytDownload(videoUrl);
    cleanup();
    cleanupRef.current = null;

    if ("error" in result) {
      setErrorMsg(result.error);
      setDownloadingId(null);
      setStage("error");
      return;
    }

    const safe     = sanitizeFilename(result.title);
    const filename = `${safe}.${result.ext}`;
    const blob     = new Blob([result.bytes], { type: result.mimeType });
    const file     = new File([blob], filename, { type: result.mimeType });

    await addFiles([file]);
    await updateTrackInfo(`${filename}-${file.size}`, {
      title:  result.title,
      artist: result.author,
    });

    setDownloadingId(null);
    setStage("done");
  };

  // ── URL-mode download ───────────────────────────────────────────────────────
  const handleUrlDownload = () => {
    if (!urlInfo) return;
    performDownload(url.trim(), urlInfo);
  };

  // ── Search-result download ──────────────────────────────────────────────────
  const handleSearchDownload = (r: SearchResult) => {
    setDownloadingId(r.videoId);
    performDownload(r.url, {
      title:       r.title,
      author:      r.channelName,
      durationSecs: r.durationSecs,
      thumbnailUrl: r.thumbnail || null,
    });
  };

  // ── Derived flags ────────────────────────────────────────────────────────────
  const isElectron  = !!api?.ytSearch;
  const isDownloading = stage === "downloading";
  const isDone        = stage === "done";
  const showControls  = isElectron && !isDownloading && !isDone;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-500" />
            Download from YouTube
          </DialogTitle>
        </DialogHeader>

        {/* ── Not in Electron ── */}
        {!isElectron && (
          <div className="py-8 text-center space-y-3">
            <Music2 className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              Available only in the desktop app.
            </p>
          </div>
        )}

        {/* ── Downloading ── */}
        {isElectron && isDownloading && downloadInfo && (
          <div className="space-y-4 py-1">
            <div className="flex gap-3 rounded-lg border border-card-border bg-card p-3">
              {downloadInfo.thumbnailUrl ? (
                <img
                  src={downloadInfo.thumbnailUrl}
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
                  {downloadInfo.title}
                </p>
                <p className="text-xs text-muted-foreground">{downloadInfo.author}</p>
                <p className="text-xs text-muted-foreground/60">
                  {formatDuration(downloadInfo.durationSecs)}
                </p>
              </div>
            </div>
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
          </div>
        )}

        {/* ── Done ── */}
        {isElectron && isDone && (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <Download className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm font-medium">Added to your library!</p>
            <p className="text-xs text-muted-foreground truncate px-6">
              {downloadInfo?.title}
            </p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}

        {/* ── Main controls ── */}
        {showControls && (
          <div className="space-y-3 pt-1">

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-card-border overflow-hidden text-sm">
              {(["search", "url"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setStage("idle");
                    setErrorMsg("");
                    setSearchResults([]);
                    setUrlInfo(null);
                    setPreviewId(null);
                  }}
                  className={cn(
                    "flex-1 py-1.5 font-medium transition-colors",
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "search" ? "Search" : "Paste URL"}
                </button>
              ))}
            </div>

            {/* ── Search mode ── */}
            {mode === "search" && (
              <div className="space-y-3">
                {/* Search input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Artist, song title, or mix…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (stage === "error") setStage("idle");
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && stage !== "searching" && handleSearch()
                    }
                    disabled={stage === "searching"}
                    className="flex-1 text-sm"
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSearch}
                    disabled={!query.trim() || stage === "searching"}
                  >
                    {stage === "searching" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>

                {/* Error */}
                {stage === "error" && errorMsg && (
                  <p className="text-xs text-destructive text-center">{errorMsg}</p>
                )}

                {/* Results list */}
                {stage === "results" && searchResults.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No results found.
                  </p>
                )}

                {stage === "results" && searchResults.length > 0 && (
                  <div className="space-y-2">
                    {/* Results list */}
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                      {searchResults.map((r) => (
                        <div
                          key={r.videoId}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors",
                            previewId === r.videoId
                              ? "border-primary/60"
                              : "border-card-border",
                          )}
                        >
                          {/* Thumbnail */}
                          {r.thumbnail ? (
                            <img
                              src={r.thumbnail}
                              alt=""
                              className="h-11 w-16 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded bg-muted">
                              <Music2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium leading-snug">
                              {r.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {r.channelName}
                              {r.durationText ? ` · ${r.durationText}` : ""}
                            </p>
                          </div>

                          {/* Play preview button */}
                          <Button
                            size="sm"
                            variant={previewId === r.videoId ? "default" : "ghost"}
                            className="shrink-0 h-7 w-7 p-0"
                            title={previewId === r.videoId ? "Stop preview" : "Preview"}
                            onClick={() =>
                              setPreviewId(previewId === r.videoId ? null : r.videoId)
                            }
                          >
                            {previewId === r.videoId ? (
                              <X className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          {/* Download button */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 gap-1.5 text-xs"
                            disabled={downloadingId === r.videoId}
                            onClick={() => handleSearchDownload(r)}
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Inline YouTube preview panel */}
                    {previewId && (
                      <div className="rounded-lg border border-primary/40 bg-card overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                          <span className="text-xs text-muted-foreground font-medium">
                            Preview
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setPreviewId(null)}
                          >
                            <X className="h-3 w-3" />
                            Close preview
                          </Button>
                        </div>
                        <iframe
                          key={previewId}
                          src={
                            embedPort
                              ? `http://127.0.0.1:${embedPort}/?v=${previewId}`
                              : undefined
                          }
                          allow="autoplay; encrypted-media; fullscreen"
                          allowFullScreen
                          className="w-full"
                          style={{ height: "195px", border: "none", display: "block" }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── URL (paste) mode ── */}
            {mode === "url" && (
              <div className="space-y-3">
                {/* URL input + Fetch */}
                <div className="flex gap-2">
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      if (stage === "error" || stage === "ready") {
                        setStage("idle");
                        setUrlInfo(null);
                      }
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && stage === "idle" && handleFetchUrl()
                    }
                    disabled={stage === "fetching"}
                    className="flex-1 text-sm"
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchUrl}
                    disabled={!url.trim() || stage === "fetching"}
                  >
                    {stage === "fetching" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Fetch"
                    )}
                  </Button>
                </div>

                {/* Error */}
                {stage === "error" && errorMsg && (
                  <p className="text-xs text-destructive text-center">{errorMsg}</p>
                )}

                {/* Info preview */}
                {urlInfo && stage === "ready" && (
                  <div className="flex gap-3 rounded-lg border border-card-border bg-card p-3">
                    {urlInfo.thumbnailUrl ? (
                      <img
                        src={urlInfo.thumbnailUrl}
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
                        {urlInfo.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{urlInfo.author}</p>
                      <p className="text-xs text-muted-foreground/60">
                        {formatDuration(urlInfo.durationSecs)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Download button */}
                {stage === "ready" && urlInfo && (
                  <Button onClick={handleUrlDownload} className="w-full gap-2">
                    <Download className="h-4 w-4" />
                    Download Audio
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
