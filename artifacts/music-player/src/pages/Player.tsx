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
  Upload,
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
import { motion, AnimatePresence } from "framer-motion";

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

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-card-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center bg-primary/15 text-primary">
            <Music className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-serif tracking-tight">Music Player</div>
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
            <HomeDashboard />
            <Playlist />
          </>
        ) : hasTracks ? (
          <>
            <NowPlaying />
            <Playlist />
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

      <input ref={fileRef} type="file"
        accept="audio/*,video/mp4,video/*,.mp4,.m4a,.m4v,.mov,.mkv,.webm"
        multiple className="hidden" onChange={onChange}
      />
      <input ref={folderRef} type="file" multiple className="hidden" onChange={onChange} />
    </div>
  );
}
