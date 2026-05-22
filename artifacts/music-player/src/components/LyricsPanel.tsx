import { useEffect, useRef, useState } from "react";
import { Loader2, Mic2, MicOff, RefreshCw, Search, X, Check, Download } from "lucide-react";
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
  | { status: "synced"; lines: LyricsLine[]; raw?: string }
  | { status: "plain"; text: string }
  | { status: "none" }
  | { status: "results"; results: SearchResult[] };

interface SearchResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  syncedLyrics?: string;
  plainLyrics?: string;
  duration?: number;
}

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
      if (lines.length > 0) return { status: "synced", lines, raw: entry.syncedLyrics };
    }
    if (entry.plainLyrics) return { status: "plain", text: entry.plainLyrics };
    return null;
  } catch { return null; }
}

const _LYRICS_CACHE_MAX = 50 * 1024; // 50 KB

function saveToCache(key: string, entry: CacheEntry) {
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > _LYRICS_CACHE_MAX) return;
    localStorage.setItem(key, serialized);
  } catch {}
}

function fmtDuration(secs?: number) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface LyricsPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function LyricsPanel({ open, onOpenChange }: LyricsPanelProps) {
  const { currentTrack, currentTime, seek } = usePlayer();
  const [lyrics, setLyrics] = useState<LyricsState>({ status: "idle" });
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchByParams = (
    title: string, artist: string, album: string, duration: number,
    onDone: (s: LyricsState) => void
  ) => {
    const params = new URLSearchParams({
      track_name: title, artist_name: artist,
      album_name: album, duration: Math.round(duration).toString()
    });
    fetch(`https://lrclib.net/api/get?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { onDone({ status: "none" }); return; }
        if (data.syncedLyrics) {
          const lines = parseLrc(data.syncedLyrics);
          if (lines.length > 0) { onDone({ status: "synced", lines, raw: data.syncedLyrics }); return; }
        }
        if (data.plainLyrics) onDone({ status: "plain", text: data.plainLyrics });
        else onDone({ status: "none" });
      })
      .catch(() => onDone({ status: "none" }));
  };

  const doSearch = async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setLyrics({ status: "loading" });
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error();
      const data: SearchResult[] = await res.json();
      if (!data || data.length === 0) {
        setLyrics({ status: "none" });
      } else {
        setLyrics({ status: "results", results: data.slice(0, 8) });
      }
    } catch {
      setLyrics({ status: "none" });
    }
    setSearching(false);
  };

  const pickResult = (result: SearchResult) => {
    if (result.syncedLyrics) {
      const lines = parseLrc(result.syncedLyrics);
      if (lines.length > 0) {
        setLyrics({ status: "synced", lines, raw: result.syncedLyrics });
        if (currentTrack) {
          const key = cacheKey(currentTrack.title, currentTrack.artist);
          saveToCache(key, { syncedLyrics: result.syncedLyrics });
        }
        return;
      }
    }
    if (result.plainLyrics) {
      setLyrics({ status: "plain", text: result.plainLyrics });
      if (currentTrack) {
        const key = cacheKey(currentTrack.title, currentTrack.artist);
        saveToCache(key, { plainLyrics: result.plainLyrics });
      }
    }
  };

  const doFetch = (
    trackId: string, title: string, artist: string,
    album: string, duration: number, bust: boolean
  ) => {
    const key = cacheKey(title, artist);
    if (!bust) {
      const cached = loadFromCache(key);
      if (cached) { setLyrics(cached); setFetchedFor(trackId); setFromCache(true); setRefreshing(false); return; }
    } else { localStorage.removeItem(key); }
    setFromCache(false); setLyrics({ status: "loading" }); setFetchedFor(trackId);
    fetchByParams(title, artist, album, duration, (state) => {
      if (state.status === "synced") saveToCache(key, { syncedLyrics: (state as any).raw });
      else if (state.status === "plain") saveToCache(key, { plainLyrics: (state as any).text });
      else saveToCache(key, { notFound: true });
      setLyrics(state); setRefreshing(false);
    });
  };

  const handleManualSearch = () => {
    if (!searchQuery.trim() || searching) return;
    doSearch(searchQuery);
  };

  useEffect(() => {
    if (!open || !currentTrack) { if (!currentTrack) setLyrics({ status: "idle" }); return; }
    if (fetchedFor === currentTrack.id) return;
    doFetch(currentTrack.id, currentTrack.title, currentTrack.artist, currentTrack.album, currentTrack.duration, false);
  }, [open, currentTrack, fetchedFor]); // eslint-disable-line

  useEffect(() => {
    if (currentTrack?.id !== fetchedFor) { setFetchedFor(null); setFromCache(false); setSearchQuery(""); }
  }, [currentTrack?.id, fetchedFor]);

  useEffect(() => {
    if (currentTrack) {
      const cleanTitle = currentTrack.title
        .replace(/\(.*?(official|video|audio|lyric|hd|4k|mv).*?\)/gi, "")
        .replace(/\[.*?\]/gi, "").trim();
      if (currentTrack.artist && currentTrack.artist !== "Unknown Artist") {
        setSearchQuery(`${currentTrack.artist} - ${cleanTitle}`);
      } else if (cleanTitle.includes(" - ")) {
        setSearchQuery(cleanTitle);
      } else {
        setSearchQuery(cleanTitle);
      }
    }
  }, [currentTrack?.id]); // eslint-disable-line

  const handleRefresh = () => {
    if (!currentTrack || refreshing) return;
    setRefreshing(true);
    doFetch(currentTrack.id, currentTrack.title, currentTrack.artist, currentTrack.album, currentTrack.duration, true);
  };

  let activeIdx = -1;
  if (lyrics.status === "synced") {
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= currentTime + 0.3) activeIdx = i; else break;
    }
  }

  useEffect(() => {
    if (activeLineRef.current) activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  const resultCount = lyrics.status === "results" ? lyrics.results.length : lyrics.status === "synced" || lyrics.status === "plain" ? 1 : 0;

  if (!open) return null;

  return (
    <div className="absolute inset-0 rounded-2xl overflow-hidden flex flex-col" style={{ zIndex: 5 }}>
      <div className="absolute inset-0 rounded-2xl bg-black/75 backdrop-blur-sm" />
      <div className="relative z-10 flex items-center justify-between px-3 pt-3 pb-2 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2">
          {resultCount > 0 && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-white text-[10px] font-bold">
              {resultCount}
            </span>
          )}
          <span className="text-white text-sm font-semibold tracking-wide">Lyrics</span>
        </div>
        <div className="flex items-center gap-1">
          {fromCache && (
            <button onClick={handleRefresh} disabled={refreshing} title="Refresh lyrics"
              className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40">
              <RefreshCw className={cn("w-3.5 h-3.5 text-white/60", refreshing && "animate-spin")} />
            </button>
          )}
          <button onClick={() => onOpenChange(false)}
            className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
      </div>
      <div className="relative z-10 px-3 pt-2 pb-2 shrink-0">
        <div className="flex gap-2 items-center bg-white/10 rounded-xl px-3 py-2 border border-white/10 focus-within:border-white/30 transition-colors">
          <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
            placeholder="Artist - Song title"
            className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-white/30 min-w-0"
          />
          {searching ? (
            <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin shrink-0" />
          ) : (
            <button onClick={handleManualSearch} disabled={!searchQuery.trim()}
              className="text-white/50 hover:text-white transition-colors disabled:opacity-30 shrink-0">
              <Search className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto scroll-smooth px-3 pb-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
        {lyrics.status === "loading" && (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Fetching lyrics…</span>
          </div>
        )}
        {lyrics.status === "none" && (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-white/40">
            <MicOff className="w-5 h-5 opacity-50" />
            <p className="text-xs">No lyrics found — try searching above</p>
          </div>
        )}
        {lyrics.status === "results" && (
          <div className="flex flex-col gap-2 pt-1">
            {lyrics.results.map((result) => {
              const isSynced = !!result.syncedLyrics && parseLrc(result.syncedLyrics).length > 0;
              const preview = isSynced
                ? result.syncedLyrics!.split("\n").slice(0, 6).join("\n")
                : result.plainLyrics?.split("\n").slice(0, 6).join("\n") ?? "";
              return (
                <div key={result.id} className="rounded-xl bg-white/8 border border-white/10 overflow-hidden hover:border-white/25 transition-colors">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Download className="w-3 h-3 text-white/50" />
                        <span className="text-[10px] text-white/60 font-medium">{isSynced ? "Synced" : "Plain"}</span>
                      </div>
                      {result.duration && (
                        <span className="text-[10px] text-white/30">{fmtDuration(result.duration)}</span>
                      )}
                    </div>
                    <button onClick={() => pickResult(result)}
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/25 transition-colors">
                      <Check className="w-3 h-3 text-white/80" />
                    </button>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-white/50 font-medium mb-1 truncate">
                      {result.artistName} — {result.trackName}
                    </p>
                    <pre className="text-[10px] text-white/40 leading-relaxed whitespace-pre-wrap font-mono line-clamp-6">{preview}</pre>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {lyrics.status === "synced" && (
          <div className="space-y-0.5 text-center pt-2">
            {lyrics.lines.map((line, i) => {
              const isActive = i === activeIdx;
              const isPast = i < activeIdx;
              return (
                <div key={i} ref={isActive ? activeLineRef : undefined}
                  onClick={() => seek(line.time)}
                  className={cn(
                    "px-2 py-1 rounded transition-all duration-300 leading-snug select-none cursor-pointer hover:bg-white/10",
                    isActive ? "text-white font-bold text-base scale-105" :
                    isPast ? "text-white/40 text-sm" : "text-white/55 text-sm"
                  )}>
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
