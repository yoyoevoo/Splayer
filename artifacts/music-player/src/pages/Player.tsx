import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileMusic,
  FolderOpen,
  HelpCircle,
  Maximize2,
  Minimize2,
  Music,
  Palette,
  Settings,
  Upload,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/lib/player-context";
import { EmptyState } from "@/components/EmptyState";
import { NowPlaying } from "@/components/NowPlaying";
import { Playlist } from "@/components/Playlist";
import { PlayerControls } from "@/components/PlayerControls";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { AppearanceDialog } from "@/components/AppearanceDialog";
import { MiniPlayer } from "@/components/MiniPlayer";
import { HomeDashboard } from "@/components/HomeDashboard";
import { YoutubeDownloadDialog } from "@/components/YoutubeDownloadDialog";
import { SpotifyPlaylistDialog } from "@/components/SpotifyPlaylistDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Player() {
  const {
    tracks,
    addFiles,
    togglePlay,
    next,
    prev,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const [shortcutsOpen,   setShortcutsOpen]   = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [ytOpen,        setYtOpen]        = useState(false);
  const [spotifyOpen,   setSpotifyOpen]   = useState(false);
  const [miniMode,      setMiniMode]      = useState(true);
  const [dragOver,      setDragOver]      = useState(false);
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
      else if (e.key === "p" || e.key === "P") { setMiniMode((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, next, prev, toggleMute, toggleShuffle, cycleRepeat]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const hasTracks = tracks.length > 0;

  const isWin32 = window.electronAPI?.platform === "win32";

  return (
    <div className={`h-screen w-full flex flex-col bg-background text-foreground overflow-hidden${isWin32 ? " pt-9" : ""}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-card-border">
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

        <div className="flex items-center gap-2">
          {/* Mini Player toggle */}
          <Button
            size="sm"
            variant={miniMode ? "default" : "ghost"}
            className="gap-2"
            onClick={() => setMiniMode((m) => !m)}
            title={miniMode ? "Return to full player (P)" : "Switch to mini player (P)"}
            data-testid="button-mini-player"
          >
            {miniMode
              ? <><Maximize2 className="w-3.5 h-3.5" /> Full Player</>
              : <><Minimize2 className="w-3.5 h-3.5" /> Mini Player</>}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-2" data-testid="button-header-add">
                <Upload className="w-3.5 h-3.5" />
                Add music
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                <FileMusic className="w-4 h-4 mr-2" />
                Add files...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => folderRef.current?.click()}>
                <FolderOpen className="w-4 h-4 mr-2" />
                Add folder...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYtOpen(true)}>
                <Youtube className="w-4 h-4 mr-2 text-red-500" />
                From YouTube...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSpotifyOpen(true)}>
                {/* Spotify green dot as icon */}
                <span className="w-4 h-4 mr-2 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#1DB954" aria-hidden>
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.32a.75.75 0 0 1-1.032.25c-2.823-1.725-6.38-2.115-10.567-1.158a.75.75 0 0 1-.334-1.463c4.58-1.047 8.508-.597 11.682 1.34a.75.75 0 0 1 .251 1.031zm1.473-3.276a.937.937 0 0 1-1.288.308C14.96 12.525 11.1 12 7.2 13.062a.938.938 0 0 1-.468-1.815C11.17 10.07 15.48 10.655 18.68 12.756a.938.938 0 0 1 .309 1.288zm.126-3.408c-3.35-1.99-8.875-2.172-12.073-1.201a1.124 1.124 0 0 1-.65-2.15c3.671-1.113 9.77-.898 13.626 1.39a1.125 1.125 0 1 1-1.127 1.95l.224-.989z" />
                  </svg>
                </span>
                From Spotify playlist...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAppearanceOpen(true)}
            className="h-8 w-8 text-muted-foreground"
            data-testid="button-appearance"
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
            data-testid="button-settings"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShortcutsOpen(true)}
            className="h-8 w-8 text-muted-foreground"
            data-testid="button-shortcuts"
            aria-label="Shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {miniMode ? (
          <>
            {/* Stable flex-1 wrapper ensures HomeDashboard always owns its slot */}
            <ErrorBoundary>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <HomeDashboard />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <Playlist />
            </ErrorBoundary>
          </>
        ) : hasTracks ? (
          <>
            <ErrorBoundary>
              <NowPlaying />
            </ErrorBoundary>
            <ErrorBoundary>
              <Playlist />
            </ErrorBoundary>
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* ── Footer controls (always visible) ──────────────────────────── */}
      <PlayerControls />

      {/* ── Floating Mini Player ───────────────────────────────────────── */}
      <AnimatePresence>
        {miniMode && (
          <MiniPlayer key="mini" onExpand={() => setMiniMode(false)} />
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
      <SpotifyPlaylistDialog open={spotifyOpen} onOpenChange={setSpotifyOpen} />

      <input ref={fileRef} type="file"
        accept="audio/*,video/mp4,video/*,.mp4,.m4a,.m4v,.mov,.mkv,.webm"
        multiple className="hidden" onChange={onChange}
      />
      <input ref={folderRef} type="file" multiple className="hidden" onChange={onChange} />
    </div>
  );
}
