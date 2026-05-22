import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bookmark, CheckCircle2, Circle,
  Loader2, Pause, Play, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import { useBooks } from "@/lib/use-books";
import { platformAPI } from "@/lib/platform-api";
import type { Book, BookChapter, Track } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Per-book speed memory + bookmarks (localStorage) ─────────────────────────
type BookBm = { id: string; time: number };

function readBookSpeed(bookId: string): number {
  try { return Number(localStorage.getItem(`spd-book:${bookId}`)) || 1; } catch { return 1; }
}
function readBookBms(bookId: string): BookBm[] {
  try { return JSON.parse(localStorage.getItem(`bm-book:${bookId}`) ?? "[]"); } catch { return []; }
}
function saveBookBms(bookId: string, bms: BookBm[]) {
  try { localStorage.setItem(`bm-book:${bookId}`, JSON.stringify(bms)); } catch {}
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractYtId(url: string): string | null {
  const m = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?]+)/);
  return m?.[1] ?? null;
}

function formatBookTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const t = Math.floor(seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

// ── chapter → Track for YouTube chapters ─────────────────────────────────────

async function chapterToTrack(
  ch: BookChapter,
  book: Book,
): Promise<{ track: Track; startSecs: number }> {
  const makeTrack = (url: string): Track => ({
    id:               ch.id,
    file:             new File([], ch.title),
    url,
    title:            ch.title,
    artist:           book.author,
    album:            book.title,
    duration:         0,
    addedAt:          Date.now(),
    playCount:        0,
    embeddedCoverUrl: book.coverUrl,
  });

  const ytId       = extractYtId(ch.audioUrl ?? "");
  const savedStart = ch.progress > 10 ? ch.progress : 0;

  if (ytId && platformAPI?.getEmbedPort) {
    const port = await platformAPI.getEmbedPort();
    if (port) {
      return { track: makeTrack(`http://127.0.0.1:${port}/stream?v=${ytId}`), startSecs: savedStart };
    }
  }

  return { track: makeTrack(ch.audioUrl ?? ""), startSecs: savedStart };
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  book:   Book;
  onBack: () => void;
}

export function BookDetailView({ book, onBack }: Props) {
  const { playEphemeral, currentTrack, isPlaying, togglePlay, currentTime, seek, speed, setSpeed } = usePlayer();
  const { getChapters, getAudioBlobUrl, saveProgress, saveChapterProgress,
          markChapterPlayed } = useBooks();

  const [chapters,    setChapters]    = useState<BookChapter[]>([]);
  const [bms,         setBms]         = useState<BookBm[]>(() => readBookBms(book.id));
  const [loadingChId, setLoadingChId] = useState<string | null>(null);
  const prevIsBookPlayingRef = useRef(false);

  const audioBlobUrlRef = useRef<string | null>(null);
  const lastSavedRef    = useRef(0);

  // Load chapters; bookmarks come from localStorage (initialised in useState)
  useEffect(() => {
    getChapters(book.id).then(setChapters);
    setBms(readBookBms(book.id));
  }, [book.id, getChapters]);

  // Pre-load local audio blob URL so first play is instant
  useEffect(() => {
    if (book.source !== "local") return;
    getAudioBlobUrl(book.id).then((url) => { audioBlobUrlRef.current = url; });
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    };
  }, [book.id, book.source, getAudioBlobUrl]);

  // ── Active chapter detection ─────────────────────────────────────────────
  // For local: find chapter whose startTime ≤ currentTime
  // For youtube: match by currentTrack.id
  const isBookPlaying = book.source === "local"
    ? currentTrack?.id === book.id
    : chapters.some((ch) => ch.id === currentTrack?.id);

  const activeChapterId: string | null = (() => {
    if (!isBookPlaying) return null;
    if (book.source === "local") {
      let active: BookChapter | null = null;
      for (const ch of chapters) {
        if ((ch.startTime ?? 0) <= currentTime) active = ch;
        else break;
      }
      return active?.id ?? null;
    }
    return currentTrack?.id ?? null;
  })();

  // ── Progress persistence ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isBookPlaying || currentTime < 1) return;
    if (currentTime - lastSavedRef.current < 5) return;
    lastSavedRef.current = currentTime;

    if (book.source === "local") {
      saveProgress(book.id, currentTime);
      // Mark chapter played at 90%+
      if (activeChapterId) {
        const ch = chapters.find((c) => c.id === activeChapterId);
        if (ch && !ch.played) {
          const end = ch.endTime ?? book.duration ?? 0;
          const start = ch.startTime ?? 0;
          const dur = end - start;
          if (dur > 0 && currentTime - start >= dur * 0.9) {
            markChapterPlayed(ch.id, true);
            setChapters((prev) => prev.map((c) => c.id === ch.id ? { ...c, played: true } : c));
          }
        }
      }
    } else {
      const ch = chapters.find((c) => c.id === activeChapterId);
      if (ch) {
        saveChapterProgress(ch.id, currentTime);
        setChapters((prev) => prev.map((c) => c.id === ch.id ? { ...c, progress: currentTime } : c));
      }
    }
  }, [currentTime, isBookPlaying, book, activeChapterId, chapters,
      saveProgress, saveChapterProgress, markChapterPlayed]);

  // Speed memory: restore per-book speed when book becomes active; save on change
  useEffect(() => {
    const prev = prevIsBookPlayingRef.current;
    prevIsBookPlayingRef.current = isBookPlaying;
    if (isBookPlaying && !prev) {
      const saved = readBookSpeed(book.id);
      if (speed !== saved) setSpeed(saved);
    } else if (!isBookPlaying && prev && currentTrack !== null) {
      // Switched from this book to another track — restore normal 1×
      setSpeed(1);
    }
  }, [isBookPlaying, currentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist speed whenever it changes while this book is the active track
  useEffect(() => {
    if (!isBookPlaying) return;
    try { localStorage.setItem(`spd-book:${book.id}`, String(speed)); } catch {}
  }, [speed, isBookPlaying, book.id]);

  // ── Playback helpers ─────────────────────────────────────────────────────

  const playLocalBook = useCallback(async (startSecs?: number) => {
    let url = audioBlobUrlRef.current;
    if (!url) {
      url = await getAudioBlobUrl(book.id);
      audioBlobUrlRef.current = url;
    }
    if (!url) return;

    const track: Track = {
      id:               book.id,
      file:             new File([], book.title),
      url,
      title:            book.title,
      artist:           book.author,
      album:            book.title,
      duration:         book.duration ?? 0,
      addedAt:          book.addedAt,
      playCount:        0,
      embeddedCoverUrl: book.coverUrl,
    };
    const at = startSecs ?? (book.progress ?? 0);
    lastSavedRef.current = at;
    playEphemeral(track, at);
  }, [book, getAudioBlobUrl, playEphemeral]);

  const playYtChapter = useCallback(async (ch: BookChapter) => {
    setLoadingChId(ch.id);
    try {
      const { track, startSecs } = await chapterToTrack(ch, book);
      lastSavedRef.current = startSecs;
      playEphemeral(track, startSecs);
    } finally {
      setLoadingChId(null);
    }
  }, [book, playEphemeral]);

  const handleChapterClick = useCallback((ch: BookChapter) => {
    if (book.source === "local") {
      const start = ch.startTime ?? 0;
      if (isBookPlaying) {
        seek(start);
        lastSavedRef.current = start;
      } else {
        playLocalBook(start);
      }
    } else {
      playYtChapter(ch);
    }
  }, [book.source, isBookPlaying, seek, playLocalBook, playYtChapter]);

  const handleMainPlayPause = useCallback(() => {
    if (book.source === "local") {
      if (isBookPlaying) togglePlay();
      else playLocalBook();
    }
  }, [book.source, isBookPlaying, togglePlay, playLocalBook]);

  // ── Bookmarks (localStorage, auto time-label) ────────────────────────────

  const handleAddBookmark = useCallback(() => {
    if (!isBookPlaying && currentTime === 0) return;
    const bm: BookBm = { id: String(Date.now()), time: currentTime };
    setBms((prev) => {
      const next = [...prev, bm].sort((a, b) => a.time - b.time);
      saveBookBms(book.id, next);
      return next;
    });
  }, [isBookPlaying, currentTime, book.id]);

  const handleRemoveBookmark = useCallback((id: string) => {
    setBms((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveBookBms(book.id, next);
      return next;
    });
  }, [book.id]);

  // ── Render ───────────────────────────────────────────────────────────────

  const totalDur = book.duration ?? 0;
  const progressPct = totalDur > 0
    ? Math.min(((isBookPlaying && book.source === "local" ? currentTime : (book.progress ?? 0)) / totalDur) * 100, 100)
    : 0;

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" className="w-10 h-10 rounded shrink-0 object-cover" />
        ) : (
          <div className="w-10 h-10 rounded bg-primary/15 flex items-center justify-center shrink-0 text-primary text-lg">
            📖
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{book.title}</p>
          <p className="text-xs text-muted-foreground truncate">{book.author}{book.narrator ? ` · ${book.narrator}` : ""}</p>
        </div>
      </div>

      {/* ── Speed row ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-card-border shrink-0">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Speed</span>
        <div className="flex gap-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded transition-colors",
                speed === s
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Local progress bar + play/pause ── */}
      {book.source === "local" && (
        <div className="px-3 py-2 border-b border-card-border shrink-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant={isBookPlaying ? "default" : "ghost"}
              className="h-7 w-7 shrink-0"
              onClick={handleMainPlayPause}
            >
              {isBookPlaying && isPlaying
                ? <Pause  className="w-3.5 h-3.5" />
                : <Play   className="w-3.5 h-3.5 translate-x-[1px]" />}
            </Button>
            <div className="flex-1 min-w-0">
              <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {formatBookTime(isBookPlaying ? currentTime : (book.progress ?? 0))}
              {totalDur > 0 && ` / ${formatBookTime(totalDur)}`}
            </span>
          </div>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Chapter list */}
        {chapters.length > 0 && (
          <div className="divide-y divide-card-border/40">
            {chapters.map((ch, idx) => {
              const isActive = ch.id === activeChapterId;
              const dur = ch.endTime != null && ch.startTime != null
                ? ch.endTime - ch.startTime : undefined;
              const chProgressPct = book.source === "local" && isActive && totalDur > 0
                ? progressPct : (book.source === "youtube" && ch.duration && ch.duration > 0
                    ? Math.min((ch.progress / ch.duration) * 100, 100) : 0);

              return (
                <div
                  key={ch.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 transition-colors",
                    ch.played && "opacity-50",
                  )}
                >
                  <span className={cn(
                    "text-[10px] w-5 text-center shrink-0 tabular-nums",
                    isActive ? "text-primary font-bold" : "text-muted-foreground",
                  )}>
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm truncate",
                      isActive ? "text-primary font-medium" : "text-foreground",
                    )}>
                      {ch.title}
                    </p>
                    {dur != null && (
                      <p className="text-[10px] text-muted-foreground">{formatBookTime(dur)}</p>
                    )}
                    {chProgressPct > 0 && !ch.played && (
                      <div className="mt-1 h-0.5 bg-muted/40 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${chProgressPct}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Played toggle (YouTube only) */}
                  {book.source === "youtube" && (
                    <Button
                      size="icon" variant="ghost"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        markChapterPlayed(ch.id, !ch.played);
                        setChapters((prev) => prev.map((c) => c.id === ch.id ? { ...c, played: !c.played } : c));
                      }}
                      title={ch.played ? "Mark unplayed" : "Mark played"}
                    >
                      {ch.played
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        : <Circle       className="w-3.5 h-3.5" />}
                    </Button>
                  )}

                  {/* Play button */}
                  <Button
                    size="icon"
                    variant={isActive ? "default" : "ghost"}
                    className="h-7 w-7 shrink-0"
                    disabled={loadingChId === ch.id}
                    onClick={() => {
                      if (book.source === "local") {
                        handleChapterClick(ch);
                      } else {
                        isActive && isPlaying ? togglePlay() : playYtChapter(ch);
                      }
                    }}
                  >
                    {loadingChId === ch.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : isActive && isPlaying
                        ? <Pause className="w-3.5 h-3.5" />
                        : <Play  className="w-3.5 h-3.5 translate-x-[1px]" />}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* No-chapters hint for local books with one file */}
        {book.source === "local" && chapters.length === 0 && (
          <div className="px-3 py-3">
            <p className="text-xs text-muted-foreground">No chapter markers found — playing as a single track.</p>
          </div>
        )}

        {/* Bookmark section */}
        <div className="px-3 py-3 border-t border-card-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bookmarks</span>
            <button
              type="button"
              onClick={handleAddBookmark}
              title="Bookmark current position"
              className="h-6 px-2 flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Bookmark className="w-3 h-3" />
              {formatBookTime(currentTime)}
            </button>
          </div>

          {bms.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No bookmarks yet</p>
          ) : (
            <div className="space-y-1">
              {bms.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center gap-2 group hover:bg-muted/30 rounded px-1 py-0.5 cursor-pointer"
                  onClick={() => {
                    if (book.source === "local") {
                      if (isBookPlaying) seek(bm.time);
                      else playLocalBook(bm.time);
                    }
                  }}
                >
                  <span className="text-[10px] text-primary tabular-nums shrink-0">
                    {formatBookTime(bm.time)}
                  </span>
                  <Button
                    size="icon" variant="ghost"
                    className="h-5 w-5 shrink-0 ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleRemoveBookmark(bm.id); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
