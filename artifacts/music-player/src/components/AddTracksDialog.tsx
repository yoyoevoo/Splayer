import { useEffect, useMemo, useState } from "react";
import { Check, CheckSquare, Search, Square } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import type { Playlist } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";

interface AddTracksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist: Playlist;
}

export function AddTracksDialog({
  open,
  onOpenChange,
  playlist,
}: AddTracksDialogProps) {
  const { tracks, addTracksToPlaylist } = usePlayer();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setQuery("");
    }
  }, [open]);

  const inPlaylist = useMemo(
    () => new Set(playlist.trackIds),
    [playlist.trackIds],
  );

  const candidates = useMemo(
    () => tracks.filter((t) => !inPlaylist.has(t.id)),
    [tracks, inPlaylist],
  );

  const filtered = useMemo(() => {
    if (!query) return candidates;
    const q = query.toLowerCase();
    return candidates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onAdd = async () => {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    await addTracksToPlaylist(playlist.id, Array.from(selected));
    onOpenChange(false);
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const t of filtered) next.delete(t.id);
      } else {
        for (const t of filtered) next.add(t.id);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add tracks to "{playlist.name}"</DialogTitle>
          <DialogDescription>
            Tap each song to select it, then add them all at once.
            Already-added tracks are hidden.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search your library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
            autoFocus
            data-testid="input-add-track-search"
          />
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={toggleAllFiltered}
              className="gap-1.5 h-7 text-xs"
              data-testid="button-toggle-select-all"
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} selected`
                : `${filtered.length} available`}
            </span>
          </div>
        )}

        <ScrollArea className="h-72 rounded-md border border-card-border">
          {candidates.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Every track in your library is already in this playlist.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No matches
            </div>
          ) : (
            <ul className="p-2 space-y-1">
              {filtered.map((t) => {
                const checked = selected.has(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-3 p-2 rounded-md hover-elevate active-elevate-2",
                        checked && "bg-accent",
                      )}
                      data-testid={`add-candidate-${t.id}`}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                          checked
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {checked && (
                          <Check className="w-3.5 h-3.5 text-primary-foreground" />
                        )}
                      </div>
                      <AlbumCover
                        src={trackCoverUrl(t)}
                        seed={t.title + t.artist}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.artist}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(t.duration)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-add-tracks"
          >
            Cancel
          </Button>
          <Button
            onClick={onAdd}
            disabled={selected.size === 0}
            data-testid="button-confirm-add-tracks"
          >
            {selected.size > 0
              ? `Add ${selected.size} ${selected.size === 1 ? "track" : "tracks"}`
              : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
