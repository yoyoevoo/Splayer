import { useEffect, useRef, useState } from "react";
import { Film, X } from "lucide-react";

interface Props {
  videoUrl: string;
  title: string;
  onClose: () => void;
  /** Mute the video element — used when the merged MP4 already plays audio
   *  through the main player so we don't get double audio. */
  muted?: boolean;
  /** Sync the floating video to the main player's current playback position. */
  currentTime?: number;
  /** Sync play/pause state with the main player. */
  isPlaying?: boolean;
}

const DEFAULT_W = 480;
const DEFAULT_H = 300;

export function FloatingVideoPlayer({
  videoUrl,
  title,
  onClose,
  muted = false,
  currentTime,
  isPlaying,
}: Props) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, window.innerWidth  / 2 - DEFAULT_W / 2),
    y: Math.max(0, window.innerHeight / 2 - DEFAULT_H / 2 - 60),
  }));

  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const videoRef  = useRef<HTMLVideoElement>(null);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, dragStart.current.px + (e.clientX - dragStart.current.mx)),
        y: Math.max(0, dragStart.current.py + (e.clientY - dragStart.current.my)),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  // Sync play / pause with main player
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isPlaying === undefined) return;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying]);

  // Sync seek position — only correct large drifts to avoid jitter
  useEffect(() => {
    const v = videoRef.current;
    if (!v || currentTime === undefined) return;
    // Guard: don't seek while the video is still buffering — random-access reads
    // into an unbuffered blob cause stutter on every timeupdate tick.
    if (v.readyState >= 2 && Math.abs(v.currentTime - currentTime) > 0.75) {
      v.currentTime = currentTime;
    }
  }, [currentTime]);

  return (
    <div
      className="fixed z-[100] flex flex-col rounded-xl border border-card-border shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)] bg-black"
      style={{
        left:      pos.x,
        top:       pos.y,
        width:     DEFAULT_W,
        height:    DEFAULT_H,
        minWidth:  260,
        minHeight: 180,
        resize:    "both",
        overflow:  "hidden",
      }}
    >
      {/* Drag handle / title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-card border-b border-card-border cursor-grab active:cursor-grabbing select-none shrink-0"
        style={{ height: 36 }}
        onMouseDown={onHeaderMouseDown}
      >
        <Film className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground truncate flex-1">{title}</span>
        <button
          onClick={onClose}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        key={videoUrl}
        src={videoUrl}
        muted={muted}
        preload="auto"
        className="bg-black"
        style={{ display: "block", width: "100%", height: "calc(100% - 36px)" }}
      />
    </div>
  );
}
