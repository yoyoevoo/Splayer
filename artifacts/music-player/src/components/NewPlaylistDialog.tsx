import { useEffect, useState } from "react";
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

interface NewPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function NewPlaylistDialog({
  open,
  onOpenChange,
  onCreated,
}: NewPlaylistDialogProps) {
  const { createPlaylist } = usePlayer();
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = await createPlaylist(trimmed);
    onCreated?.(created.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New playlist</DialogTitle>
          <DialogDescription>
            Give your playlist a name. You can add tracks and set a cover
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-playlist-name">Name</Label>
          <Input
            id="new-playlist-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            placeholder="e.g. Late night, gym, road trip…"
            data-testid="input-new-playlist-name"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-new-playlist"
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!name.trim()}
            data-testid="button-create-playlist"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
