/**
 * MiniPlayer — compact floating overlay.
 *
 * Layout (320 × 80px):
 *   [album art 50px] [title / artist flex-1] [prev | play | next | expand]
 *   ─────────────────── slim progress bar (3px) ──────────────────────────
 *
 * Extras:
 *   • Draggable anywhere inside the viewport (position saved to localStorage)
 *   • Smooth spring-driven enter/exit via Framer Motion
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import { AlbumCover } from "./AlbumCover";
import { cn } from "@/lib/utils";

const MINI_W = 320;
const MINI_H = 80;
const POS_KEY = "mini-player-pos";

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    x: 24,
    y: typeof window !== "undefined" ? window.innerHeight - MINI_H - 24 : 100,
  };
}

function savePos(p: { x: number; y: number }) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
}

export interface MiniPlayerProps {
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    prev,
    seek,
  } = usePlayer();

  const [pos,      setPos]      = useState<{ x: number; y: number }>(loadPos);
  const [dragging, setDragging] = useState(false);

  const posRef      = useRef(pos);
  posRef.current    = pos;

  const dragOrigin  = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const total    = duration || currentTrack?.duration || 0;
  const progress = total > 0 ? Math.min(currentTime / total, 1) : 0;
  const cover    = currentTrack ? trackCoverUrl(currentTrack) : undefined;

  // ── drag ──────────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,input,[role=slider]")) return;
    e.preventDefault();
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      const dx = e.clientX - dragOrigin.current.mx;
      const dy = e.clientY - dragOrigin.current.my;
      const x = Math.max(0, Math.min(window.innerWidth  - MINI_W, dragOrigin.current.px + dx));
      const y = Math.max(0, Math.min(window.innerHeight - MINI_H, dragOrigin.current.py + dy));
      setPos({ x, y });
    };
    const onUp = () => {
      setDragging(false);
      savePos(posRef.current);
      dragOrigin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [dragging]);

  // ── progress bar click ────────────────────────────────────────────────────
  const onProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!total) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(1, ratio)) * total);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 12 }}
      animate={{ opacity: 1, scale: 1,    y: 0  }}
      exit={{    opacity: 0, scale: 0.88, y: 12 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      style={{
        position : "fixed",
        left     : pos.x,
        top      : pos.y,
        width    : MINI_W,
        zIndex   : 100,
        cursor   : dragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onMouseDown={onMouseDown}
    >
      {/* ── Main card ─────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-card-border/60 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden">

        {/* Content row */}
        <div className="flex items-center gap-3 px-3 h-[77px]">

          {/* Album art — click opens full player */}
          <button
            onClick={onExpand}
            onMouseDown={(e) => e.stopPropagation()}
            className="shrink-0 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary/60 transition-all"
            title="Return to full player"
          >
            <AlbumCover
              src={cover}
              seed={currentTrack ? currentTrack.title + currentTrack.artist : "mini"}
              size="sm"
            />
          </button>

          {/* Track info */}
          <div className="min-w-0 flex-1">
            <p className={cn(
              "text-sm font-medium truncate leading-tight",
              currentTrack ? "text-foreground" : "text-muted-foreground",
            )}>
              {currentTrack?.title ?? "Nothing playing"}
            </p>
            {currentTrack?.artist && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {currentTrack.artist}
              </p>
            )}
          </div>

          {/* Playback controls */}
          <div
            className="flex items-center gap-0.5 shrink-0"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={prev}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Previous"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={togglePlay}
              className="w-8 h-8 mx-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/85 transition-colors shadow-md"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying
                ? <Pause className="w-3.5 h-3.5" />
                : <Play  className="w-3.5 h-3.5 translate-x-[1px]" />}
            </button>

            <button
              onClick={next}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Next"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Expand */}
            <button
              onClick={onExpand}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-7 h-7 ml-0.5 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Return to full player"
              title="Return to full player"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Progress bar (bottom edge, clickable) ──────────────────── */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 cursor-pointer group/prog"
          onClick={onProgressClick}
          onMouseDown={(e) => e.stopPropagation()}
          title="Seek"
        >
          <div
            className="h-full bg-primary transition-all duration-150 group-hover/prog:bg-primary/80"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}
