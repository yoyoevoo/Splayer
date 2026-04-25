import { useEffect, useRef, useState } from "react";
import { Loader2, Mic2, MicOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface LyricsPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function LyricsPanel({ open, onOpenChange }: LyricsPanelProps) {
  const { currentTrack, currentTime } = usePlayer();
  const [lyrics, setLyrics] = useState<LyricsState>({ status: "idle" });
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Fetch lyrics whenever track or panel changes
  useEffect(() => {
    if (!open || !currentTrack) {
      if (!currentTrack) setLyrics({ status: "idle" });
      return;
    }
    if (fetchedFor === currentTrack.id) return;

    setFetchedFor(currentTrack.id);
    setLyrics({ status: "loading" });

    const params = new URLSearchParams({
      track_name: currentTrack.title,
      artist_name: currentTrack.artist,
      album_name: currentTrack.album,
      duration: Math.round(currentTrack.duration).toString(),
    });

    fetch(`https://lrclib.net/api/get?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          setLyrics({ status: "none" });
          return;
        }
        if (data.syncedLyrics) {
          const lines = parseLrc(data.syncedLyrics);
          if (lines.length > 0) {
            setLyrics({ status: "synced", lines });
            return;
          }
        }
        if (data.plainLyrics) {
          setLyrics({ status: "plain", text: data.plainLyrics });
        } else {
          setLyrics({ status: "none" });
        }
      })
      .catch(() => setLyrics({ status: "none" }));
  }, [open, currentTrack, fetchedFor]);

  // Reset when track changes
  useEffect(() => {
    if (currentTrack?.id !== fetchedFor) {
      setFetchedFor(null);
    }
  }, [currentTrack?.id, fetchedFor]);

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
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIdx]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[520px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-card-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Mic2 className="w-4 h-4 text-primary" />
            Lyrics
            {currentTrack && (
              <span className="text-muted-foreground font-normal ml-1 truncate max-w-xs">
                — {currentTrack.title}
              </span>
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
