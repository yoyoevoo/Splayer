import { useEffect, useRef, useState } from "react";
import { Loader2, Mic2, MicOff, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import { cn } from "@/lib/utils";

interface LyricsLine {
  time: number;
  text: string;
}

function parseLrc(lrc: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]([^\[]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lrc)) !== null) {
    const mins = parseInt(m[1], 10);
    const secs = parseFloat(m[2]);
    const text = m[3].trim();
    lines.push({ time: mins * 60 + secs, text });
  }
  return lines.sort((a, b) => a.time - b.time).filter((l) => l.text);
}

type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "synced"; lines: LyricsLine[] }
  | { status: "plain"; text: string }
  | { status: "none" };

interface CacheEntry {
  syncedLyrics?: string;
  plainLyrics?: string;
  notFound?: boolean;
}

function cacheKey(title: string, artist: string): string {
  return `lyrics-v1:${title.toLowerCase().trim()}|${artist.toLowerCase().trim()}`;
}

function loadFromCache(key: string): LyricsState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.notFound) return { status: "none" };
    if (entry.syncedLyrics) {
      const lines = parseLrc(entry.syncedLyrics);
      if (lines.length > 0) return { status: "synced", lines };
    }
    if (entry.plainLyrics) return { status: "plain", text: entry.plainLyrics };
    return null;
  } catch {
    return null;
  }
}

function saveToCache(key: string, entry: CacheEntry) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // storage full — skip silently
  }
}

interface LyricsPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function LyricsPanel({ open, onOpenChange }: LyricsPanelProps) {
  const { currentTrack, currentTime } = usePlayer();
  const [lyrics, setLyrics] = useState<LyricsState>({ status: "idle" });
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const doFetch = (trackId: string, title: string, artist: string, album: string, duration: number, bust: boolean) => {
    const key = cacheKey(title, artist);

    if (!bust) {
      const cached = loadFromCache(key);
      if (cached) {
        setLyrics(cached);
        setFetchedFor(trackId);
        setFromCache(true);
        setRefreshing(false);
        return;
      }
    } else {
      localStorage.removeItem(key);
    }

    setFromCache(false);
    setLyrics({ status: "loading" });
    setFetchedFor(trackId);

    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
      album_name: album,
      duration: Math.round(duration).toString(),
    });

    fetch(`https://lrclib.net/api/get?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          saveToCache(key, { notFound: true });
          setLyrics({ status: "none" });
          return;
        }
        if (data.syncedLyrics) {
          const lines = parseLrc(data.syncedLyrics);
          if (lines.length > 0) {
            saveToCache(key, { syncedLyrics: data.syncedLyrics });
            setLyrics({ status: "synced", lines });
            setRefreshing(false);
            return;
          }
        }
        if (data.plainLyrics) {
          saveToCache(key, { plainLyrics: data.plainLyrics });
          setLyrics({ status: "plain", text: data.plainLyrics });
        } else {
          saveToCache(key, { notFound: true });
          setLyrics({ status: "none" });
        }
        setRefreshing(false);
      })
      .catch(() => {
        setLyrics({ status: "none" });
        setRefreshing(false);
      });
  };

  // Fetch/load lyrics whenever track or panel changes
  useEffect(() => {
    if (!open || !currentTrack) {
      if (!currentTrack) setLyrics({ status: "idle" });
      return;
    }
    if (fetchedFor === currentTrack.id) return;

    doFetch(
      currentTrack.id,
      currentTrack.title,
      currentTrack.artist,
      currentTrack.album,
      currentTrack.duration,
      false,
    );
  }, [open, currentTrack, fetchedFor]); // eslint-disable-line

  // Reset when track changes
  useEffect(() => {
    if (currentTrack?.id !== fetchedFor) {
      setFetchedFor(null);
      setFromCache(false);
    }
  }, [currentTrack?.id, fetchedFor]);

  const handleRefresh = () => {
    if (!currentTrack || refreshing) return;
    setRefreshing(true);
    doFetch(
      currentTrack.id,
      currentTrack.title,
      currentTrack.artist,
      currentTrack.album,
      currentTrack.duration,
      true,
    );
  };

  // Determine active line index
  let activeIdx = -1;
  if (lyrics.status === "synced") {
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= currentTime + 0.3) activeIdx = i;
      else break;
    }
  }

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  const showRefresh = currentTrack && lyrics.status !== "loading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[520px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-card-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Mic2 className="w-4 h-4 text-primary" />
            Lyrics
            {currentTrack && (
              <span className="text-muted-foreground font-normal ml-1 truncate max-w-[180px]">
                — {currentTrack.title}
              </span>
            )}
            {fromCache && (
              <span className="text-[10px] text-muted-foreground/60 ml-1 font-normal hidden sm:inline">
                (cached)
              </span>
            )}
            {showRefresh && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Re-fetch lyrics from the web"
              >
                <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
                {fromCache ? "Refresh" : "Retry"}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5">
            {!currentTrack && (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nothing playing
              </p>
            )}

            {lyrics.status === "loading" && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Fetching lyrics…</span>
              </div>
            )}

            {lyrics.status === "none" && (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <MicOff className="w-6 h-6 opacity-40" />
                <p className="text-sm">No lyrics found for this track</p>
              </div>
            )}

            {lyrics.status === "synced" && (
              <div className="space-y-1 text-center">
                {lyrics.lines.map((line, i) => {
                  const isActive = i === activeIdx;
                  const isPast = i < activeIdx;
                  return (
                    <div
                      key={i}
                      ref={isActive ? activeLineRef : undefined}
                      className={cn(
                        "px-2 py-1 rounded transition-all duration-300 text-base leading-relaxed select-none",
                        isActive
                          ? "text-foreground font-semibold scale-105"
                          : isPast
                            ? "text-muted-foreground/50"
                            : "text-muted-foreground/70",
                      )}
                    >
                      {line.text}
                    </div>
                  );
                })}
              </div>
            )}

            {lyrics.status === "plain" && (
              <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {lyrics.text}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
