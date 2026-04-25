import { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, Film, ImagePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import { AlbumCover } from "./AlbumCover";
import { EditTrackDialog } from "./EditTrackDialog";
import { Visualizer } from "./Visualizer";
import { LyricsPanel } from "./LyricsPanel";
import { FloatingVideoPlayer } from "./FloatingVideoPlayer";
import { cn } from "@/lib/utils";

function readVizPref(): boolean {
  try { return localStorage.getItem("viz-enabled") !== "false"; }
  catch { return true; }
}
function writeVizPref(v: boolean) {
  try { localStorage.setItem("viz-enabled", String(v)); } catch {}
}

export function NowPlaying() {
  const {
    currentTrack,
    tracks,
    setCustomCover,
    lyricsOpen,
    setLyricsOpen,
    isPlaying,
    currentTime,
  } = usePlayer();

  const coverInputRef  = useRef<HTMLInputElement>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);

  const [editOpen,   setEditOpen]   = useState(false);
  const [vizEnabled, setVizEnabled] = useState(readVizPref);

  // ── Floating video panel (pre-existing) ──────────────────────────────
  const [videoOpen,  setVideoOpen]  = useState(false);
  const [noVideoTip, setNoVideoTip] = useState(false);
  const noVideoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Inline A/V toggle (new) ───────────────────────────────────────────
  const [videoMode,  setVideoMode]  = useState(false);
  const [noAvTip,    setNoAvTip]    = useState(false);
  const noAvTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleViz = () => {
    const next = !vizEnabled;
    setVizEnabled(next);
    writeVizPref(next);
  };

  // Find the video source for the current track (memoised so effects don't
  // re-run every render).
  //
  // Priority order:
  //  1. The track itself is a merged MP4 (localStorage marker set at download
  //     time) → use currentTrack directly as the video source.
  //  2. A separate companion track whose filename is stem + ".mp4".
  const matchingVideoTrack = useMemo(() => {
    if (!currentTrack) return null;

    // 1 — merged self-video check
    try {
      if (localStorage.getItem(`merged-video-trackid:${currentTrack.id}`) === "1") {
        return currentTrack;
      }
    } catch {}

    // 2 — companion filename match (existing fallback)
    const base = currentTrack.file.name.replace(/\.[^.]+$/, "").toLowerCase();
    return (
      tracks.find(
        (t) =>
          t.id !== currentTrack.id &&
          t.file.name.toLowerCase() === base + ".mp4",
      ) ?? null
    );
  }, [currentTrack, tracks]);

  const hasVideo    = matchingVideoTrack !== null;
  // True when the current track IS the video (merged MP4) — we mute the
  // floating panel to avoid double audio with the main player.
  const isSelfVideo = matchingVideoTrack !== null && matchingVideoTrack === currentTrack;

  // ── Auto-off: floating panel ─────────────────────────────────────────
  useEffect(() => {
    if (!hasVideo) setVideoOpen(false);
  }, [hasVideo]);

  // ── Auto-off: inline video mode ───────────────────────────────────────
  useEffect(() => {
    if (!hasVideo) setVideoMode(false);
  }, [hasVideo]);

  // ── Sync inline video play / pause ────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoMode || !matchingVideoTrack) return;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, videoMode, matchingVideoTrack]);

  // ── Sync inline video seek position (only correct large drifts) ───────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoMode || !matchingVideoTrack) return;
    if (Math.abs(v.currentTime - currentTime) > 0.75) {
      v.currentTime = currentTime;
    }
  }, [currentTime, videoMode, matchingVideoTrack]);

  // ── Floating video button click ───────────────────────────────────────
  const onVideoButtonClick = () => {
    if (hasVideo) {
      setVideoOpen((o) => !o);
    } else {
      if (noVideoTimer.current) clearTimeout(noVideoTimer.current);
      setNoVideoTip(true);
      noVideoTimer.current = setTimeout(() => setNoVideoTip(false), 2000);
    }
  };

  // ── A/V toggle button click ───────────────────────────────────────────
  const onAvToggle = () => {
    if (hasVideo) {
      setVideoMode((m) => !m);
    } else {
      if (noAvTimer.current) clearTimeout(noAvTimer.current);
      setNoAvTip(true);
      noAvTimer.current = setTimeout(() => setNoAvTip(false), 2000);
    }
  };

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (noVideoTimer.current) clearTimeout(noVideoTimer.current);
    if (noAvTimer.current)    clearTimeout(noAvTimer.current);
  }, []);

  if (!currentTrack) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-12">
        <div className="space-y-3 max-w-md">
          <h2 className="text-2xl font-serif text-foreground/80">
            Pick a track to begin
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose something from the playlist on the right, or press play to
            start with the first song.
          </p>
        </div>
      </div>
    );
  }

  const cover = trackCoverUrl(currentTrack);
  const onPickCover   = () => coverInputRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setCustomCover(currentTrack.id, file);
    e.target.value = "";
  };

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center px-8 py-12">

      {/* Blurred album-art background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentTrack.id + "-bg"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0 -z-10"
        >
          {cover ? (
            <>
              <img
                src={cover}
                alt=""
                className="w-full h-full object-cover scale-125 blur-3xl opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
            </>
          ) : (
            <div
              className="w-full h-full"
              style={{
                background:
                  "radial-gradient(circle at 50% 30%, hsl(var(--primary) / 0.15), transparent 60%)",
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentTrack.id}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-8 max-w-md w-full"
        >
          {/*
           * Stacking order inside this container (all use the same parent
           * stacking context established by position:relative):
           *   z:1  album art / inline video
           *   z:2  visualizer canvas  ← on TOP, bars visible over the art
           *   z:3  change-cover overlay
           *   z:4  corner buttons (visualizer, floating film, A/V toggle)
           */}
          <div className="relative w-full max-w-sm group">

            {/* z:1 — album art OR inline video */}
            <div style={{ position: "relative", zIndex: 1 }}>
              {videoMode && matchingVideoTrack ? (
                /* Inline video — same square footprint as the album art */
                <div className="w-full aspect-square rounded-2xl overflow-hidden bg-black shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]">
                  <video
                    ref={videoRef}
                    key={matchingVideoTrack.id}
                    src={matchingVideoTrack.url}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ display: "block" }}
                  />
                </div>
              ) : (
                <AlbumCover
                  src={cover}
                  seed={currentTrack.title + currentTrack.artist}
                  size="xl"
                  className="rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
                />
              )}
            </div>

            {/* z:2 — visualizer canvas (hidden in video mode so it doesn't overlay) */}
            {!videoMode && <Visualizer visible={vizEnabled} />}

            {/* z:3 — change-cover hover overlay (hidden in video mode) */}
            {!videoMode && (
              <button
                onClick={onPickCover}
                className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ zIndex: 3 }}
                data-testid="button-change-cover"
              >
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur text-white text-sm">
                  <ImagePlus className="w-4 h-4" />
                  Change cover
                </div>
              </button>
            )}

            {/* z:4 — visualizer toggle (top-left, slot 1) */}
            <button
              onClick={toggleViz}
              title={vizEnabled ? "Hide visualizer" : "Show visualizer"}
              className={cn(
                "absolute top-2 left-2 flex items-center justify-center",
                "w-7 h-7 rounded-full backdrop-blur-sm border border-white/20 shadow",
                "transition-all duration-200",
                vizEnabled
                  ? "bg-orange-500/80 text-white"
                  : "bg-black/50 text-white/50 hover:text-white/80",
              )}
              style={{ zIndex: 4 }}
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>

            {/* z:4 — floating video panel button (top-left, slot 2) */}
            <div className="absolute top-2" style={{ left: 40, zIndex: 4 }}>
              <button
                onClick={onVideoButtonClick}
                title={hasVideo ? (videoOpen ? "Close video panel" : "Open video panel") : "No video file found"}
                className={cn(
                  "flex items-center justify-center",
                  "w-7 h-7 rounded-full backdrop-blur-sm border border-white/20 shadow",
                  "transition-all duration-200",
                  hasVideo && videoOpen
                    ? "bg-primary/90 text-white"
                    : hasVideo
                      ? "bg-black/50 text-white hover:text-white hover:bg-primary/60"
                      : "bg-black/30 text-white/25 cursor-default",
                )}
              >
                <Film className="w-3.5 h-3.5" />
              </button>

              {/* "No video file found" tooltip */}
              {noVideoTip && (
                <div
                  className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium shadow-lg"
                  style={{ background: "rgba(0,0,0,0.85)", color: "#fff", zIndex: 10 }}
                >
                  No video file found
                </div>
              )}
            </div>

            {/* z:4 — Audio/Video inline toggle button (top-left, slot 3) */}
            <div className="absolute top-2" style={{ left: 72, zIndex: 4 }}>
              <button
                onClick={onAvToggle}
                title={
                  videoMode
                    ? "Switch to Audio mode"
                    : hasVideo
                      ? "Switch to Video mode"
                      : "No video available for this song"
                }
                className={cn(
                  "flex items-center justify-center",
                  "w-7 h-7 rounded-full backdrop-blur-sm border border-white/20 shadow",
                  "text-[13px] leading-none transition-all duration-200",
                  videoMode
                    ? "bg-blue-500/80 text-white"
                    : hasVideo
                      ? "bg-black/50 text-white/80 hover:bg-black/70 hover:text-white"
                      : "bg-black/30 text-white/25 cursor-default",
                )}
              >
                {videoMode ? "🎬" : "🎵"}
              </button>

              {/* "No video available" tooltip */}
              {noAvTip && (
                <div
                  className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium shadow-lg"
                  style={{ background: "rgba(0,0,0,0.85)", color: "#fff", zIndex: 10 }}
                >
                  No video available for this song
                </div>
              )}
            </div>

            {/* z:5 — lyrics overlay (sits on top of album art + visualizer) */}
            <LyricsPanel open={lyricsOpen} onOpenChange={setLyricsOpen} />
          </div>

          {/* Track info */}
          <div className="text-center space-y-2 w-full">
            <h1 className="text-3xl font-serif tracking-tight text-foreground line-clamp-2">
              {currentTrack.title}
            </h1>
            <p className="text-base text-muted-foreground">
              {currentTrack.artist}
            </p>
            <p className="text-sm text-muted-foreground/70">
              {currentTrack.album}
              {currentTrack.year ? ` · ${currentTrack.year}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-edit-track"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit details
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Floating video player (pre-existing) */}
      {videoOpen && matchingVideoTrack && (
        <FloatingVideoPlayer
          videoUrl={matchingVideoTrack.url}
          title={matchingVideoTrack.title || matchingVideoTrack.file.name}
          onClose={() => setVideoOpen(false)}
          muted={isSelfVideo}
        />
      )}

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onCoverChange}
      />
      <EditTrackDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        track={currentTrack}
      />
    </div>
  );
}
