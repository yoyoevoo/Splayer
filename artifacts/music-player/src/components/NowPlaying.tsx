import { useRef, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, Heart, ImagePlus, Maximize2, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import { AlbumCover } from "./AlbumCover";
import { EditTrackDialog } from "./EditTrackDialog";
import { Visualizer } from "./Visualizer";
import { FullscreenVisualizer } from "./FullscreenVisualizer";
import { LyricsPanel } from "./LyricsPanel";
import { FloatingVideoPlayer } from "./FloatingVideoPlayer";
import { cn } from "@/lib/utils";
import { currentPlatform, convertFileUri } from "@/lib/platform-api";
import { useTheme } from "@/lib/theme-context";
import { extractAlbumColors } from "@/lib/album-colors";
import { buildUserThemeVars } from "@/lib/themes";

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
    clearCustomCover,
    toggleLike,
    lyricsOpen,
    setLyricsOpen,
    isPlaying,
    currentTime,
    fsVizOpen,
    setFsVizOpen,
    buttonVisibility: bv,
  } = usePlayer();

  const [likeAnimating, setLikeAnimating] = useState(false);

  const coverInputRef  = useRef<HTMLInputElement>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  // Kept in a ref so the canplay handler always sees the current value
  // without being listed as an effect dependency (which would re-trigger loads).
  const isPlayingRef   = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const [editOpen,       setEditOpen]       = useState(false);
  const [coverKey,       setCoverKey]       = useState(0);
  const [artActionsOpen, setArtActionsOpen] = useState(false);
  const [fetchArtMode,   setFetchArtMode]   = useState(false);
  const [fetchArtQuery,  setFetchArtQuery]  = useState("");
  const [fetchArtLoading,setFetchArtLoading]= useState(false);
  const [vizEnabled,     setVizEnabled]     = useState(readVizPref);
  // fsVizOpen / setFsVizOpen come from player context so Player.tsx can hide PlayerControls

  // ── Floating video panel ─────────────────────────────────────────────
  const [videoOpen,  setVideoOpen]  = useState(false);
  const [noVideoTip, setNoVideoTip] = useState(false);
  const noVideoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAndroid = currentPlatform === "android";
  const { songColorTheme, applySongTheme } = useTheme();

  // ── Inline A/V toggle ────────────────────────────────────────────────
  const [videoMode, setVideoMode] = useState(false);
  const [noAvTip,   setNoAvTip]   = useState(false);
  const noAvTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (currentTrack.hasVideo) {
      return currentTrack;
    }

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

  // Resolve the best video URL for the floating player. For merged self-videos,
  // prefer the persisted disk path (survives restarts) over the blob URL.
  const floatingVideoUrl = useMemo(() => {
    if (!matchingVideoTrack) return "";
    if (matchingVideoTrack === currentTrack && currentTrack!.videoPath) {
      return convertFileUri(currentTrack!.videoPath);
    }
    return matchingVideoTrack.url;
  }, [matchingVideoTrack, currentTrack]);

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

  // ── Load new video source cleanly when the track changes ─────────────
  // Keeps the same <video> DOM element across track changes (no key prop).
  // Steps: pause → clear src → load (unload) → set new src → load (buffer)
  //        → wait for canplay → play.  This prevents the stutter caused by
  //        calling play() on an element that hasn't buffered yet.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoMode) return;

    if (!matchingVideoTrack) {
      v.pause();
      v.src = '';
      v.load();
      return;
    }

    // 1. Pause and completely unload the previous source.
    v.pause();
    v.removeAttribute('src');
    v.load();

    // 2. Set new source and begin buffering.
    // For Android-downloaded merged videos the track URL is a zero-byte blob
    // placeholder; the real file is at videoPath. Use Capacitor.convertFileSrc
    // so Android WebView can access the native file path.
    v.src = (matchingVideoTrack as any).videoPath
        ? convertFileUri((matchingVideoTrack as any).videoPath)
        : matchingVideoTrack.url;
    v.load();

    // 3. Only play once the browser signals it has enough data.
    let active = true;
    const onCanPlay = () => {
      if (active && isPlayingRef.current) v.play().catch(() => {});
    };
    v.addEventListener('canplay', onCanPlay, { once: true });

    return () => {
      active = false;
      v.removeEventListener('canplay', onCanPlay);
    };
  }, [matchingVideoTrack, videoMode]);

  // ── Sync play/pause for mid-track state changes ───────────────────────
  // Only fires when isPlaying changes while the video is already loaded.
  // When matchingVideoTrack changes the above effect owns play(); we skip
  // here if the element hasn't buffered yet (readyState < 1 = HAVE_NOTHING).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoMode || !matchingVideoTrack) return;
    if (v.readyState < 1) return;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, videoMode, matchingVideoTrack]);

  // ── Sync seek position — only correct large drifts ────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoMode || !matchingVideoTrack) return;
    if (v.readyState >= 2 && Math.abs(v.currentTime - currentTime) > 0.75) {
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


  const onFetchArt = async (query?: string) => {
    if (!currentTrack) return;
    setFetchArtLoading(true);
    try {
      let searchQuery: string;
      if (query) {
        const cleaned = query.replace(/\(.*?(official|video|audio|lyric|hd|4k|mv).*?\)/gi, "").replace(/\[.*?\]/gi, "").trim();
        const parts = cleaned.split(" - ");
        const title = parts.length >= 2 ? parts.slice(1).join(" - ").trim() : cleaned;
        const artist = parts.length >= 2 ? parts[0].trim() : "";
        searchQuery = artist ? `${artist} ${title}` : title;
      } else {
        const cleanTitle = currentTrack.title.replace(/\(.*?(official|video|audio|lyric|hd|4k|mv).*?\)/gi, "").replace(/\[.*?\]/gi, "").trim();
        if (currentTrack.artist && currentTrack.artist !== "Unknown Artist") {
          searchQuery = `${currentTrack.artist} ${cleanTitle}`;
        } else if (cleanTitle.includes(" - ")) {
          const parts = cleanTitle.split(" - ");
          searchQuery = `${parts[0].trim()} ${parts.slice(1).join(" - ").trim()}`;
        } else {
          searchQuery = cleanTitle;
        }
      }
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&limit=1`);
      const data = await res.json();
      const art = data.results?.[0]?.artworkUrl100?.replace("100x100bb", "500x500bb") ?? null;
      if (art) {
        try { localStorage.removeItem(`art-blocked:${currentTrack.title.toLowerCase()}::${currentTrack.artist.toLowerCase()}`); } catch {}
        const k = `${currentTrack.title}::${currentTrack.artist}`.toLowerCase();
        (window as any).__albumArtCache?.set(k, art);
        // Persist to localStorage so it survives restart
        try { localStorage.setItem("fetched-art:" + k, art); } catch {}
        // Also save the image blob to IDB for persistence
        try {
          const imgRes = await fetch(art);
          const imgBlob = await imgRes.blob();
          const imgFile = new File([imgBlob], 'cover.jpg', { type: imgBlob.type });
          await setCustomCover(currentTrack.id, imgFile);
        } catch (imgErr) {
          console.warn('Failed to save fetched cover to IDB:', imgErr);
        }
        setCoverKey(p => p + 1);
        window.dispatchEvent(new CustomEvent("art-removed", { detail: { id: currentTrack.id } }));
      }
    } catch {}
    setFetchArtLoading(false);
    setFetchArtMode(false);
  };

  const cover = trackCoverUrl(currentTrack);

  useEffect(() => {
    if (!songColorTheme || !cover || videoMode) {
      applySongTheme(null);
      return;
    }
    let cancelled = false;
    extractAlbumColors(cover).then((palette) => {
      if (cancelled || !palette) return;
      applySongTheme(buildUserThemeVars(palette.bg, palette.panel, palette.text, palette.accent));
    });
    return () => { cancelled = true; };
  }, [songColorTheme, cover, videoMode]);

  const onPickCover   = () => coverInputRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setCustomCover(currentTrack.id, file);
    e.target.value = "";
  };

  return (
    <div className={cn(
      "flex-1 w-full relative overflow-hidden flex flex-col items-center justify-center py-4 md:py-12",
      isAndroid && videoMode ? "px-0" : isAndroid ? "px-4" : "px-8",
    )}>

      {/* Blurred album-art background — desktop: only rendered in video mode so the
           wallpaper shows through the player area when no video is playing */}
      {(isAndroid || videoMode) && <AnimatePresence mode="sync">
        <motion.div
          key={currentTrack.id + "-bg"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-0 -z-10"
        >
          {cover && songColorTheme ? (
            <>
              <img
                src={cover}
                alt=""
                className="w-full h-full object-cover scale-125 blur-3xl opacity-15"
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
      </AnimatePresence>}

      {/*
       * Outer layout — NOT inside AnimatePresence.
       * The video element lives here and is never unmounted on track change.
       * Only the album art and track info animate independently.
       */}
      <div className={cn("flex flex-col items-center gap-4 md:gap-8 w-full", !isAndroid && "max-w-md")}>

        {/*
         * Media square — persists across tracks so the <video> ref is stable.
         *
         * Stacking order (all share the stacking context of this relative div):
         *   z:1  album art / inline video
         *   z:2  visualizer canvas
         *   z:3  change-cover overlay
         *   z:4  corner buttons (visualizer, floating film, A/V toggle)
         *   z:5  lyrics overlay / fetch-art modal
         */}
        <div className="relative mx-auto group flex-shrink-0"
             style={isAndroid ? {
               width:        "100%",
               aspectRatio:  videoMode ? "16/11" : "1",
               overflow:     "hidden",
               borderRadius: videoMode ? "0" : "1rem",
               transform:    "translateZ(0)",
             } : videoMode ? {
               position:       "absolute",
               top:            0,
               right:          0,
               bottom:         0,
               left:           0,
               zIndex:         1,
               overflow:       "hidden",
               display:        "flex",
               alignItems:     "center",
               justifyContent: "center",
               background:     "transparent",
             } : {
               width:        "min(100%, 45vh)",
               height:       "min(100%, 45vh)",
               overflow:     "hidden",
               borderRadius: "1rem",
               transform:    "translateZ(0)",
             }}>

          {/* z:1 — inline video (persistent) OR album art (animated per track).
               Tapping the art on mobile opens the action overlay. */}
          <div
            style={!isAndroid && videoMode && !matchingVideoTrack
              ? { position: "absolute", inset: 0, zIndex: 1 }
              : { position: "relative", zIndex: 1 }}
            onClick={() => { if (!videoMode) setArtActionsOpen(v => !v); }}
            className={!videoMode ? "cursor-pointer" : ""}
          >
            {videoMode && matchingVideoTrack ? (
              <div
                className={cn(isAndroid ? "w-full bg-black overflow-hidden" : "max-w-full max-h-full")}
                style={isAndroid ? { aspectRatio: "16/11" } : undefined}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  preload="auto"
                  className={isAndroid ? "w-full h-full" : ""}
                  style={isAndroid
                    ? { display: "block", objectFit: "contain", objectPosition: "center center", backgroundColor: "black" }
                    : { display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }}
                />
              </div>
            ) : !isAndroid && videoMode ? (
              /* Desktop video mode, audio-only track — cover fills the full panel */
              cover
                ? <img
                    src={cover}
                    alt=""
                    className="w-full h-full"
                    style={{ objectFit: "cover", objectPosition: "center", display: "block" }}
                  />
                : <div
                    className="w-full h-full"
                    style={{ background: "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.4), transparent 70%)" }}
                  />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTrack.id + "-art"}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <AlbumCover
                    key={`${currentTrack.id}-${coverKey}`}
                    src={cover}
                    seed={currentTrack.title + currentTrack.artist}
                    title={currentTrack.title}
                    artist={currentTrack.artist}
                    size="xl"
                    className="rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
                  />
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* z:2 — visualizer canvas (hidden in video mode so it doesn't overlay) */}
          {!videoMode && <Visualizer visible={vizEnabled} />}

          {/* z:3 — art action overlay.
               • Desktop: appears on group-hover (pointer-events-auto via group-hover).
               • Mobile:  toggled by tapping the art (artActionsOpen state).
               • When hidden: pointer-events-none so invisible div never swallows taps. */}
          {!videoMode && (
            <div
              className={cn(
                "absolute inset-0 rounded-2xl bg-black/60 transition-opacity duration-200",
                "flex flex-col items-center justify-center gap-3 px-6",
                artActionsOpen
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
              )}
              style={{ zIndex: 3 }}
              onClick={(e) => { if (e.target === e.currentTarget) setArtActionsOpen(false); }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onPickCover(); setArtActionsOpen(false); }}
                data-testid="button-change-cover"
                className="w-full flex items-center justify-center gap-3 min-h-[52px] rounded-2xl bg-black/70 border border-white/30 shadow-lg text-white text-sm font-semibold active:bg-white/10 transition-colors"
              >
                <ImagePlus className="w-5 h-5 shrink-0" />
                Change cover
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setArtActionsOpen(false);
                  (window as any).__blockArt?.(currentTrack.title, currentTrack.artist);
                  await clearCustomCover(currentTrack.id);
                  setCoverKey(p => p + 1);
                  window.dispatchEvent(new CustomEvent("art-removed", { detail: { id: currentTrack.id } }));
                }}
                className="w-full flex items-center justify-center gap-3 min-h-[52px] rounded-2xl bg-black/70 border border-red-400/50 shadow-lg text-white text-sm font-semibold active:bg-red-700/50 transition-colors"
              >
                <Trash2 className="w-5 h-5 shrink-0 text-red-300" />
                Remove art
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const clean = currentTrack.title.replace(/\(.*?(official|video|audio|lyric|hd|4k|mv).*?\)/gi, "").replace(/\[.*?\]/gi, "").trim();
                  const pre = currentTrack.artist && currentTrack.artist !== "Unknown Artist"
                    ? `${currentTrack.artist} - ${clean}`
                    : clean;
                  setFetchArtQuery(pre);
                  setFetchArtMode(true);
                  setArtActionsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-3 min-h-[52px] rounded-2xl bg-black/70 border border-sky-400/50 shadow-lg text-white text-sm font-semibold active:bg-sky-700/50 transition-colors"
              >
                <Search className="w-5 h-5 shrink-0 text-sky-300" />
                Fetch art
              </button>
            </div>
          )}

          {/* z:5 — fetch art modal */}
          {fetchArtMode && (
            <div className="absolute inset-0 rounded-2xl bg-black/80 flex flex-col items-center justify-center gap-3 p-4" style={{ zIndex: 6 }}>
              <p className="text-white text-sm font-medium">Search for album art</p>
              <div className="flex gap-2 w-full">
                <input
                  autoFocus
                  type="text"
                  value={fetchArtQuery}
                  onChange={e => setFetchArtQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && onFetchArt(fetchArtQuery)}
                  placeholder="Artist - Song title"
                  className="flex-1 bg-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none placeholder:text-white/30 border border-white/20 focus:border-white/50"
                />
                <button onClick={() => onFetchArt(fetchArtQuery)} disabled={fetchArtLoading} className="px-3 py-2 rounded-lg bg-blue-500/40 hover:bg-blue-500/60 text-white text-xs disabled:opacity-40">
                  {fetchArtLoading ? "..." : "Search"}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onFetchArt()} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs">
                  Auto fetch
                </button>
                <button onClick={() => setFetchArtMode(false)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs">
                  Cancel
                </button>
              </div>
            </div>
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

          {/* z:4 — fullscreen visualizer button (top-right corner) */}
          {!videoMode && bv.fsVisualizer && (
            <button
              data-testid="button-fs-visualizer"
              onClick={() => setFsVizOpen(true)}
              title="Fullscreen visualizer"
              className={cn(
                "absolute top-2 right-2 flex items-center justify-center",
                "w-7 h-7 rounded-full backdrop-blur-sm border border-white/20 shadow",
                "bg-black/50 text-white/50 hover:text-white hover:bg-black/70 transition-all duration-200",
              )}
              style={{ zIndex: 4 }}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* z:5 — lyrics overlay (sits on top of album art + visualizer) */}
          <LyricsPanel open={lyricsOpen} onOpenChange={setLyricsOpen} />
        </div>

        {/* Track info — animated per track, independent of the media square */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTrack.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center gap-3 md:gap-8 w-full"
          >
            <div className="text-center space-y-2 w-full overflow-hidden">
              <h1 className="text-xl md:text-3xl font-serif tracking-tight text-foreground line-clamp-2">
                {currentTrack.title}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                {currentTrack.artist}
              </p>
              <p className="text-sm text-muted-foreground/70">
                {currentTrack.album}
                {currentTrack.year ? ` · ${currentTrack.year}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Like button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!currentTrack) return;
                  toggleLike(currentTrack.id);
                  setLikeAnimating(true);
                  setTimeout(() => setLikeAnimating(false), 300);
                }}
                className={cn(
                  "h-8 w-8 shrink-0 transition-colors duration-200",
                  currentTrack?.liked ? "text-red-500 hover:text-red-400" : "text-muted-foreground hover:text-red-400",
                )}
                aria-label={currentTrack?.liked ? "Unlike" : "Like"}
                title={currentTrack?.liked ? "Unlike" : "Like"}
              >
                <Heart
                  className={cn("w-5 h-5", likeAnimating && "heart-beat")}
                  fill={currentTrack?.liked ? "currentColor" : "none"}
                />
              </Button>

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
      </div>

      {/* Floating video player */}
      {videoOpen && matchingVideoTrack && floatingVideoUrl && (
        <FloatingVideoPlayer
          videoUrl={floatingVideoUrl}
          title={matchingVideoTrack.title || matchingVideoTrack.file.name}
          onClose={() => setVideoOpen(false)}
          muted={isSelfVideo}
          currentTime={currentTime}
          isPlaying={isPlaying}
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

      {/* Fullscreen visualizer overlay — portalled to document.body to escape z-[1] stacking context */}
      {fsVizOpen && createPortal(
        <FullscreenVisualizer onClose={() => setFsVizOpen(false)} />,
        document.body,
      )}
    </div>
  );
}
