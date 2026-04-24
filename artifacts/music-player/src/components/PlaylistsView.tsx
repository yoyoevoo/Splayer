import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/lib/player-context";
import {
  trackCoverUrl,
  playlistDuration,
} from "@/lib/types";
import type { Playlist } from "@/lib/types";
import { formatLongDuration, formatMonthYear } from "@/lib/format";
import { MosaicCover } from "./MosaicCover";
import { NewPlaylistDialog } from "./NewPlaylistDialog";
import { EditPlaylistDialog } from "./EditPlaylistDialog";

interface PlaylistsViewProps {
  onOpenPlaylist: (playlist: Playlist) => void;
}

export function PlaylistsView({ onOpenPlaylist }: PlaylistsViewProps) {
  const { tracks, playlists, deletePlaylist } = usePlayer();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Playlist | null>(null);

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

      <ScrollArea className="flex-1">
        {playlists.length === 0 ? (
          <div className="px-4 py-12 text-center">
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
          <ul className="p-2 space-y-1">
            <AnimatePresence initial={false}>
              {playlists.map((p, idx) => {
                const trackCovers = p.trackIds
                  .map((id) => tracks.find((t) => t.id === id))
                  .filter(
                    (t): t is NonNullable<typeof t> => Boolean(t),
                  )
                  .map((t) => trackCoverUrl(t));
                const totalSec = playlistDuration(p, tracks);
                return (
                  <motion.li
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                  >
                    <div
                      className="group relative flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => onOpenPlaylist(p)}
                      data-testid={`playlist-${p.id}`}
                    >
                      <MosaicCover
                        customCoverUrl={p.customCoverUrl}
                        trackCovers={trackCovers}
                        seed={p.id + p.name}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {p.trackIds.length}{" "}
                          {p.trackIds.length === 1 ? "Track" : "Tracks"}
                          {p.createdAt
                            ? ` • ${formatMonthYear(p.createdAt)}`
                            : ""}
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
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(p);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(p);
                            }}
                          >
                            <ImagePlus className="w-4 h-4 mr-2" />
                            Change cover
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                confirm(
                                  `Delete playlist "${p.name}"? Your music files stay safe.`,
                                )
                              ) {
                                deletePlaylist(p.id);
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
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </ScrollArea>

      <NewPlaylistDialog open={creating} onOpenChange={setCreating} />
      {editing && (
        <EditPlaylistDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          playlist={editing}
        />
      )}
    </div>
  );
}
