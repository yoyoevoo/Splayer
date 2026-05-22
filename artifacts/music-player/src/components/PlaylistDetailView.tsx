import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Download,
  FolderOpen,
  GitMerge,
  GripVertical,
  Heart,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AddToPlaylistContextSub } from "./AddToPlaylistContextSub";
import { usePlayer } from "@/lib/player-context";
import { showTrackInFolder } from "@/lib/show-in-folder";
import { exportPlaylistAsM3U } from "@/lib/export-playlist";
import {
  trackCoverUrl,
  playlistDuration,
  playlistTracks,
} from "@/lib/types";
import type { Playlist } from "@/lib/types";
import { formatLongDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { MosaicCover } from "./MosaicCover";
import { EditPlaylistDialog } from "./EditPlaylistDialog";
import { AddTracksDialog } from "./AddTracksDialog";
import { DeleteTrackDialog } from "./DeleteTrackDialog";
import { NewPlaylistDialog } from "./NewPlaylistDialog";
import { MergePlaylistDialog } from "./MergePlaylistDialog";
import { BulkTagEditor } from "./BulkTagEditor";
import { SelectionActionBar } from "./SelectionActionBar";
import { JumpToCurrentButton, scrollToRow } from "./JumpToCurrentButton";
import { Checkbox } from "@/components/ui/checkbox";

interface PlaylistDetailViewProps {
  playlistId: string;
  onBack: () => void;
}

export function PlaylistDetailView({
  playlistId,
  onBack,
}: PlaylistDetailViewProps) {
  const {
    tracks,
    playlists,
    currentTrack,
    isPlaying,
    playFromList,
    deletePlaylist,
    setPlaylistCover,
    removeTrackFromPlaylist,
    addTracksToPlaylist,
    deleteTrackWithFile,
    toggleLike,
    reorderPlaylist,
  } = usePlayer();

  const playlist = playlists.find((p) => p.id === playlistId);
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPlaylistFor, setNewPlaylistFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<import("@/lib/types").Track | null>(null);
  const [coverBump, setCoverBump] = useState(0);

  // Heart animation
  const [animatingLikeIds, setAnimatingLikeIds] = useState<Set<string>>(new Set());
  const triggerLikeAnim = (id: string) => {
    setAnimatingLikeIds(prev => new Set(prev).add(id));
    setTimeout(() => setAnimatingLikeIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 300);
  };

  // Selection mode
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkEditorInitialIds, setBulkEditorInitialIds] = useState<string[]>([]);

  // Drag-to-reorder (disabled during search and selection mode)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const showInFolder = (track: { id: string; file?: File; path?: string; url?: string }) =>
    showTrackInFolder(track);

  // Drag-to-reorder via explicit handle — no long-press timer needed
  const listRef = useRef<HTMLUListElement>(null);
  const touchStateRef = useRef<{ id: string | null; dragging: boolean }>({ id: null, dragging: false });
  const draggedIdRef = useRef<string | null>(null);
  draggedIdRef.current = draggedId;
  const dragOverIndexRef = useRef<number | null>(null);
  dragOverIndexRef.current = dragOverIndex;

  // Jump-to-current
  const [highlightedId, setHighlightedId] = useState("");
  const handleJump = useCallback(() => {
    if (!currentTrack) return;
    scrollToRow(`playlist-track-${currentTrack.id}`, setHighlightedId, currentTrack.id);
  }, [currentTrack]);

  // Re-render playlist art when any track art is fetched/updated
  useEffect(() => {
    const handler = () => setCoverBump(p => p + 1);
    window.addEventListener("art-fetched", handler);
    window.addEventListener("art-removed", handler);
    return () => {
      window.removeEventListener("art-fetched", handler);
      window.removeEventListener("art-removed", handler);
    };
  }, []);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const plTracks = useMemo(
    () => (playlist ? playlistTracks(playlist, tracks) : []),
    [playlist, tracks],
  );
  // IDs of tracks that actually exist — used for playback queue so ghost entries
  // (deleted files still referenced by playlist.trackIds) don't offset indices.
  const plTrackIds = useMemo(() => plTracks.map((t) => t.id), [plTracks]);

  const filtered = useMemo(() => {
    if (!query) return plTracks.map((t, i) => ({ t, i }));
    const q = query.toLowerCase();
    return plTracks
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q),
      );
  }, [plTracks, query]);

  const jumpVisible =
    !!currentTrack && filtered.some(({ t }) => t.id === currentTrack.id);

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="text-sm text-muted-foreground">
          Playlist not found
        </div>
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
      </div>
    );
  }

  const trackCovers = plTracks.map((t) => trackCoverUrl(t));
  const totalSec = playlistDuration(playlist, tracks);

  const onPlayAll = () => {
    if (plTrackIds.length === 0) return;
    playFromList(plTrackIds, 0, playlist.name, playlist.id, "regular");
  };

  const onPickCover = () => coverInputRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setPlaylistCover(playlist.id, file);
    e.target.value = "";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="p-3 border-b border-card-border space-y-3">
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={onBack}
            className="gap-1.5 -ml-2"
            data-testid="button-back-to-playlists"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Playlists
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                data-testid="button-playlist-menu"
                aria-label="Playlist options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPickCover}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Change cover
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportPlaylistAsM3U(playlist, tracks)}>
                <Download className="w-4 h-4 mr-2" />
                Export as M3U
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMerging(true)}>
                <GitMerge className="w-4 h-4 mr-2" />
                Merge with another playlist
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (
                    confirm(
                      `Delete playlist "${playlist.name}"? Your music files stay safe.`,
                    )
                  ) {
                    deletePlaylist(playlist.id);
                    onBack();
                  }
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onPickCover}
            className="relative group rounded-lg overflow-hidden"
            data-testid="button-change-playlist-cover"
            aria-label="Change cover"
          >
            <MosaicCover
              customCoverUrl={playlist.customCoverUrl}
              trackCovers={trackCovers}
              seed={playlist.id + playlist.name}
              size="lg"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-white" />
            </div>
          </button>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setEditing(true)}
              className="block text-left max-w-full"
              data-testid="button-rename-playlist"
            >
              <div className="text-base font-serif tracking-tight truncate hover:underline">
                {playlist.name}
              </div>
            </button>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {plTracks.length}{" "}
              {plTracks.length === 1 ? "track" : "tracks"}
              {totalSec > 0 ? ` • ${formatLongDuration(totalSec)}` : ""}
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button
                size="sm"
                onClick={onPlayAll}
                disabled={plTracks.length === 0}
                className="gap-1.5 h-7"
                data-testid="button-play-playlist"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAdding(true)}
                className="gap-1.5 h-7"
                data-testid="button-add-tracks-to-playlist"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => exportPlaylistAsM3U(playlist, tracks)}
                className="gap-1.5 h-7"
                data-testid="button-export-playlist"
                title="Export as M3U"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {plTracks.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search in this playlist"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-playlist-search"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
        {plTracks.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="text-sm text-muted-foreground mb-4">
              This playlist is empty
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              className="gap-1.5"
              data-testid="button-add-first-track"
            >
              <Plus className="w-3.5 h-3.5" />
              Add tracks
            </Button>
          </div>
        ) : (
          <ul
            ref={listRef}
            className="p-2 space-y-1 pb-14"
            style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            onContextMenuCapture={(e) => {
              if (draggedIdRef.current) { e.preventDefault(); e.stopPropagation(); }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!draggedId || dragOverIndex === null) return;
              const fromIdx = plTrackIds.indexOf(draggedId);
              const toIdx = dragOverIndex;
              if (fromIdx === -1 || fromIdx === toIdx || fromIdx === toIdx - 1) {
                setDraggedId(null);
                setDragOverIndex(null);
                return;
              }
              const newIds = [...plTrackIds];
              newIds.splice(fromIdx, 1);
              newIds.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, draggedId);
              reorderPlaylist(playlist.id, newIds);
              setDraggedId(null);
              setDragOverIndex(null);
            }}
            onDragLeave={(e) => {
              if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragOverIndex(null);
            }}
          >
            <AnimatePresence initial={false}>
              {filtered.map(({ t, i }, listIdx) => {
                const isActive = currentTrack?.id === t.id;
                return (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Drop insertion line above this row */}
                    {draggedId && dragOverIndex === listIdx && (
                      <div className="h-0.5 bg-primary rounded-full mx-1 mb-1 pointer-events-none" aria-hidden />
                    )}
                    <ContextMenu>
                      <ContextMenuTrigger className="block w-full rounded-md">
                    <div
                      data-drag-item={t.id}
                      className={cn(
                        "group relative flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate active-elevate-2",
                        isActive && "bg-accent",
                        selectedIds.has(t.id) && "bg-primary/10 border border-primary/30",
                        draggedId === t.id && "opacity-50",
                        highlightedId === t.id && "ring-1 ring-primary/50 bg-primary/5",
                      )}
                      onClick={() => {
                        playFromList(plTrackIds, i, playlist.name, playlist.id, "regular");
                      }}
                      data-testid={`playlist-track-${t.id}`}
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
                          key={`${t.id}-${coverBump}`}
                          src={trackCoverUrl(t)}
                          seed={t.title + t.artist}
                          title={t.title}
                          artist={t.artist}
                          size="sm"
                        />
                        {isActive && (
                          <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                            {isPlaying ? (
                              <span className="flex items-end gap-[2px] h-3">
                                {[0, 1, 2].map((bi) => (
                                  <span
                                    key={bi}
                                    className="w-[3px] bg-primary rounded-sm"
                                    style={{
                                      animation: `eq 1s ${bi * 0.15}s ease-in-out infinite`,
                                      height: "100%",
                                    }}
                                  />
                                ))}
                              </span>
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
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-70 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromPlaylist(playlist.id, t.id);
                        }}
                        data-testid={`button-remove-from-playlist-${t.id}`}
                        aria-label="Remove from playlist"
                        title="Remove from playlist"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      {/* Drag handle — right side, pointer events work for both touch and mouse */}
                      <button
                        type="button"
                        aria-label="Drag to reorder"
                        style={{ touchAction: 'none' }}
                        className="shrink-0 flex items-center justify-center w-7 h-8 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const handle = e.currentTarget;
                          handle.setPointerCapture(e.pointerId);
                          const id = t.id;
                          touchStateRef.current = { id, dragging: true };
                          draggedIdRef.current = id;
                          const row = listRef.current?.querySelector(`[data-drag-item="${id}"]`) as HTMLElement | null;
                          if (row) row.style.opacity = '0.45';
                          setDraggedId(id);
                        }}
                        onPointerMove={(e) => {
                          if (!touchStateRef.current.dragging) return;
                          const y = e.clientY;
                          const items = listRef.current?.querySelectorAll('[data-drag-item]');
                          if (!items) return;
                          let idx = items.length;
                          for (let j = 0; j < items.length; j++) {
                            const rect = items[j].getBoundingClientRect();
                            if (y < rect.top + rect.height / 2) { idx = j; break; }
                          }
                          dragOverIndexRef.current = idx;
                          setDragOverIndex(idx);
                        }}
                        onPointerUp={() => {
                          const dId = draggedIdRef.current;
                          const dIdx = dragOverIndexRef.current;
                          const row = dId ? listRef.current?.querySelector(`[data-drag-item="${dId}"]`) as HTMLElement | null : null;
                          if (row) row.style.opacity = '';
                          if (dId !== null && dIdx !== null) {
                            const from = plTrackIds.indexOf(dId);
                            if (from !== -1 && from !== dIdx && from !== dIdx - 1) {
                              const newIds = [...plTrackIds];
                              newIds.splice(from, 1);
                              newIds.splice(dIdx > from ? dIdx - 1 : dIdx, 0, dId);
                              reorderPlaylist(playlistId, newIds);
                            }
                          }
                          setDraggedId(null); setDragOverIndex(null);
                          draggedIdRef.current = null; dragOverIndexRef.current = null;
                          touchStateRef.current = { id: null, dragging: false };
                        }}
                        onPointerCancel={() => {
                          const dId = draggedIdRef.current;
                          const row = dId ? listRef.current?.querySelector(`[data-drag-item="${dId}"]`) as HTMLElement | null : null;
                          if (row) row.style.opacity = '';
                          setDraggedId(null); setDragOverIndex(null);
                          draggedIdRef.current = null; dragOverIndexRef.current = null;
                          touchStateRef.current = { id: null, dragging: false };
                        }}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56">
                        <ContextMenuItem
                          onClick={() =>
                            playFromList(plTrackIds, i, playlist.name, playlist.id, "regular")
                          }
                          data-testid={`context-play-${t.id}`}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Play
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <AddToPlaylistContextSub
                          trackId={t.id}
                          playlists={playlists.filter((p) => p.id !== playlist.id)}
                          addTracksToPlaylist={addTracksToPlaylist}
                          onCreateNew={() => setNewPlaylistFor(t.id)}
                        />
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => showInFolder(t)}>
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Show in Folder
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() =>
                            removeTrackFromPlaylist(playlist.id, t.id)
                          }
                          className="text-destructive focus:text-destructive"
                          data-testid={`context-remove-${t.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove from "{playlist.name}"
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => setDeleteTarget(t)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete file from disk
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {/* Drop insertion line after the last row */}
            {draggedId && dragOverIndex === filtered.length && (
              <li className="h-0.5 bg-primary rounded-full mx-1 mt-1 pointer-events-none" aria-hidden />
            )}
            {plTracks.length > 0 && filtered.length === 0 && (
              <li className="text-center text-sm text-muted-foreground p-6">
                No matches
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Absolute overlay */}
      {selectionMode && (
        <div className="absolute bottom-0 inset-x-0 z-10">
          <SelectionActionBar
            selectedIds={selectedIds}
            tracks={plTracks}
            playlists={playlists.filter((p) => p.id !== playlistId)}
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
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onCoverChange}
      />

      {editing && (
        <EditPlaylistDialog
          open={editing}
          onOpenChange={setEditing}
          playlist={playlist}
        />
      )}
      <AddTracksDialog
        open={adding}
        onOpenChange={setAdding}
        playlist={playlist}
      />
      <DeleteTrackDialog
        track={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={(id) => { deleteTrackWithFile(id); setDeleteTarget(null); }}
      />
      <BulkTagEditor
        open={bulkEditorOpen}
        onOpenChange={setBulkEditorOpen}
        initialTrackIds={bulkEditorInitialIds}
      />
      <NewPlaylistDialog
        open={newPlaylistFor !== null}
        onOpenChange={(o) => { if (!o) setNewPlaylistFor(null); }}
        onCreated={async (id) => {
          if (newPlaylistFor) await addTracksToPlaylist(id, [newPlaylistFor]);
          setNewPlaylistFor(null);
        }}
      />
      <MergePlaylistDialog
        open={merging}
        onOpenChange={setMerging}
        playlist={playlist}
      />
    </div>
  );
}
