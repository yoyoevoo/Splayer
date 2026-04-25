import { useEffect, useRef, useState } from "react";
import { Loader2, Mic2, MicOff, RefreshCw } from "lucide-react";
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

export function LyricsPanel({ open, onOpenChange: _onOpenChange }: LyricsPanelProps) {
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

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 rounded-2xl overflow-hidden flex flex-col"
      style={{ zIndex: 5 }}
    >
      {/* Dark semi-transparent backdrop — album art + visualizer remain visible behind */}
      <div className="absolute inset-0 rounded-2xl bg-black/60" />

      {/* Top bar: icon + cached label + refresh */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <Mic2 className="w-3.5 h-3.5 text-white/70" />
          {fromCache && (
            <span className="text-[10px] text-white/40 font-normal">cached</span>
          )}
        </div>
        {showRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Re-fetch lyrics from the web"
            className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
            {fromCache ? "Refresh" : "Retry"}
          </button>
        )}
      </div>

      {/* Scrollable lyrics area */}
      <div className="relative z-10 flex-1 overflow-y-auto scroll-smooth px-4 pb-4">

        {!currentTrack && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-white/50">Nothing playing</p>
          </div>
        )}

        {lyrics.status === "loading" && (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Fetching lyrics…</span>
          </div>
        )}

        {lyrics.status === "none" && (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-white/50">
            <MicOff className="w-5 h-5 opacity-50" />
            <p className="text-xs">No lyrics found</p>
          </div>
        )}

        {lyrics.status === "synced" && (
          <div className="space-y-0.5 text-center pt-4">
            {lyrics.lines.map((line, i) => {
              const isActive = i === activeIdx;
              const isPast = i < activeIdx;
              return (
                <div
                  key={i}
                  ref={isActive ? activeLineRef : undefined}
                  className={cn(
                    "px-2 py-1 rounded transition-all duration-300 leading-snug select-none",
                    isActive
                      ? "text-white font-bold text-base scale-105"
                      : isPast
                        ? "text-white/40 text-sm"
                        : "text-white/55 text-sm",
                  )}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        )}

        {lyrics.status === "plain" && (
          <div className="text-xs text-white/75 leading-relaxed whitespace-pre-wrap text-center pt-4">
            {lyrics.text}
          </div>
        )}
      </div>
    </div>
  );
}
