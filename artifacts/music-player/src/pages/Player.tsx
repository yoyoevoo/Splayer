import { useCallback, useEffect, useRef, useState } from "react";
import { platformAPI, currentPlatform } from "@/lib/platform-api";
import { ChevronDown, ChevronLeft, ChevronRight, Music, Youtube, Palette, Settings, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/lib/player-context";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { NowPlaying } from "@/components/NowPlaying";
import { Playlist } from "@/components/Playlist";
import { PlayerControls } from "@/components/PlayerControls";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { AppearanceDialog } from "@/components/AppearanceDialog";
import { HomeDashboard } from "@/components/HomeDashboard";
import { YoutubeDownloadDialog } from "@/components/YoutubeDownloadDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/theme-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DownloadQueueButton } from "@/components/DownloadQueuePanel";
import { EditorPage } from "@/components/EditorPage";
import { MiniPlayer } from "@/components/MiniPlayer";
import type { Track } from "@/lib/types";


function useWindowHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const update = () => {
      const h = window.innerHeight;
      setHeight(h);
    };
    window.addEventListener("resize", update);
    const t1 = setTimeout(update, 300);
    const t2 = setTimeout(update, 800);
    return () => { window.removeEventListener("resize", update); clearTimeout(t1); clearTimeout(t2); };
  }, []);
  // The -18 corrects KDE Linux frameless-window sizing only — not needed on Windows/macOS/Android.
  const isLinux = currentPlatform === "electron" && platformAPI?.platform === "linux";
  return (currentPlatform === "android" || !isLinux) ? height : height - 18;
}

export default function Player() {
  const winHeight = useWindowHeight();
  // Tell the browser the real usable height so Radix UI menus position correctly
  useEffect(() => {
    document.documentElement.style.setProperty("--app-height", winHeight + "px");
    document.documentElement.style.height = winHeight + "px";
    document.body.style.height = winHeight + "px";
    document.body.style.overflow = "hidden";
  }, [winHeight]);
  useEffect(() => {
    // Force layout recalculation on mount (fixes KDE sizing on first open)
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 300);
    return () => clearTimeout(t);
  }, []);


  const {
    tracks,
    addFiles,
    togglePlay,
    next,
    prev,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    miniMode,
    setMiniMode,
    fsVizOpen,
  } = usePlayer();

  const [editorTrack,    setEditorTrack]    = useState<Track | null>(null);
  const [shortcutsOpen,   setShortcutsOpen]   = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [ytOpen,        setYtOpen]        = useState(false);
  const [dragOver,      setDragOver]      = useState(false);

  // Sidebar show/hide — persisted across sessions
  const [sidebarOpen,    setSidebarOpen]    = useState(
    () => localStorage.getItem("sidebar-open") !== "false",
  );
  const [hoverNearEdge,  setHoverNearEdge]  = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => {
      const next = !o;
      localStorage.setItem("sidebar-open", next ? "true" : "false");
      return next;
    });
  }, []);
  const { wallpaper, wallpaperBlur, wallpaperOpacity } = useTheme();
  const dragCounter = useRef(0);
  const fileRef     = useRef<HTMLInputElement>(null);
  const folderRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  const onFiles = useCallback(
    (files: File[]) => { if (files.length) addFiles(files); },
    [addFiles],
  );

  // Drag-drop on whole window
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCounter.current += 1;
      setDragOver(true);
    };
    const onDragLeave = () => {
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
    };
    const onDragOver  = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragOver(false);
      onFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover",  onDragOver);
    window.addEventListener("drop",      onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover",  onDragOver);
      window.removeEventListener("drop",      onDrop);
    };
  }, [onFiles]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.code === "Space")                { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowRight")      { e.preventDefault(); next(); }
      else if (e.code === "ArrowLeft")       { e.preventDefault(); prev(); }
      else if (e.key === "m" || e.key === "M") { toggleMute(); }
      else if (e.key === "s" || e.key === "S") { toggleShuffle(); }
      else if (e.key === "r" || e.key === "R") { cycleRepeat(); }
      else if (e.key === "?")                  { setShortcutsOpen((o) => !o); }
      else if ((e.key === "p" || e.key === "P") && !isAndroid) { setMiniMode((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, next, prev, toggleMute, toggleShuffle, cycleRepeat]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const hasTracks = tracks.length > 0;

  // In mini-mode the sidebar must stay open so the "Full Player" nav button is
  // always accessible. Collapsing is only allowed in full-player (NowPlaying) mode.
  const effectiveSidebarOpen = sidebarOpen || miniMode;

  const isWin32 = typeof window !== 'undefined' && platformAPI?.platform === "win32";
  const isAndroid = currentPlatform === "android";
  // TitleBar now renders on all non-Android Electron platforms (frame:false everywhere).
  const hasCustomTitleBar = !isAndroid && !!platformAPI;

  return (
    <div data-debug="player-root" className={cn(
      "w-full flex flex-col text-foreground overflow-hidden relative",
      // On desktop with a wallpaper active, keep the root transparent so the
      // wallpaper fills the backdrop and backdrop-filter elements show it cleanly.
      // On Android or when no wallpaper is set, keep the solid bg-background.
      (!wallpaper || isAndroid) && "bg-background",
    )} style={{
      height: winHeight + "px",
      paddingTop: isAndroid ? "env(safe-area-inset-top, 0px)" : undefined,
    }}>
      {/* Spacer for Electron TitleBar — Android only (desktop rows sit flush at top) */}
      {false && !isAndroid && <div className="h-9 w-full shrink-0" />}
      {wallpaper && (
        <div data-debug="wallpaper" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <img
            src={wallpaper}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: `blur(${wallpaperBlur}px)`, opacity: wallpaperOpacity, transform: "scale(1.05)" }}
          />
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {isAndroid ? (
        /* Android: single header row, unchanged */
        <header className={cn(
          "relative z-[1] flex items-center justify-between py-3 border-b border-card-border",
          isAndroid ? "px-2" : "px-5",
        )}>
          <div className="flex items-center gap-2.5">
            {!miniMode && hasTracks && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMiniMode(true)}
                className="h-8 w-8 text-muted-foreground -ml-1 mr-0.5"
                aria-label="Back to library"
                title="Back to library"
              >
                <ChevronDown className="w-5 h-5" />
              </Button>
            )}
            <div className="w-8 h-8 rounded-md flex items-center justify-center bg-primary/15 text-primary">
              <Music className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-serif tracking-tight">Splayer</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Local listening room
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setYtOpen(true)}
              className="h-11 w-11 text-red-500"
              aria-label="Download from YouTube"
              title="Download from YouTube"
            >
              <Youtube className="w-4 h-4" />
            </Button>
            <DownloadQueueButton />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setAppearanceOpen(true)}
              className="h-8 w-8 text-muted-foreground"
              aria-label="Appearance"
              title="Appearance"
            >
              <Palette className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              className="h-8 w-8 text-muted-foreground"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </header>
      ) : (
        /* Desktop: two independent rows */
        <>
          {/* Row 1 — title strip */}
          <div className="relative z-[1] flex items-center px-5 pt-3 pb-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md flex items-center justify-center bg-primary/15 text-primary">
                <Music className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-serif tracking-tight">Splayer</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Local listening room
                </div>
              </div>
            </div>

          </div>

        </>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="relative z-[1] flex-1 flex overflow-hidden">
        {isAndroid ? (
          /* Android: mini mode = library view; full mode = NowPlaying */
          !miniMode && hasTracks ? (
            <ErrorBoundary>
              <NowPlaying />
            </ErrorBoundary>
          ) : hasTracks ? (
            <ErrorBoundary>
              <Playlist
                hasTracks={hasTracks}
                onAddFiles={() => fileRef.current?.click()}
                onAddFolder={() => folderRef.current?.click()}
                onOpenYt={() => setYtOpen(true)}
                onOpenAppearance={() => setAppearanceOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenShortcuts={() => setShortcutsOpen(true)}

                miniMode={miniMode}
                onToggleMini={() => setMiniMode((m) => !m)}
                onOpenEditor={(track) => setEditorTrack(track)}
              />
            </ErrorBoundary>
          ) : (
            <EmptyState />
          )
        ) : (
          /* Desktop: primary area + collapsible sidebar */
          <>
            {/* Primary content — NowPlaying or HomeDashboard.
                Hosts the hover zone and the toggle chevron button. */}
            <div
              className="relative flex-1 min-h-0 overflow-hidden flex flex-col"
              onMouseMove={(e) => {
                if (miniMode || !hasTracks) return; // hover detection only in full-player mode
                const { right } = e.currentTarget.getBoundingClientRect();
                setHoverNearEdge(e.clientX > right - 48);
              }}
              onMouseLeave={() => setHoverNearEdge(false)}
            >
              {miniMode ? (
                <ErrorBoundary>
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <HomeDashboard />
                  </div>
                </ErrorBoundary>
              ) : hasTracks ? (
                <ErrorBoundary>
                  <NowPlaying />
                </ErrorBoundary>
              ) : (
                <EmptyState />
              )}

              {/* Toggle chevron — only in full-player mode.
                  In mini-mode effectiveSidebarOpen forces the sidebar open so
                  the "Full Player" navigation button stays accessible. */}
              {!miniMode && hasTracks && (
                <button
                  onClick={toggleSidebar}
                  title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                  className={cn(
                    "absolute right-0 top-1/2 -translate-y-1/2 z-30",
                    "h-12 w-5 flex items-center justify-center rounded-l-lg",
                    "bg-card/80 backdrop-blur-sm",
                    "border border-card-border border-r-0",
                    "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                    "transition-opacity duration-150",
                    !sidebarOpen || hoverNearEdge
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none",
                  )}
                >
                  {sidebarOpen
                    ? <ChevronRight className="w-3.5 h-3.5" />
                    : <ChevronLeft  className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Sidebar — slides out/in via CSS width transition (200 ms).
                display:flex is required so the <aside> inside gets
                align-self:stretch (= full height), which lets the inner
                flex-1 / overflow-y-auto track list actually scroll.
                Without flex the aside collapses to content-height and
                overflow-y-auto has nothing to clip against. */}
            {(miniMode || hasTracks) && (
              <div
                className="shrink-0 overflow-hidden flex"
                style={{
                  width:      effectiveSidebarOpen ? "384px" : "0px",
                  transition: "width 200ms ease",
                }}
              >
                <ErrorBoundary>
                  <Playlist
                    hasTracks={hasTracks}
                    onAddFiles={() => fileRef.current?.click()}
                    onAddFolder={() => folderRef.current?.click()}
                    onOpenYt={() => setYtOpen(true)}
                    onOpenAppearance={() => setAppearanceOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenShortcuts={() => setShortcutsOpen(true)}
    
                    miniMode={miniMode}
                    onToggleMini={() => setMiniMode((m) => !m)}
                    onOpenEditor={(track) => setEditorTrack(track)}
                  />
                </ErrorBoundary>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hide when fullscreen visualizer is open, or when MiniPlayer replaces it on Android */}
      {!fsVizOpen && !(isAndroid && miniMode && hasTracks) && <PlayerControls />}

      {/* ── Android MiniPlayer bar — shown in mini (library) mode ──────── */}
      <AnimatePresence>
        {isAndroid && miniMode && hasTracks && (
          <MiniPlayer onExpand={() => setMiniMode(false)} />
        )}
      </AnimatePresence>

      {/* ── Drag overlay ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none"
          >
            <div className="border-2 border-dashed border-primary rounded-2xl px-12 py-10 text-center bg-card/80 shadow-2xl">
              <Upload className="w-8 h-8 mx-auto text-primary mb-3" />
              <p className="text-lg font-serif">Drop your music here</p>
              <p className="text-sm text-muted-foreground mt-1">MP3, FLAC, WAV, OGG, M4A, MP4</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <YoutubeDownloadDialog open={ytOpen} onOpenChange={setYtOpen} />

      <input ref={fileRef} type="file"
        accept="audio/*,video/mp4,video/*,.mp4,.m4a,.m4v,.mov,.mkv,.webm"
        multiple className="hidden" onChange={onChange}
      />
      <input ref={folderRef} type="file" multiple className="hidden" onChange={onChange} />

      {/* Editor page — rendered as a full-screen overlay */}
      {editorTrack && (
        <EditorPage
          track={editorTrack}
          onClose={() => setEditorTrack(null)}
        />
      )}
    </div>
  );
}
