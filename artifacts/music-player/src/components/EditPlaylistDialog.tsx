import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlayer } from "@/lib/player-context";
import { MosaicCover } from "./MosaicCover";
import { trackCoverUrl } from "@/lib/types";
import type { Playlist } from "@/lib/types";

interface EditPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist: Playlist;
}

export function EditPlaylistDialog({
  open,
  onOpenChange,
  playlist,
}: EditPlaylistDialogProps) {
  const { tracks, renamePlaylist, setPlaylistCover, clearPlaylistCover } =
    usePlayer();
  const [name, setName] = useState(playlist.name);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setName(playlist.name);
  }, [open, playlist.name]);

  const trackCovers = playlist.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => trackCoverUrl(t));

  const onPickCover = () => fileRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setPlaylistCover(playlist.id, file);
    e.target.value = "";
  };

  const onSave = async () => {
    if (name.trim() && name.trim() !== playlist.name) {
      await renamePlaylist(playlist.id, name.trim());
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit playlist</DialogTitle>
          <DialogDescription>
            Change the name or cover image for this playlist.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 items-start">
          <div className="flex flex-col items-center gap-2">
            <MosaicCover
              customCoverUrl={playlist.customCoverUrl}
              trackCovers={trackCovers}
              seed={playlist.id + playlist.name}
              size="lg"
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={onPickCover}
                className="gap-1.5"
                data-testid="button-edit-playlist-cover"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Cover
              </Button>
              {playlist.customCoverUrl && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => clearPlaylistCover(playlist.id)}
                  data-testid="button-clear-playlist-cover"
                  aria-label="Clear cover"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="playlist-name">Name</Label>
              <Input
                id="playlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave();
                }}
                data-testid="input-playlist-name"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {playlist.trackIds.length}{" "}
              {playlist.trackIds.length === 1 ? "track" : "tracks"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-playlist-edit"
          >
            Cancel
          </Button>
          <Button onClick={onSave} data-testid="button-save-playlist">
            Save
          </Button>
        </DialogFooter>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onCoverChange}
        />
      </DialogContent>
    </Dialog>
  );
}
