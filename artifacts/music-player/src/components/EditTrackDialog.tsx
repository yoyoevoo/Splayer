import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ImagePlus, Trash2 } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import type { Track } from "@/lib/types";
import { trackCoverUrl } from "@/lib/types";
import { AlbumCover } from "./AlbumCover";

interface EditTrackDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  track: Track;
}

export function EditTrackDialog({
  open,
  onOpenChange,
  track,
}: EditTrackDialogProps) {
  const { updateTrackInfo, setCustomCover, clearCustomCover } = usePlayer();
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(track.title);
      setArtist(track.artist);
      setAlbum(track.album);
    }
  }, [open, track]);

  const onSave = async () => {
    await updateTrackInfo(track.id, { title, artist, album });
    onOpenChange(false);
  };

  const onPickCover = () => fileRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setCustomCover(track.id, file);
    e.target.value = "";
  };

  const cover = trackCoverUrl(track);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit track</DialogTitle>
          <DialogDescription>
            Change the title, artist, album, or cover art. Your edits stay on
            this device.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 py-2">
          <div className="space-y-2">
            <AlbumCover
              src={cover}
              seed={track.title + track.artist}
              size="lg"
            />
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={onPickCover}
                className="gap-2"
                data-testid="button-edit-pick-cover"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                New cover
              </Button>
              {track.customCoverUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => clearCustomCover(track.id)}
                  className="gap-2 text-muted-foreground"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="artist">Artist</Label>
              <Input
                id="artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                data-testid="input-edit-artist"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="album">Album</Label>
              <Input
                id="album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                data-testid="input-edit-album"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} data-testid="button-save-track">
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
