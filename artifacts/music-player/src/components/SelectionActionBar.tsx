import { useState } from "react";
import { Heart, ListMusic, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlayer } from "@/lib/player-context";
import { currentPlatform } from "@/lib/platform-api";
import type { Playlist, Track } from "@/lib/types";

interface Props {
  selectedIds: Set<string>;
  tracks: Track[];
  playlists: Playlist[];
  onClear: () => void;
  onBulkTagEdit: () => void;
}

export function SelectionActionBar({
  selectedIds,
  tracks,
  playlists,
  onClear,
  onBulkTagEdit,
}: Props) {
  const { toggleLike, addTracksToPlaylist, deleteTrackWithFile, miniMode } = usePlayer();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);

  const count = selectedIds.size;
  const ids = [...selectedIds];

  const selected = tracks.filter((t) => selectedIds.has(t.id));
  const likedCount = selected.filter((t) => t.liked).length;
  const majorityLiked = likedCount >= selected.length / 2 && selected.length > 0;

  const handleLikeUnlike = async () => {
    const targetState = likedCount < selected.length / 2;
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 300);
    for (const t of selected) {
      if (!!t.liked !== targetState) await toggleLike(t.id);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    await addTracksToPlaylist(playlistId, ids);
    setPlaylistOpen(false);
    onClear();
  };

  const handleDeleteConfirmed = async () => {
    for (const id of ids) {
      await deleteTrackWithFile(id);
    }
    onClear();
  };

  // On Android in mini-mode the MiniPlayer card sits 104 px from the bottom.
  // Add 112 px of bottom padding so the action bar clears it.
  const androidMiniPad = currentPlatform === "android" && miniMode;

  return (
    <>
      <div style={androidMiniPad ? { paddingBottom: "160px" } : undefined}>
      <div className="shrink-0 border-t border-card-border bg-card/95 backdrop-blur-sm px-3 py-2 flex items-center gap-1">
        <span className="text-xs font-semibold text-foreground flex-1 truncate">
          {count} {count === 1 ? "track" : "tracks"} selected
        </span>

        {/* Like / Unlike */}
        <Button
          size="icon"
          variant="ghost"
          className={cn("h-7 w-7 shrink-0 transition-colors duration-200",
            majorityLiked ? "text-red-500 hover:text-red-400" : "text-muted-foreground hover:text-red-400"
          )}
          title="Like / Unlike all"
          onClick={handleLikeUnlike}
        >
          <Heart
            className={cn("w-3.5 h-3.5", likeAnimating && "heart-beat")}
            fill={majorityLiked ? "currentColor" : "none"}
          />
        </Button>

        {/* Add to Playlist */}
        <Popover open={playlistOpen} onOpenChange={setPlaylistOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              title="Add to playlist"
            >
              <ListMusic className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="end" side="top">
            {playlists.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">No playlists yet</p>
            ) : (
              playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAddToPlaylist(p.id)}
                  className="w-full text-left text-xs px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  {p.name}
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>

        {/* Bulk Tag Edit */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          title="Bulk edit tags"
          onClick={onBulkTagEdit}
        >
          <Tags className="w-3.5 h-3.5" />
        </Button>

        {/* Delete */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
          title="Delete selected"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        {/* Clear selection */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          title="Clear selection"
          onClick={onClear}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} {count === 1 ? "track" : "tracks"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {count === 1 ? "this file" : "these files"} from
              your library and disk. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirmed}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
