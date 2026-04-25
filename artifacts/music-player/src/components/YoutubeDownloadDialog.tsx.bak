import { useState, useEffect, useRef } from "react";
import {
  Download,
  Loader2,
  Music2,
  Search,
  X,
  Youtube,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayer } from "@/lib/player-context";
import { addDownloadRecord } from "@/lib/downloads-history";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Mode        = "search" | "url";
type PreviewMode = "audio" | "video";
type DownloadType = "audio" | "video" | "merged";
type Stage =
  | "idle"
  | "searching"
  | "results"
  | "fetching"
  | "ready"
  | "downloading"
  | "done"
  | "error";

interface VideoInfo {
  title:        string;
  author:       string;
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

// ── Progress bar sub-component ───────────────────────────────────────────────

function ProgressBar({
  label,
  percent,
  done,
  error,
}: {
  label: string;
  percent: number;
  done: boolean;
  error: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {done ? (
            <span className="text-green-500">✓</span>
          ) : error ? (
            <span className="text-destructive">✗</span>
          ) : null}
          {label}
        </span>
        <span>{error ? "Failed" : done ? "Done" : `${percent}%`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            error ? "bg-destructive" : done ? "bg-green-500" : "bg-primary",
          )}
          style={{ width: `${error ? 100 : percent}%` }}
        />
      </div>
    </div>
  );
}

// ── Download button — uses Radix Popover so it nests correctly inside Dialog ──

const MENU_OPTIONS: { type: DownloadType; icon: string; label: string }[] = [
  { type: "audio",  icon: "🎵", label: "Audio only (MP3)"       },
  { type: "merged", icon: "🎬", label: "Video + Audio (MP4)"    },
];

function DownloadButton({
  id,
  onPick,
  downloadingId,
}: {
  id:            string;
  onPick:        (t: DownloadType) => void;
  downloadingId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={open ? "default" : "outline"}
            className="gap-1.5 text-xs"
            disabled={downloadingId === id}
          >
            <Download className="h-3 w-3" />
            Download
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-44 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {MENU_OPTIONS.map(({ type, icon, label }) => (
            <button
              key={type}
              onClick={() => { setOpen(false); onPick(type); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs font-medium",
                "text-foreground hover:bg-primary/15 hover:text-primary transition-colors",
              )}
            >
              <span className="text-sm">{icon}</span>
              {label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function YoutubeDownloadDialog({ open, onOpenChange }: Props) {
  const { addFiles, updateTrackInfo } = usePlayer();

  const [mode,        setMode]        = useState<Mode>("search");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("audio");
  const [stage,       setStage]       = useState<Stage>("idle");

  // Search-mode state
  const [query,         setQuery]         = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewId,     setPreviewId]     = useState<string | null>(null);

  // URL-mode state
  const [url,     setUrl]     = useState("");
  const [urlInfo, setUrlInfo] = useState<VideoInfo | null>(null);

  // Shared download state
  const [downloadInfo,   setDownloadInfo]   = useState<VideoInfo | null>(null);
  const [dlType,         setDlType]         = useState<DownloadType>("merged");
  const [progressAudio,  setProgressAudio]  = useState(0);
  const [progressVideo,  setProgressVideo]  = useState(0);
  const [progressMerge,  setProgressMerge]  = useState(0);
  const [audioDone,      setAudioDone]      = useState(false);
  const [videoDone,      setVideoDone]      = useState(false);
  const [mergeDone,      setMergeDone]      = useState(false);
  const [audioError,     setAudioError]     = useState(false);
  const [videoError,     setVideoError]     = useState(false);
  const [mergeError,     setMergeError]     = useState(false);
  const [errorMsg,       setErrorMsg]       = useState("");

  // Port of the local embed proxy server
  const [embedPort, setEmbedPort] = useState(0);

  const cleanupAudioRef = useRef<(() => void) | null>(null);
  const cleanupVideoRef = useRef<(() => void) | null>(null);
  const cleanupMergeRef = useRef<(() => void) | null>(null);
  const api             = window.electronAPI;

  // Fetch embed server port once
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
      setPreviewMode("audio");
      setUrl("");
      setUrlInfo(null);
      setDownloadInfo(null);
      setDlType("merged");
      setProgressAudio(0);
      setProgressVideo(0);
      setProgressMerge(0);
      setAudioDone(false);
      setVideoDone(false);
      setMergeDone(false);
      setAudioError(false);
      setVideoError(false);
      setMergeError(false);
      setErrorMsg("");
      cleanupAudioRef.current?.();
      cleanupAudioRef.current = null;
      cleanupVideoRef.current?.();
      cleanupVideoRef.current = null;
      cleanupMergeRef.current?.();
      cleanupMergeRef.current = null;
    }
  }, [open]);

  // ── Search handler ───────────────────────────────────────────────────────
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

  // ── URL fetch handler ────────────────────────────────────────────────────
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

  // ── Core download ─────────────────────────────────────────────────────────
  const performDownload = async (
    videoUrl: string,
    info: VideoInfo,
    type: DownloadType,
  ) => {
    setDownloadInfo(info);
    setDlType(type);
    setStage("downloading");
    setProgressAudio(0);
    setProgressVideo(0);
    setProgressMerge(0);
    setAudioDone(false);
    setVideoDone(false);
    setMergeDone(false);
    setAudioError(false);
    setVideoError(false);
    setMergeError(false);

    const baseName     = sanitizeFilename(info.title);
    const downloadsDir = localStorage.getItem("settings-downloads-path") ?? "";
    const videosDir    = localStorage.getItem("settings-videos-path")    ?? "";

    // ── Merged: download audio + video then ffmpeg-merge into one MP4 ─────────
    if (type === "merged") {
      if (!api?.ytDownloadMerged) {
        setMergeError(true);
        setErrorMsg("Merged download not available.");
        setStage("error");
        return;
      }

      const cleanupA = api.onYtProgress(({ percent }) => setProgressAudio(percent));
      const cleanupV = api.onYtProgressVideo
        ? api.onYtProgressVideo(({ percent }) => setProgressVideo(percent))
        : () => {};
      const cleanupM = api.onYtProgressMerge
        ? api.onYtProgressMerge(({ percent }) => setProgressMerge(percent))
        : () => {};
      cleanupAudioRef.current = cleanupA;
      cleanupVideoRef.current = cleanupV;
      cleanupMergeRef.current = cleanupM;

      const result = await api.ytDownloadMerged(videoUrl);

      cleanupA(); cleanupV(); cleanupM();
      cleanupAudioRef.current = null;
      cleanupVideoRef.current = null;
      cleanupMergeRef.current = null;

      if ("error" in result) {
        setAudioError(true);
        setVideoError(true);
        setMergeError(true);
        setErrorMsg(result.error);
        setDownloadingId(null);
        setStage("error");
        return;
      }

      setAudioDone(true);   setProgressAudio(100);
      setVideoDone(true);   setProgressVideo(100);
      setMergeDone(true);   setProgressMerge(100);

      const mergedFilename = `${baseName}.mp4`;
      const mergedBytes    = new Uint8Array(result.bytes);
      const blob           = new Blob([mergedBytes], { type: "video/mp4" });
      const file           = new File([blob], mergedFilename, { type: "video/mp4" });

      // Prefer the Downloads folder; fall back to the Videos folder.
      const saveDir = downloadsDir || videosDir;
      if (saveDir && api?.writeFile) {
        await api.writeFile(`${saveDir}/${mergedFilename}`, mergedBytes);
      }

      await addFiles([file]);

      // Mark this track as a self-contained merged video so NowPlaying can
      // detect it and enable the video button without needing a companion file.
      const mergedTrackId = `${file.name}-${file.size}`;
      try {
        localStorage.setItem(`merged-video-trackid:${mergedTrackId}`, "1");
        if (saveDir) {
          localStorage.setItem(
            `merged-video-path:${mergedTrackId}`,
            `${saveDir}/${mergedFilename}`,
          );
        }
      } catch {}

      await updateTrackInfo(mergedTrackId, {
        title:  result.title,
        artist: result.author,
      });

      addDownloadRecord({
        id:           `merged-${Date.now()}`,
        trackId:      `${file.name}-${file.size}`,
        title:        result.title,
        artist:       result.author,
        ext:          "mp4",
        fileSize:     mergedBytes.byteLength,
        filePath:     saveDir ? `${saveDir}/${mergedFilename}` : null,
        downloadedAt: Date.now(),
        type:         "video",
      });

      setDownloadingId(null);
      setStage("done");
      return;
    }

    // ── Audio-only or Video-only ───────────────────────────────────────────────
    if (!api?.ytDownload || !api?.ytDownloadVideo) return;

    const doAudio = type === "audio";
    const doVideo = type === "video";

    const cleanupA = doAudio
      ? api.onYtProgress(({ percent }) => setProgressAudio(percent))
      : () => {};
    const cleanupV = doVideo && api.onYtProgressVideo
      ? api.onYtProgressVideo(({ percent }) => setProgressVideo(percent))
      : () => {};
    cleanupAudioRef.current = cleanupA;
    cleanupVideoRef.current = cleanupV;

    const [audioResult, videoResult] = await Promise.all([
      doAudio ? api.ytDownload(videoUrl) : Promise.resolve(null),
      doVideo ? api.ytDownloadVideo(videoUrl) : Promise.resolve(null),
    ]);

    cleanupA();
    cleanupV();
    cleanupAudioRef.current = null;
    cleanupVideoRef.current = null;

    let anySuccess = false;

    if (audioResult !== null) {
      if ("error" in audioResult) {
        setAudioError(true);
      } else {
        setAudioDone(true);
        setProgressAudio(100);

        const audioFilename = `${baseName}.${audioResult.ext}`;
        const audioBytes    = new Uint8Array(audioResult.bytes);
        const blob          = new Blob([audioBytes], { type: audioResult.mimeType });
        const file          = new File([blob], audioFilename, { type: audioResult.mimeType });

        if (downloadsDir && api?.writeFile) {
          await api.writeFile(`${downloadsDir}/${audioFilename}`, audioBytes);
        }

        await addFiles([file]);
        await updateTrackInfo(file.name + "-" + file.size, {
          title:  audioResult.title,
          artist: audioResult.author,
        });

        addDownloadRecord({
          id:           `audio-${Date.now()}`,
          trackId:      `${file.name}-${file.size}`,
          title:        audioResult.title,
          artist:       audioResult.author,
          ext:          audioResult.ext,
          fileSize:     audioBytes.byteLength,
          filePath:     downloadsDir ? `${downloadsDir}/${audioFilename}` : null,
          downloadedAt: Date.now(),
          type:         "audio",
        });

        anySuccess = true;
      }
    }

    if (videoResult !== null) {
      if ("error" in videoResult) {
        setVideoError(true);
      } else {
        setVideoDone(true);
        setProgressVideo(100);

        const videoFilename = `${baseName}.mp4`;
        const videoBytes    = new Uint8Array(videoResult.bytes);
        const blob          = new Blob([videoBytes], { type: "video/mp4" });
        const file          = new File([blob], videoFilename, { type: "video/mp4" });

        if (videosDir && api?.writeFile) {
          await api.writeFile(`${videosDir}/${videoFilename}`, videoBytes);
        }

        await addFiles([file]);
        await updateTrackInfo(file.name + "-" + file.size, {
          title:  videoResult.title,
          artist: videoResult.author,
        });

        addDownloadRecord({
          id:           `video-${Date.now()}`,
          trackId:      `${file.name}-${file.size}`,
          title:        videoResult.title,
          artist:       videoResult.author,
          ext:          "mp4",
          fileSize:     videoBytes.byteLength,
          filePath:     videosDir ? `${videosDir}/${videoFilename}` : null,
          downloadedAt: Date.now(),
          type:         "video",
        });

        anySuccess = true;
      }
    }

    setDownloadingId(null);

    if (anySuccess) {
      setStage("done");
    } else {
      setErrorMsg("Download failed. Check your internet connection.");
      setStage("error");
    }
  };

  // ── Derived success message ───────────────────────────────────────────────
  function successMessage(): string {
    if (dlType === "audio")  return "✅ Audio (MP3) downloaded";
    if (dlType === "merged") return mergeDone ? "✅ Video + Audio MP4 saved" : "⚠️ Merge failed";
    return "✅ Downloaded";
  }

  // ── Derived flags ────────────────────────────────────────────────────────
  const isElectron    = !!api?.ytSearch;
  const isDownloading = stage === "downloading";
  const isDone        = stage === "done";
  const showControls  = isElectron && !isDownloading && !isDone;

  // ── Render ────────────────────────────────────────────────────────────────
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
            <div className="space-y-3">
              {(dlType === "audio" || dlType === "merged") && (
                <ProgressBar
                  label={dlType === "merged" ? "Downloading audio stream…" : "MP3 Audio"}
                  percent={progressAudio}
                  done={audioDone}
                  error={audioError}
                />
              )}
              {dlType === "merged" && (
                <ProgressBar
                  label="Downloading video stream…"
                  percent={progressVideo}
                  done={videoDone}
                  error={videoError}
                />
              )}
              {dlType === "merged" && (
                <ProgressBar
                  label={mergeDone ? "Saved!" : "Merging into MP4…"}
                  percent={progressMerge}
                  done={mergeDone}
                  error={mergeError}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {isElectron && isDone && (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <Download className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm font-medium">{successMessage()}</p>
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

            {/* ── Search / URL mode toggle ── */}
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

                {stage === "error" && errorMsg && (
                  <p className="text-xs text-destructive text-center">{errorMsg}</p>
                )}

                {stage === "results" && searchResults.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No results found.
                  </p>
                )}

                {stage === "results" && searchResults.length > 0 && (
                  <div className="space-y-2">
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

                          {/* Per-song preview buttons */}
                          <div className="flex shrink-0 gap-1">
                            {/* 🎵 Audio preview */}
                            <button
                              title="Preview audio"
                              onClick={() => {
                                if (previewId === r.videoId && previewMode === "audio") {
                                  setPreviewId(null);
                                } else {
                                  setPreviewMode("audio");
                                  setPreviewId(r.videoId);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all",
                                previewId === r.videoId && previewMode === "audio"
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-card-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                              )}
                            >
                              🎵
                            </button>

                            {/* 🎬 Video preview */}
                            <button
                              title="Preview video"
                              onClick={() => {
                                if (previewId === r.videoId && previewMode === "video") {
                                  setPreviewId(null);
                                } else {
                                  setPreviewMode("video");
                                  setPreviewId(r.videoId);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all",
                                previewId === r.videoId && previewMode === "video"
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-card-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                              )}
                            >
                              🎬
                            </button>
                          </div>

                          {/* Download button with popup */}
                          <DownloadButton
                            id={r.videoId}
                            downloadingId={downloadingId}
                            onPick={(type) => {
                              setDownloadingId(r.videoId);
                              performDownload(r.url, {
                                title:        r.title,
                                author:       r.channelName,
                                durationSecs: r.durationSecs,
                                thumbnailUrl: r.thumbnail || null,
                              }, type);
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Inline preview panel */}
                    {previewId && (
                      <div className="rounded-lg border border-primary/40 bg-card overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                            {previewMode === "audio" ? "🎵 Audio preview" : "🎬 Video preview"}
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

                        {previewMode === "audio" ? (
                          <audio
                            key={previewId}
                            controls
                            autoPlay
                            src={
                              embedPort
                                ? `http://127.0.0.1:${embedPort}/stream?v=${previewId}`
                                : undefined
                            }
                            className="w-full px-3 py-2"
                            style={{ display: "block" }}
                          />
                        ) : (
                          <video
                            key={previewId}
                            controls
                            autoPlay
                            src={
                              embedPort
                                ? `http://127.0.0.1:${embedPort}/video-stream?v=${previewId}`
                                : undefined
                            }
                            className="w-full bg-black"
                            style={{ height: 220, display: "block" }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── URL (paste) mode ── */}
            {mode === "url" && (
              <div className="space-y-3">
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

                {stage === "error" && errorMsg && (
                  <p className="text-xs text-destructive text-center">{errorMsg}</p>
                )}

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

                {stage === "ready" && urlInfo && (
                  <div className="flex justify-end">
                    <DownloadButton
                      id="url"
                      downloadingId={downloadingId}
                      onPick={(type) =>
                        performDownload(url.trim(), urlInfo!, type)
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
