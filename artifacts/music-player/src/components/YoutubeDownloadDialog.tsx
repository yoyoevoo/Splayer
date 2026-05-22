import { useState, useEffect, useCallback } from "react";
import { platformAPI } from "@/lib/platform-api";
import {
  ChevronLeft,
  Download,
  Loader2,
  Music2,
  Search,
  Video,
  X,
  Youtube,
  ListMusic,
} from "lucide-react";
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

type Mode        = "search" | "playlist" | "url";
type PreviewMode = "audio" | "video";
type Stage       = "idle" | "searching" | "results" | "error";
type PlStage     = "idle" | "fetching" | "preview";

interface SearchResult {
  videoId:      string;
  url:          string;
  title:        string;
  channelName:  string;
  durationSecs: number;
  durationText: string;
  thumbnail:    string;
}

interface PendingDownload {
  url:          string;
  title:        string;
  author:       string;
  thumbnailUrl: string | null;
}

interface PlaylistEntry {
  id:        string;
  title:     string;
  duration:  number | null;
  thumbnail: string | null;
  url:       string;
  selected:  boolean;
}

const VIDEO_QUALITIES = [
  { label: "1080p", formatId: "1080", recommended: false },
  { label: "720p",  formatId: "720",  recommended: true  },
  { label: "480p",  formatId: "480",  recommended: false },
  { label: "360p",  formatId: "360",  recommended: false },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isYoutubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/.test(url.trim());
}

function isPlaylistUrl(url: string): boolean {
  return /[?&]list=[A-Za-z0-9_-]+/.test(url) ||
         /youtube\.com\/playlist\b/.test(url) ||
         /music\.youtube\.com\//.test(url);
}

function fmtDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(Math.round(s)).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function YoutubeDownloadDialog({ open, onOpenChange }: Props) {
  const { startDownload } = usePlayer();

  const [mode,        setMode]        = useState<Mode>("search");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("audio");
  const [stage,       setStage]       = useState<Stage>("idle");

  const [query,         setQuery]         = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [previewId,     setPreviewId]     = useState<string | null>(null);

  const [url,             setUrl]             = useState("");
  const [errorMsg,        setErrorMsg]        = useState("");
  const [pendingDownload, setPendingDownload] = useState<PendingDownload | null>(null);
  const [awaitingQuality, setAwaitingQuality] = useState(false);

  // Playlist mode state
  const [plUrl,     setPlUrl]     = useState("");
  const [plStage,   setPlStage]   = useState<PlStage>("idle");
  const [plError,   setPlError]   = useState("");
  const [plTitle,   setPlTitle]   = useState("");
  const [plChannel, setPlChannel] = useState("");
  const [plEntries, setPlEntries] = useState<PlaylistEntry[]>([]);

  const [embedPort, setEmbedPort] = useState(0);
  const api = platformAPI;

  useEffect(() => {
    if (open && api?.getEmbedPort && embedPort === 0) {
      api.getEmbedPort().then(setEmbedPort);
    }
  }, [open, api, embedPort]);

  useEffect(() => {
    if (!open) {
      setMode("search");
      setStage("idle");
      setQuery("");
      setSearchResults([]);
      setPreviewId(null);
      setPreviewMode("audio");
      setUrl("");
      setErrorMsg("");
      setPendingDownload(null);
      setAwaitingQuality(false);
      setPlUrl("");
      setPlStage("idle");
      setPlError("");
      setPlTitle("");
      setPlChannel("");
      setPlEntries([]);
    }
  }, [open]);

  // ── Search ────────────────────────────────────────────────────────────────

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

  // ── Single-URL mode ───────────────────────────────────────────────────────

  const openFormatPicker = (pd: PendingDownload) => {
    setAwaitingQuality(false);
    setPendingDownload(pd);
  };

  const confirmDownload = (type: "audio" | "merged", videoFormatId?: string | null) => {
    if (!pendingDownload) return;
    startDownload(pendingDownload.url, {
      title:        pendingDownload.title,
      author:       pendingDownload.author,
      thumbnailUrl: pendingDownload.thumbnailUrl,
    }, type, videoFormatId);
    onOpenChange(false);
  };

  const handleUrlDownload = () => {
    const trimmed = url.trim();
    if (!isYoutubeUrl(trimmed)) {
      setErrorMsg("Please enter a valid YouTube URL");
      return;
    }
    setErrorMsg("");
    openFormatPicker({ url: trimmed, title: trimmed, author: "", thumbnailUrl: null });
  };

  // ── Playlist mode ─────────────────────────────────────────────────────────

  const handlePlaylistFetch = useCallback(async () => {
    const trimmed = plUrl.trim();
    if (!trimmed) return;
    setPlStage("fetching");
    setPlError("");

    const result = await (api as any)?.ytGetPlaylist?.(trimmed);
    if (!result || "error" in result) {
      setPlError((result as any)?.error ?? "Failed to fetch playlist. Check the URL and try again.");
      setPlStage("idle");
      return;
    }
    setPlTitle(result.title);
    setPlChannel(result.description?.split("\n")?.[0] ?? "");
    setPlEntries(
      (result.entries ?? []).map((e: any) => ({
        id:        e.id,
        title:     e.title || e.id,
        duration:  e.duration ?? null,
        thumbnail: e.thumbnail ?? null,
        url:       e.url ?? `https://www.youtube.com/watch?v=${e.id}`,
        selected:  true,
      })),
    );
    setPlStage("preview");
  }, [plUrl, api]);

  const plSelected    = plEntries.filter((e) => e.selected);
  const plAllSelected = plEntries.length > 0 && plEntries.every((e) => e.selected);
  const plNoneSelected = plEntries.every((e) => !e.selected);

  function togglePlEntry(id: string) {
    setPlEntries((prev) => prev.map((e) => e.id === id ? { ...e, selected: !e.selected } : e));
  }
  function toggleAllPl(val: boolean) {
    setPlEntries((prev) => prev.map((e) => ({ ...e, selected: val })));
  }

  const handleBatchDownload = () => {
    for (const entry of plSelected) {
      startDownload(
        entry.url,
        { title: entry.title, author: plTitle, thumbnailUrl: entry.thumbnail },
        "audio",
      );
    }
    onOpenChange(false);
  };

  const isElectron = !!api?.ytSearch;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-500" />
            Download from YouTube
          </DialogTitle>
        </DialogHeader>

        {/* ── Not available outside Electron ── */}
        {!isElectron && (
          <div className="py-8 text-center space-y-3">
            <Music2 className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Available only in the desktop app.</p>
          </div>
        )}

        {/* ── Format picker screen ── */}
        {isElectron && pendingDownload && !awaitingQuality && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2">
              <button onClick={() => setPendingDownload(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">Choose format</span>
            </div>

            {pendingDownload.title && pendingDownload.title !== pendingDownload.url && (
              <div className="flex gap-3 rounded-lg border border-card-border bg-card p-3">
                {pendingDownload.thumbnailUrl ? (
                  <img src={pendingDownload.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                    <Music2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 self-center">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{pendingDownload.title}</p>
                  {pendingDownload.author && (
                    <p className="text-xs text-muted-foreground mt-0.5">{pendingDownload.author}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <button onClick={() => confirmDownload("audio")}
                className="w-full flex items-center gap-4 rounded-xl border-2 border-card-border bg-card px-4 py-4 text-left hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] transition-all">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-500">
                  <Music2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">Audio Only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">MP3 · Best quality audio</p>
                </div>
              </button>
              <button onClick={() => setAwaitingQuality(true)}
                className="w-full flex items-center gap-4 rounded-xl border-2 border-card-border bg-card px-4 py-4 text-left hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] transition-all">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
                  <Video className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">Video + Audio</p>
                  <p className="text-xs text-muted-foreground mt-0.5">MP4 · Includes video</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Quality picker screen ── */}
        {isElectron && pendingDownload && awaitingQuality && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2">
              <button onClick={() => setAwaitingQuality(false)}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">Choose quality</span>
            </div>
            <div className="space-y-2.5">
              {VIDEO_QUALITIES.map((q) => (
                <button key={q.formatId} onClick={() => confirmDownload("merged", q.formatId)}
                  className="w-full flex items-center gap-4 rounded-xl border-2 border-card-border bg-card px-4 py-3.5 text-left hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] transition-all">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
                    <Video className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{q.label}</p>
                    {q.recommended && <p className="text-xs text-muted-foreground mt-0.5">Recommended</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Main tabs ── */}
        {isElectron && !pendingDownload && (
          <div className="space-y-2.5 pt-0.5">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-card-border overflow-hidden text-sm">
              {(["search", "playlist", "url"] as Mode[]).map((m) => (
                <button key={m} onClick={() => {
                  setMode(m);
                  setStage("idle");
                  setErrorMsg("");
                  setSearchResults([]);
                  setPreviewId(null);
                  setPlStage("idle");
                  setPlError("");
                  setPlEntries([]);
                }}
                  className={cn(
                    "flex-1 py-1.5 font-medium transition-colors text-xs",
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}>
                  {m === "search" ? "Search" : m === "playlist" ? "Playlist" : "URL"}
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
                    onChange={(e) => { setQuery(e.target.value); if (stage === "error") setStage("idle"); }}
                    onKeyDown={(e) => e.key === "Enter" && stage !== "searching" && handleSearch()}
                    disabled={stage === "searching"}
                    className="flex-1 text-sm"
                    autoFocus
                  />
                  <Button variant="outline" size="sm" onClick={handleSearch}
                    disabled={!query.trim() || stage === "searching"}>
                    {stage === "searching" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </Button>
                </div>

                {stage === "error" && errorMsg && (
                  <p className="text-xs text-destructive text-center">{errorMsg}</p>
                )}
                {stage === "results" && searchResults.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">No results found.</p>
                )}

                {stage === "results" && searchResults.length > 0 && (
                  <div className="space-y-2">
                    <div className="space-y-2 max-h-[50vh] sm:max-h-[280px] overflow-y-auto pb-20 sm:pb-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                      {searchResults.map((r) => (
                        <div key={r.videoId}
                          className={cn("rounded-lg border bg-card p-3 transition-colors",
                            previewId === r.videoId ? "border-primary/60" : "border-card-border")}>
                          <div className="flex gap-3 mb-2.5">
                            {r.thumbnail ? (
                              <img src={r.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                                <Music2 className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-medium leading-snug">{r.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {r.channelName}{r.durationText ? ` · ${r.durationText}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <button title="Preview audio"
                              onClick={() => { if (previewId === r.videoId && previewMode === "audio") { setPreviewId(null); } else { setPreviewMode("audio"); setPreviewId(r.videoId); } }}
                              className={cn("flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all",
                                previewId === r.videoId && previewMode === "audio"
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-card-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                              🎵
                            </button>
                            <button title="Preview video"
                              onClick={() => { if (previewId === r.videoId && previewMode === "video") { setPreviewId(null); } else { setPreviewMode("video"); setPreviewId(r.videoId); } }}
                              className={cn("flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all",
                                previewId === r.videoId && previewMode === "video"
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-card-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                              🎬
                            </button>
                            <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                              onClick={() => openFormatPicker({ url: r.url, title: r.title, author: r.channelName, thumbnailUrl: r.thumbnail || null })}>
                              <Download className="h-3 w-3" />
                              Download
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {previewId && (
                      <div className="rounded-lg border border-primary/40 bg-card overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                          <span className="text-xs text-muted-foreground font-medium">
                            {previewMode === "audio" ? "🎵 Audio preview" : "🎬 Video preview"}
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setPreviewId(null)}>
                            <X className="h-3 w-3" /> Close
                          </Button>
                        </div>
                        {previewMode === "audio" ? (
                          <audio key={previewId} controls autoPlay
                            src={embedPort ? `http://127.0.0.1:${embedPort}/stream?v=${previewId}` : undefined}
                            className="w-full px-3 py-2" style={{ display: "block" }} />
                        ) : (
                          <video key={previewId} controls autoPlay
                            src={embedPort ? `http://127.0.0.1:${embedPort}/video-stream?v=${previewId}` : undefined}
                            className="w-full bg-black aspect-video max-h-[180px] sm:max-h-[220px]" style={{ display: "block" }} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Playlist / YT Music mode ── */}
            {mode === "playlist" && (
              <div className="space-y-3">
                {plStage !== "preview" && (
                  <>
                    <div className="flex gap-2">
                      <Input
                        placeholder="YouTube or YouTube Music playlist URL…"
                        value={plUrl}
                        onChange={(e) => { setPlUrl(e.target.value); setPlError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && plStage !== "fetching" && handlePlaylistFetch()}
                        disabled={plStage === "fetching"}
                        className="flex-1 text-sm"
                        autoFocus
                      />
                      <Button variant="outline" size="sm"
                        onClick={handlePlaylistFetch}
                        disabled={!plUrl.trim() || plStage === "fetching"}>
                        {plStage === "fetching"
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Search className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    {plError && (
                      <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                        {plError}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Paste any YouTube playlist URL or YouTube Music playlist URL.
                      Each video will be added to the download queue as audio.
                    </p>
                  </>
                )}

                {plStage === "preview" && plEntries.length > 0 && (
                  <>
                    {/* Playlist header */}
                    <div className="flex items-center gap-3 rounded-lg border border-card-border bg-card px-3 py-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-500">
                        <ListMusic className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{plTitle}</p>
                        <p className="text-xs text-muted-foreground">{plEntries.length} videos</p>
                      </div>
                      <button onClick={() => { setPlStage("idle"); setPlEntries([]); setPlTitle(""); }}
                        className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Select all / none */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                      <span>{plSelected.length} of {plEntries.length} selected</span>
                      <div className="flex gap-3">
                        <button className="hover:text-foreground" onClick={() => toggleAllPl(true)}  disabled={plAllSelected}>Select all</button>
                        <button className="hover:text-foreground" onClick={() => toggleAllPl(false)} disabled={plNoneSelected}>Deselect all</button>
                      </div>
                    </div>

                    {/* Entry list */}
                    <div className="overflow-y-auto max-h-[260px] space-y-1 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                      {plEntries.map((entry, idx) => (
                        <div key={entry.id}
                          onClick={() => togglePlEntry(entry.id)}
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors">
                          {/* Checkbox */}
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                            entry.selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                          )}>
                            {entry.selected && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] text-muted-foreground/50 w-5 text-right font-mono">{idx + 1}</span>
                          {entry.thumbnail ? (
                            <img src={entry.thumbnail} alt="" className="h-7 w-12 shrink-0 rounded object-cover" />
                          ) : (
                            <div className="h-7 w-12 shrink-0 rounded bg-muted flex items-center justify-center">
                              <Music2 className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <p className="min-w-0 flex-1 text-xs truncate">{entry.title}</p>
                          {entry.duration != null && (
                            <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono">
                              {fmtDuration(entry.duration)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Download button */}
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      disabled={plSelected.length === 0}
                      onClick={handleBatchDownload}>
                      <Download className="w-3.5 h-3.5" />
                      Queue {plSelected.length} download{plSelected.length !== 1 ? "s" : ""}
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Downloads run in the background — watch the queue badge in the top bar.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── URL mode ── */}
            {mode === "url" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setErrorMsg(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlDownload()}
                    className="flex-1 text-sm"
                    autoFocus
                  />
                  <Button variant="default" size="sm" onClick={handleUrlDownload} disabled={!url.trim()} className="gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </Button>
                </div>
                {errorMsg && <p className="text-xs text-destructive text-center">{errorMsg}</p>}
                <p className="text-[11px] text-muted-foreground">
                  For playlists, use the <strong>Playlist</strong> tab above.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
