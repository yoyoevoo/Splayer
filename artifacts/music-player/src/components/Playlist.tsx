import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  FileMusic,
  FolderOpen,
  Heart,
  Keyboard,
  ImagePlus,
  ListMusic,
  ListOrdered,
  Maximize2,
  Mic2,
  Minimize2,
  Music,
  MoreHorizontal,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ScanSearch,
  Scissors,
  Search,
  Settings,
  Tags,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import type { Playlist as PlaylistType, Track } from "@/lib/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { EditTrackDialog } from "./EditTrackDialog";
import { BulkTagEditor } from "./BulkTagEditor";
import { DuplicateFinder } from "./DuplicateFinder";
import { PlaylistsView } from "./PlaylistsView";
import { PlaylistDetailView } from "./PlaylistDetailView";
import { SmartPlaylistView } from "./SmartPlaylistView";
import { NewPlaylistDialog } from "./NewPlaylistDialog";
import { AddToPlaylistContextSub } from "./AddToPlaylistContextSub";
import { EqualizerBars } from "./EqualizerBars";
import { DeleteTrackDialog } from "./DeleteTrackDialog";
import { SelectionActionBar } from "./SelectionActionBar";
import { JumpToCurrentButton } from "./JumpToCurrentButton";
import { currentPlatform } from "@/lib/platform-api";
import { showTrackInFolder } from "@/lib/show-in-folder";
import { useTheme } from "@/lib/theme-context";
import type { SmartPlaylistKind } from "@/lib/types";
import { QueueView } from "./QueueView";
import { PodcastsView } from "./PodcastsView";
import { BooksView } from "./BooksView";
import { DownloadQueueButton } from "./DownloadQueuePanel";

type Tab = "library" | "playlists" | "queue" | "podcasts" | "books";
type View =
  | { kind: "library" }
  | { kind: "playlists" }
  | { kind: "playlist"; id: string }
  | { kind: "queue" }
  | { kind: "podcasts" }
  | { kind: "books" }
  | { kind: "smart"; smart: SmartPlaylistKind };

interface PlaylistProps {
  hasTracks?: boolean;
  onAddFiles?: () => void;
  onAddFolder?: () => void;
  onOpenYt?: () => void;
  onOpenAppearance?: () => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  miniMode?: boolean;
  onToggleMini?: () => void;
  onOpenEditor?: (track: Track) => void;
}

export function Playlist({
  hasTracks,
  onAddFiles,
  onAddFolder,
  onOpenYt,
  onOpenAppearance,
  onOpenSettings,
  onOpenShortcuts,
  miniMode,
  onToggleMini,
  onOpenEditor,
}: PlaylistProps = {}) {
  const [view, setView] = useState<View>({ kind: "library" });
  const { animatedTransitions, effectiveReduceMotion } = useTheme();
  const shouldAnimate = animatedTransitions && !effectiveReduceMotion;
  const viewKey = view.kind === "playlist" ? `playlist-${view.id}`
                : view.kind === "smart"    ? `smart-${view.smart}`
                : view.kind;

  const tab: Tab = view.kind === "library" ? "library"
    : view.kind === "queue"    ? "queue"
    : view.kind === "podcasts" ? "podcasts"
    : view.kind === "books"    ? "books"
    : "playlists";

  return (
    <aside
      className={cn(
        "w-full md:w-80 lg:w-96 flex flex-col border-l border-card-border min-h-0 rounded-l-2xl overflow-hidden",
        currentPlatform === "android"
          ? "bg-background/60 backdrop-blur-[3px]"
          : "bg-sidebar/40 backdrop-blur",
      )}
    >
      {currentPlatform !== "android" && (
        <div className="flex items-center justify-end px-3 py-0.5 shrink-0">
          {onToggleMini && (
            <Button
              size="sm"
              variant={miniMode ? "default" : "ghost"}
              className="gap-2 mr-1"
              onClick={onToggleMini}
              title={miniMode ? "Return to full player (P)" : "Switch to mini player (P)"}
            >
              {miniMode
                ? <><Maximize2 className="w-3.5 h-3.5" /> Full Player</>
                : <><Minimize2 className="w-3.5 h-3.5" /> Mini Player</>}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-2" data-testid="button-header-add">
                <Upload className="w-3.5 h-3.5" />
                Add music
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddFiles}>
                <FileMusic className="w-4 h-4 mr-2" />
                Add files...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddFolder}>
                <FolderOpen className="w-4 h-4 mr-2" />
                Add folder...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenYt}>
                <Youtube className="w-4 h-4 mr-2 text-red-500" />
                From YouTube...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DownloadQueueButton />
          <Button size="icon" variant="ghost" onClick={onOpenAppearance}
            className="h-8 w-8 text-muted-foreground" data-testid="button-appearance"
            aria-label="Appearance" title="Appearance">
            <Palette className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onOpenSettings}
            className="h-8 w-8 text-muted-foreground" data-testid="button-settings"
            aria-label="Settings" title="Settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onOpenShortcuts}
            className="h-8 w-8 text-muted-foreground" data-testid="button-shortcuts"
            aria-label="Shortcuts">
            <Keyboard className="w-4 h-4" />
          </Button>
          {onOpenEditor && <EditorSidebarButton onOpenEditor={onOpenEditor} />}
        </div>
      )}
      <div className={cn(
        "pt-0 pb-1 border-b border-card-border",
        currentPlatform !== "android" && "px-3",
      )}>
        <div className={cn(
          "grid gap-0 bg-muted/40",
          currentPlatform === "android"
            ? "grid-cols-4 py-1"
            : "grid-cols-5 gap-1 p-1 rounded-md",
        )}>
          <button
            type="button"
            onClick={() => setView({ kind: "library" })}
            className={cn(
              "flex items-center justify-center gap-1.5 text-xs h-7 rounded transition-colors",
              tab === "library"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-library"
          >
            <Music className="w-3.5 h-3.5" />
            Library
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: "playlists" })}
            className={cn(
              "flex items-center justify-center gap-1.5 text-xs h-7 rounded transition-colors",
              tab === "playlists"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-playlists"
          >
            <ListMusic className="w-3.5 h-3.5" />
            Playlists
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: "queue" })}
            className={cn(
              "flex items-center justify-center gap-1 text-xs h-7 rounded transition-colors",
              tab === "queue"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-queue"
          >
            <ListOrdered className="w-3 h-3" />
            Queue
          </button>
          {currentPlatform !== "android" && (
            <button
              type="button"
              onClick={() => setView({ kind: "podcasts" })}
              className={cn(
                "flex items-center justify-center gap-1 text-xs h-7 rounded transition-colors",
                tab === "podcasts"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="tab-podcasts"
            >
              <Mic2 className="w-3 h-3" />
              Pods
            </button>
          )}
          <button
            type="button"
            onClick={() => setView({ kind: "books" })}
            className={cn(
              "flex items-center justify-center gap-1 text-xs h-7 rounded transition-colors",
              tab === "books"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-books"
          >
            <BookOpen className="w-3 h-3" />
            Books
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewKey}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
          initial={shouldAnimate ? { opacity: 0, y: 8 } : { opacity: 1, y: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldAnimate ? { opacity: 0, y: -4 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {view.kind === "library" && <LibraryView onOpenEditor={onOpenEditor} />}
          {view.kind === "queue" && <QueueView />}
          {view.kind === "podcasts" && <PodcastsView />}
          {view.kind === "books" && <BooksView />}
          {view.kind === "playlists" && (
            <PlaylistsView
              onOpenPlaylist={(p) => setView({ kind: "playlist", id: p.id })}
              onOpenSmart={(s) => setView({ kind: "smart", smart: s })}
            />
          )}
          {view.kind === "playlist" && (
            <PlaylistDetailView
              playlistId={view.id}
              onBack={() => setView({ kind: "playlists" })}
            />
          )}
          {view.kind === "smart" && (
            <SmartPlaylistView
              kind={view.smart}
              onBack={() => setView({ kind: "playlists" })}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function EditorSidebarButton({ onOpenEditor }: { onOpenEditor: (track: Track) => void }) {
  const { currentTrack } = usePlayer();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => { if (currentTrack) onOpenEditor(currentTrack); }}
      disabled={!currentTrack}
      className="h-8 w-8 text-muted-foreground"
      aria-label="Open in Editor"
      title={currentTrack ? `Edit "${currentTrack.title}" in Splayer Editor` : "Play a track to edit it"}
    >
      <Scissors className="w-4 h-4" />
    </Button>
  );
}

function LibraryView({ onOpenEditor }: { onOpenEditor?: (track: Track) => void }) {
  const {
    tracks,
    playlists,
    currentTrack,
    isPlaying,
    playFromList,
    addFiles,
    removeTrack,
    deleteTrackWithFile,
    setCustomCover,
    addTracksToPlaylist,
    toggleLike,
    isScanning,
    scanStatus,
    autoScanLibrary,
    cancelScan,
  } = usePlayer();
  const [query, setQuery] = useState("");
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Track | null>(null);
  const [newPlaylistFor, setNewPlaylistFor] = useState<string | null>(null);

  const showInFolder = (track: Track) => showTrackInFolder(track);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkEditorInitialIds, setBulkEditorInitialIds] = useState<string[]>([]);
  const [dupFinderOpen, setDupFinderOpen] = useState(false);

  // Selection mode
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Heart animation
  const [animatingLikeIds, setAnimatingLikeIds] = useState<Set<string>>(new Set());
  const triggerLikeAnim = (id: string) => {
    setAnimatingLikeIds(prev => new Set(prev).add(id));
    setTimeout(() => setAnimatingLikeIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 300);
  };

  // Jump-to-current
  const [highlightedId, setHighlightedId] = useState("");

  const [artRefresh, setArtRefresh] = useState(0);
  useEffect(() => {
    const handler = () => setArtRefresh(p => p + 1);
    window.addEventListener("art-removed", handler);
    return () => window.removeEventListener("art-removed", handler);
  }, []);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef  = useRef<HTMLInputElement>(null);
  const coverTrackIdRef = useRef<string | null>(null);
  const scrollRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const filtered = useMemo(() => tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    }), [tracks, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 6,
    paddingStart: 8,
    paddingEnd: 60,
  });

  const handleJump = useCallback(() => {
    if (!currentTrack) return;
    const idx = filtered.findIndex(({ t }) => t.id === currentTrack.id);
    if (idx === -1) return;
    virtualizer.scrollToIndex(idx, { align: "center" });
    setHighlightedId(currentTrack.id);
    setTimeout(() => setHighlightedId(""), 1500);
  }, [currentTrack, filtered, virtualizer]);

  const jumpVisible =
    !!currentTrack && filtered.some(({ t }) => t.id === currentTrack.id);

  const onAddChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = "";
  };

  const onPickCover = (id: string) => {
    coverTrackIdRef.current = id;
    coverInputRef.current?.click();
  };
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = coverTrackIdRef.current;
    if (file && id) await setCustomCover(id, file);
    coverTrackIdRef.current = null;
    e.target.value = "";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="p-4 space-y-3 border-b border-card-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-foreground/80 uppercase">
            Library
          </h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => autoScanLibrary(true)}
              disabled={isScanning}
              title="Rescan music folders for new or removed songs"
              data-testid="button-refresh-library"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isScanning && "animate-spin")} />
              <span className="sr-only">Refresh Library</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setDupFinderOpen(true)}
              title="Find Duplicates"
              data-testid="button-find-duplicates"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              <span className="sr-only">Find Duplicates</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                setBulkEditorInitialIds([]);
                setBulkEditorOpen(true);
              }}
              title="Bulk Tag Editor"
              data-testid="button-bulk-tag-editor"
            >
              <Tags className="w-3.5 h-3.5" />
              <span className="sr-only">Bulk Tag Editor</span>
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                data-testid="button-add-music"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <FileMusic className="w-4 h-4 mr-2" />
                Add files...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                <FolderOpen className="w-4 h-4 mr-2" />
                Add folder...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tracks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">
            {isScanning
              ? (scanStatus ?? "Scanning for music…")
              : scanStatus
                ? scanStatus
                : (
                  <>
                    {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                    {query && filtered.length !== tracks.length
                      ? ` · ${filtered.length} shown`
                      : ""}
                  </>
                )
            }
          </p>
          {isScanning && (
            <button
              onClick={cancelScan}
              className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={{ WebkitUserSelect: "none" as any, userSelect: "none" }}
      >
        {tracks.length > 0 && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground p-6">No matches</p>
        )}
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const { t, i } = filtered[vItem.index];
              const isActive = currentTrack?.id === t.id;
              return (
                <div
                  key={t.id}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start}px)`,
                    padding: "0 8px 4px",
                  }}
                >
                  <ContextMenu>
                    <ContextMenuTrigger className="block w-full rounded-md">
                  <div
                    className={cn(
                      "group relative flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate active-elevate-2",
                      isActive && "bg-accent",
                      selectedIds.has(t.id) && "bg-primary/10 border border-primary/30",
                      highlightedId === t.id && "ring-1 ring-primary/50 bg-primary/5",
                    )}
                    onClick={() => {
                      playFromList(tracks.map((tr) => tr.id), i, "Library");
                    }}
                    data-testid={`track-${t.id}`}
                  >
                    {/* Checkbox — always visible, click to select */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                      className="shrink-0 flex items-center justify-center w-5 h-5"
                      aria-label={selectedIds.has(t.id) ? "Deselect" : "Select"}
                    >
                      <Checkbox checked={selectedIds.has(t.id)} className="h-4 w-4 pointer-events-none" />
                    </button>
                    <div className="relative shrink-0">
                      <AlbumCover
                        key={`${t.id}-${trackCoverUrl(t) ?? "none"}-${artRefresh}`}
                        src={trackCoverUrl(t)}
                        seed={t.title + t.artist}
                        title={t.title}
                        artist={t.artist}
                        size="sm"
                      />
                      {isActive && (
                        <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                          {isPlaying ? (
                            <EqualizerBars />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-sm truncate",
                          isActive
                            ? "text-primary font-medium"
                            : "text-foreground",
                        )}
                      >
                        {t.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.artist}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(t.id);
                        triggerLikeAnim(t.id);
                      }}
                      className={cn(
                        "h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 transition-colors duration-200",
                        t.liked ? "text-red-500 opacity-100" : "text-muted-foreground hover:text-red-400",
                      )}
                      aria-label={t.liked ? "Unlike" : "Like"}
                    >
                      <Heart
                        className={cn("w-3.5 h-3.5", animatingLikeIds.has(t.id) && "heart-beat")}
                        fill={t.liked ? "currentColor" : "none"}
                      />
                    </Button>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatTime(t.duration)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`menu-${t.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AddToPlaylistSubmenu
                          playlists={playlists}
                          onAdd={(plId) =>
                            addTracksToPlaylist(plId, [t.id])
                          }
                          onCreate={() => setNewPlaylistFor(t.id)}
                        />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onPickCover(t.id);
                          }}
                        >
                          <ImagePlus className="w-4 h-4 mr-2" />
                          Change cover
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTrack(t);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTrack(t.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove from library
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(t);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete file from disk
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-52">
                      <ContextMenuItem
                        onClick={() =>
                          playFromList(
                            tracks.map((tr) => tr.id),
                            i,
                            "Library",
                          )
                        }
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Play
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <AddToPlaylistContextSub
                        trackId={t.id}
                        playlists={playlists}
                        addTracksToPlaylist={addTracksToPlaylist}
                        onCreateNew={() => setNewPlaylistFor(t.id)}
                      />
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => showInFolder(t)}>
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Show in Folder
                      </ContextMenuItem>
                      {onOpenEditor && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => onOpenEditor(t)}>
                            <Scissors className="w-4 h-4 mr-2" />
                            Edit in Splayer Editor
                          </ContextMenuItem>
                        </>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => removeTrack(t.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove from library
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => setDeleteTarget(t)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete file from disk
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </div>
      </div>

      {/* Absolute overlay — no layout impact */}
      {selectionMode && (
        <div className="absolute bottom-0 inset-x-0 z-10">
          <SelectionActionBar
            selectedIds={selectedIds}
            tracks={tracks}
            playlists={playlists}
            onClear={() => setSelectedIds(new Set())}
            onBulkTagEdit={() => {
              setBulkEditorInitialIds([...selectedIds]);
              setBulkEditorOpen(true);
            }}
          />
        </div>
      )}

      <JumpToCurrentButton
        onClick={handleJump}
        visible={jumpVisible}
        elevated={selectionMode}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4,video/*,.mp4,.m4a,.m4v,.mov,.mkv,.webm"
        multiple
        className="hidden"
        onChange={onAddChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onAddChange}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onCoverChange}
      />
      {editTrack && (
        <EditTrackDialog
          open={!!editTrack}
          onOpenChange={(o) => !o && setEditTrack(null)}
          track={editTrack}
        />
      )}
      <BulkTagEditor
        open={bulkEditorOpen}
        onOpenChange={setBulkEditorOpen}
        initialTrackIds={bulkEditorInitialIds}
      />
      <DuplicateFinder
        open={dupFinderOpen}
        onOpenChange={setDupFinderOpen}
      />
      <NewPlaylistDialog
        open={newPlaylistFor !== null}
        onOpenChange={(o) => {
          if (!o) setNewPlaylistFor(null);
        }}
        onCreated={(id) => {
          if (newPlaylistFor) {
            addTracksToPlaylist(id, [newPlaylistFor]);
          }
          setNewPlaylistFor(null);
        }}
      />
      <DeleteTrackDialog
        track={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={(id) => { deleteTrackWithFile(id); setDeleteTarget(null); }}
      />
    </div>
  );
}

function AddToPlaylistSubmenu({
  playlists,
  onAdd,
  onCreate,
}: {
  playlists: PlaylistType[];
  onAdd: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ListMusic className="w-4 h-4 mr-2" />
        Add to playlist
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCreate();
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New playlist…
          </DropdownMenuItem>
          {playlists.length > 0 && <DropdownMenuSeparator />}
          {playlists.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(p.id);
              }}
            >
              {p.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

