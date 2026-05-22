import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Clock,
  Download,
  FolderX,
  GitMerge,
  GripVertical,
  Heart,
  History,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { usePlayer } from "@/lib/player-context";
import { exportPlaylistAsM3U } from "@/lib/export-playlist";
import {
  trackCoverUrl,
  playlistDuration,
  smartPlaylistTracks,
  SMART_PLAYLISTS,
} from "@/lib/types";
import type { Playlist, SmartPlaylistKind } from "@/lib/types";
import { formatLongDuration, formatMonthYear } from "@/lib/format";
import { MosaicCover } from "./MosaicCover";
import { NewPlaylistDialog } from "./NewPlaylistDialog";
import { EditPlaylistDialog } from "./EditPlaylistDialog";
import { MergePlaylistDialog } from "./MergePlaylistDialog";

interface PlaylistsViewProps {
  onOpenPlaylist: (playlist: Playlist) => void;
  onOpenSmart: (kind: SmartPlaylistKind) => void;
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

function PlaylistRow({
  p,
  idx,
  tracks,
  onOpen,
  onEdit,
  onDelete,
  onExport,
  onMerge,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  p: Playlist;
  idx: number;
  tracks: ReturnType<typeof usePlayer>["tracks"];
  onOpen: (p: Playlist) => void;
  onEdit: (p: Playlist) => void;
  onDelete: (id: string) => void;
  onExport: (p: Playlist) => void;
  dragging?: boolean;
  dragOver?: boolean;
  onMerge?: (p: Playlist) => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const trackCovers = p.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => trackCoverUrl(t));
  const totalSec = playlistDuration(p, tracks);
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, delay: idx * 0.02 }}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className="group flex items-stretch"
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      {dragOver && <div className="h-0.5 bg-primary rounded-full mb-1" />}

      <ContextMenu>
        <ContextMenuTrigger className="flex items-stretch w-full">
          {/* Grip handle — left gutter, outside the card */}
          {onDragStart ? (
            <div className="flex items-center justify-center w-5 shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60" />
            </div>
          ) : (
            <div className="w-0" />
          )}

          {/* Row card */}
          <div
            className="relative flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate active-elevate-2 flex-1 min-w-0"
            onClick={() => onOpen(p)}
            data-testid={`playlist-${p.id}`}
          >
            <MosaicCover
              customCoverUrl={p.customCoverUrl}
              trackCovers={trackCovers}
              seed={p.id + p.name}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {p.trackIds.length}{" "}
                {p.trackIds.length === 1 ? "Track" : "Tracks"}
                {p.createdAt ? ` • ${formatMonthYear(p.createdAt)}` : ""}
              </div>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatLongDuration(totalSec)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-60 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`playlist-menu-${p.id}`}
                  aria-label="Playlist options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                  <ImagePlus className="w-4 h-4 mr-2" />
                  Change cover
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMerge?.(p); }}>
                  <GitMerge className="w-4 h-4 mr-2" />
                  Merge with another playlist
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport(p); }}>
                  <Download className="w-4 h-4 mr-2" />
                  Export as M3U
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete playlist "${p.name}"? Your music files stay safe.`)) {
                      onDelete(p.id);
                    }
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={() => onOpen(p)}>
            Open playlist
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onMerge?.(p)}>
            <GitMerge className="w-4 h-4 mr-2" />
            Merge with another playlist
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onExport(p)}>
            <Download className="w-4 h-4 mr-2" />
            Export as M3U
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onEdit(p)}>
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onEdit(p)}>
            <ImagePlus className="w-4 h-4 mr-2" />
            Change cover
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (confirm(`Delete playlist "${p.name}"? Your music files stay safe.`)) {
                onDelete(p.id);
              }
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </motion.li>
  );
}

export function PlaylistsView({
  onOpenPlaylist,
  onOpenSmart,
}: PlaylistsViewProps) {
  const { tracks, playlists, deletePlaylist, reorderPlaylists } = usePlayer();
  const handleExport = (p: Playlist) => exportPlaylistAsM3U(p, tracks);
  const [creating, setCreating] = useState(false);
  const [editing,  setEditing]  = useState<Playlist | null>(null);
  const [merging,  setMerging]  = useState<Playlist | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  function handleDragStart(id: string) {
    draggedIdRef.current = id;
    setDraggedId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (draggedIdRef.current !== id) setDragOverId(id);
  }

  function handleDrop(ids: string[]) {
    const fromId = draggedIdRef.current;
    const toId = dragOverId;
    if (!fromId || !toId || fromId === toId) { clearDrag(); return; }
    const fromIdx = ids.indexOf(fromId);
    const toIdx   = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) { clearDrag(); return; }
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    reorderPlaylists(next);
    clearDrag();
  }

  function clearDrag() {
    setDraggedId(null);
    setDragOverId(null);
    draggedIdRef.current = null;
  }

  const gamePlaylistIds = useMemo(() => {
    try {
      const reg = JSON.parse(
        localStorage.getItem("game-playlist-registry") ?? "{}",
      ) as Record<string, string>;
      return new Set(Object.values(reg));
    } catch {
      return new Set<string>();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists]);

  const gamePlaylists = playlists.filter(p => gamePlaylistIds.has(p.id));
  const userPlaylists = playlists.filter(p => !gamePlaylistIds.has(p.id));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 space-y-3 border-b border-card-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-foreground/80 uppercase">
            Playlists
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCreating(true)}
            className="gap-1.5"
            data-testid="button-new-playlist"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
        <div className="p-2 space-y-1">
          <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-medium">
            Smart
          </div>
          {SMART_PLAYLISTS.map((s) => {
            const Icon = smartIcon(s.kind);
            const items = smartPlaylistTracks(s.kind, tracks, playlists);
            return (
              <button
                key={s.kind}
                type="button"
                onClick={() => onOpenSmart(s.kind)}
                className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate active-elevate-2 text-left"
                data-testid={`smart-playlist-${s.kind}`}
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                  style={{ background: smartGradient(s.kind) }}
                >
                  <Icon
                    className="w-5 h-5 text-white"
                    strokeWidth={1.75}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {items.length}{" "}
                    {items.length === 1 ? "track" : "tracks"}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              </button>
            );
          })}
          {gamePlaylists.length > 0 && (
            <div className="px-2 pt-3 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-medium">
              Games
            </div>
          )}
        </div>

        {/* ── Game auto-playlists ── */}
        {gamePlaylists.length > 0 && (
          <ul className="px-2 pb-0 space-y-1">
            <AnimatePresence initial={false}>
              {gamePlaylists.map((p, idx) => (
                <PlaylistRow
                  key={p.id}
                  p={p}
                  idx={idx}
                  tracks={tracks}
                  onOpen={onOpenPlaylist}
                  onEdit={setEditing}
                  onDelete={deletePlaylist}
                  onExport={handleExport}
                  onMerge={setMerging}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="px-2 pt-3 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-medium mx-2">
          Yours
        </div>

        {/* ── User playlists ── */}
        {userPlaylists.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-sm text-muted-foreground mb-4">
              No playlists yet
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreating(true)}
              className="gap-1.5"
              data-testid="button-create-first-playlist"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first playlist
            </Button>
          </div>
        ) : (
          <ul
            className="pr-2 pb-2 pt-0 space-y-1"
            onDrop={() => handleDrop(userPlaylists.map((p) => p.id))}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDrag();
            }}
          >
            <AnimatePresence initial={false}>
              {userPlaylists.map((p, idx) => (
                <PlaylistRow
                  key={p.id}
                  p={p}
                  idx={idx}
                  tracks={tracks}
                  onOpen={onOpenPlaylist}
                  onEdit={setEditing}
                  onDelete={deletePlaylist}
                  onExport={handleExport}
                  onMerge={setMerging}
                  dragging={draggedId === p.id}
                  dragOver={dragOverId === p.id}
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragEnd={clearDrag}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <NewPlaylistDialog open={creating} onOpenChange={setCreating} />
      {editing && (
        <EditPlaylistDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          playlist={editing}
        />
      )}
      {merging && (
        <MergePlaylistDialog
          open={!!merging}
          onOpenChange={(o) => !o && setMerging(null)}
          playlist={merging}
        />
      )}
    </div>
  );
}
