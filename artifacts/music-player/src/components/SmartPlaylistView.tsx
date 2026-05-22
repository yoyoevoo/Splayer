import { useCallback, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  FolderOpen,
  FolderX,
  GripVertical,
  Heart,
  History,
  Play,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { usePlayer } from "@/lib/player-context";
import { showTrackInFolder } from "@/lib/show-in-folder";
import { DeleteTrackDialog } from "./DeleteTrackDialog";
import { NewPlaylistDialog } from "./NewPlaylistDialog";
import { AddToPlaylistContextSub } from "./AddToPlaylistContextSub";
import { BulkTagEditor } from "./BulkTagEditor";
import { SelectionActionBar } from "./SelectionActionBar";
import { JumpToCurrentButton, scrollToRow } from "./JumpToCurrentButton";
import {
  trackCoverUrl,
  smartPlaylistTracks,
  SMART_PLAYLISTS,
} from "@/lib/types";
import type { SmartPlaylistKind } from "@/lib/types";
import { formatLongDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { EqualizerBars } from "./EqualizerBars";

interface SmartPlaylistViewProps {
  kind: SmartPlaylistKind;
  onBack: () => void;
}

function smartIcon(kind: SmartPlaylistKind) {
  if (kind === "liked-songs") return Heart;
  if (kind === "recently-played") return History;
  if (kind === "most-played") return TrendingUp;
  if (kind === "recently-added") return Sparkles;
  if (kind === "no-playlist") return FolderX;
  return Clock;
}

function smartGradient(kind: SmartPlaylistKind): string {
  if (kind === "liked-songs")
    return "linear-gradient(135deg, hsl(340 70% 45%), hsl(320 60% 30%))";
  if (kind === "recently-played")
    return "linear-gradient(135deg, hsl(250 65% 50%), hsl(220 60% 30%))";
  if (kind === "most-played")
    return "linear-gradient(135deg, hsl(28 80% 45%), hsl(15 70% 30%))";
  if (kind === "recently-added")
    return "linear-gradient(135deg, hsl(200 70% 45%), hsl(260 60% 30%))";
  if (kind === "no-playlist")
    return "linear-gradient(135deg, hsl(0 45% 32%), hsl(350 55% 20%))";
  return "linear-gradient(135deg, hsl(140 50% 40%), hsl(180 55% 25%))";
}

function emptyMessage(kind: SmartPlaylistKind): string {
  switch (kind) {
    case "liked-songs":
      return "Heart a track to see it here.";
    case "recently-played":
      return "Play some music and it'll show up here.";
    case "most-played":
      return "Play some music and your top tracks will show up here.";
    case "recently-added":
      return "Add music to your library to see your latest additions.";
    case "never-played":
      return "You've listened to everything. Nice work!";
    case "no-playlist":
      return "All your tracks are in at least one playlist. Nice!";
  }
}

export function SmartPlaylistView({ kind, onBack }: SmartPlaylistViewProps) {
  const { tracks, playlists, currentTrack, isPlaying, playFromList, toggleLike, deleteTrackWithFile, addTracksToPlaylist } =
    usePlayer();
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<import("@/lib/types").Track | null>(null);
  const [newPlaylistFor, setNewPlaylistFor] = useState<string | null>(null);

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

  // Heart animation
  const [animatingLikeIds, setAnimatingLikeIds] = useState<Set<string>>(new Set());
  const triggerLikeAnim = (id: string) => {
    setAnimatingLikeIds(prev => new Set(prev).add(id));
    setTimeout(() => setAnimatingLikeIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 300);
  };

  // Drag-to-reorder state (in-memory only, not persisted for smart playlists)
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
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
    scrollToRow(`smart-track-${currentTrack.id}`, setHighlightedId, currentTrack.id);
  }, [currentTrack]);

  const meta = SMART_PLAYLISTS.find((s) => s.kind === kind);
  const Icon = smartIcon(kind);

  const computed = useMemo(
    () => smartPlaylistTracks(kind, tracks, playlists),
    [kind, tracks, playlists],
  );

  // Apply manual drag order on top of computed; new tracks are appended, removed ones dropped.
  const displayTracks = useMemo(() => {
    if (!orderedIds) return computed;
    const map = new Map(computed.map((t) => [t.id, t]));
    const ordered = orderedIds.flatMap((id) => { const t = map.get(id); return t ? [t] : []; });
    const orderedSet = new Set(orderedIds);
    return [...ordered, ...computed.filter((t) => !orderedSet.has(t.id))];
  }, [computed, orderedIds]);

  const filtered = useMemo(() => {
    if (!query) return displayTracks.map((t, i) => ({ t, i }));
    const q = query.toLowerCase();
    return displayTracks
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q),
      );
  }, [displayTracks, query]);

  const jumpVisible =
    !!currentTrack && filtered.some(({ t }) => t.id === currentTrack.id);

  const totalSec = computed.reduce((sum, t) => sum + (t.duration || 0), 0);

  const onPlayAll = () => {
    if (displayTracks.length === 0) return;
    playFromList(
      displayTracks.map((t) => t.id),
      0,
      meta?.name ?? "Smart Playlist",
      null,
      "smart",
    );
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
        </div>

        <div className="flex items-center gap-3">
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center shadow-md shrink-0"
            style={{ background: smartGradient(kind) }}
          >
            <Icon className="w-7 h-7 text-white" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-serif tracking-tight truncate">
              {meta?.name}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              {computed.length}{" "}
              {computed.length === 1 ? "track" : "tracks"}
              {totalSec > 0 ? ` • ${formatLongDuration(totalSec)}` : ""}
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button
                size="sm"
                onClick={onPlayAll}
                disabled={computed.length === 0}
                className="gap-1.5 h-7"
                data-testid="button-play-smart"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play
              </Button>
            </div>
          </div>
        </div>

        {computed.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search in this playlist"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-smart-search"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
        {computed.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="text-sm text-muted-foreground">
              {emptyMessage(kind)}
            </div>
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
              const fromIdx = displayTracks.findIndex((t) => t.id === draggedId);
              const toIdx = dragOverIndex;
              if (fromIdx === -1 || fromIdx === toIdx || fromIdx === toIdx - 1) {
                setDraggedId(null);
                setDragOverIndex(null);
                return;
              }
              const newIds = displayTracks.map((t) => t.id);
              newIds.splice(fromIdx, 1);
              newIds.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, draggedId);
              setOrderedIds(newIds);
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
                const liked = t.liked ?? false;
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
                        playFromList(
                          displayTracks.map((tr) => tr.id),
                          i,
                          meta?.name ?? "Smart Playlist",
                          null,
                          "smart",
                        );
                      }}
                      data-testid={`smart-track-${t.id}`}
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
                      <div className="text-[11px] text-muted-foreground tabular-nums w-5 text-right shrink-0">
                        {i + 1}
                      </div>
                      <div className="relative shrink-0">
                        <AlbumCover
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
                      {kind === "most-played" && (
                        <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">
                          {t.playCount}{" "}
                          {t.playCount === 1 ? "play" : "plays"}
                        </span>
                      )}
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
                          liked
                            ? "text-red-500 opacity-100"
                            : "text-muted-foreground hover:text-red-400",
                        )}
                        aria-label={liked ? "Unlike" : "Like"}
                      >
                        <Heart
                          className={cn("w-3.5 h-3.5", animatingLikeIds.has(t.id) && "heart-beat")}
                          fill={liked ? "currentColor" : "none"}
                        />
                      </Button>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(t.duration)}
                      </span>
                      {/* Drag handle — right side, pointer events for touch + mouse */}
                      <button
                        type="button"
                        aria-label="Drag to reorder"
                        style={{ touchAction: 'none' }}
                        className="shrink-0 flex items-center justify-center w-7 h-8 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
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
                            const from = displayTracks.findIndex((tr) => tr.id === dId);
                            if (from !== -1 && from !== dIdx && from !== dIdx - 1) {
                              const newIds = displayTracks.map((tr) => tr.id);
                              newIds.splice(from, 1);
                              newIds.splice(dIdx > from ? dIdx - 1 : dIdx, 0, dId);
                              setOrderedIds(newIds);
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
                      <ContextMenuContent className="w-52">
                        <ContextMenuItem
                          onClick={() =>
                            playFromList(
                              displayTracks.map((tr) => tr.id),
                              i,
                              meta?.name ?? "Smart Playlist",
                              null,
                              "smart",
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
            {computed.length > 0 && filtered.length === 0 && (
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
            tracks={computed}
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
    </div>
  );
}
