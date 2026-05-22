import { useState, useMemo } from "react";
import { ArrowLeft, GitMerge, ListPlus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/hooks/use-toast";
import { trackCoverUrl } from "@/lib/types";
import type { Playlist } from "@/lib/types";
import { MosaicCover } from "./MosaicCover";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  playlist: Playlist;
}

type Step = "pick" | "action";
type Mode = "new" | "add";

export function MergePlaylistDialog({ open, onOpenChange, playlist }: Props) {
  const { tracks, playlists, createPlaylist, addTracksToPlaylist } = usePlayer();
  const { toast } = useToast();

  const [step,     setStep]     = useState<Step>("pick");
  const [selected, setSelected] = useState<Playlist | null>(null);
  const [mode,     setMode]     = useState<Mode>("new");
  const [newName,  setNewName]  = useState("");
  const [merging,  setMerging]  = useState(false);

  const others = useMemo(
    () => playlists.filter((p) => p.id !== playlist.id),
    [playlists, playlist.id],
  );

  // Tracks that would be added to the current playlist (deduped)
  const toAdd = useMemo(
    () =>
      selected
        ? selected.trackIds.filter((id) => !playlist.trackIds.includes(id))
        : [],
    [selected, playlist.trackIds],
  );

  // Total deduped count for a "new" merge
  const mergedCount = useMemo(
    () => new Set([...playlist.trackIds, ...(selected?.trackIds ?? [])]).size,
    [playlist.trackIds, selected],
  );

  function pickPlaylist(p: Playlist) {
    setSelected(p);
    setNewName(`${playlist.name} + ${p.name}`);
    setMode("new");
    setStep("action");
  }

  async function handleMerge() {
    if (!selected) return;
    setMerging(true);
    try {
      let targetName: string;
      let count: number;

      if (mode === "new") {
        const name = newName.trim() || `${playlist.name} + ${selected.name}`;
        const newPl = await createPlaylist(name);
        // addTracksToPlaylist deduplicates internally
        await addTracksToPlaylist(newPl.id, [
          ...playlist.trackIds,
          ...selected.trackIds,
        ]);
        targetName = name;
        count = mergedCount;
      } else {
        await addTracksToPlaylist(playlist.id, selected.trackIds);
        targetName = playlist.name;
        count = toAdd.length;
      }

      toast({ title: `Merged ${count} track${count !== 1 ? "s" : ""} into "${targetName}"` });
      onOpenChange(false);
    } finally {
      setMerging(false);
    }
  }

  function handleClose(o: boolean) {
    if (!o) {
      // Reset state on close so the dialog is fresh next time
      setStep("pick");
      setSelected(null);
      setMode("new");
      setNewName("");
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-card-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitMerge className="w-4 h-4 text-primary shrink-0" />
            {step === "pick"
              ? `Merge "${playlist.name}"`
              : `Merging with "${selected?.name}"`}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: pick playlist ── */}
        {step === "pick" && (
          <div className="flex flex-col min-h-0">
            <p className="px-5 py-3 text-sm text-muted-foreground">
              Choose a playlist to merge with:
            </p>
            {others.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground italic">
                No other playlists available.
              </p>
            ) : (
              <div className="overflow-y-auto max-h-72 px-2 pb-3 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                {others.map((p) => {
                  const covers = p.trackIds
                    .map((id) => tracks.find((t) => t.id === id))
                    .filter(Boolean)
                    .map((t) => trackCoverUrl(t!));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPlaylist(p)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <MosaicCover
                        customCoverUrl={p.customCoverUrl}
                        trackCovers={covers}
                        seed={p.id + p.name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.trackIds.length}{" "}
                          {p.trackIds.length === 1 ? "track" : "tracks"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: choose merge mode ── */}
        {step === "action" && selected && (
          <div className="px-5 py-4 space-y-4">
            {/* Mode selector */}
            <div className="space-y-2">
              {(
                [
                  {
                    value: "new" as Mode,
                    Icon: Plus,
                    label: "Merge into new playlist",
                    desc: `Creates a new playlist with all tracks from both`,
                  },
                  {
                    value: "add" as Mode,
                    Icon: ListPlus,
                    label: `Add to "${playlist.name}"`,
                    desc: `Adds ${toAdd.length} track${toAdd.length !== 1 ? "s" : ""} from "${selected.name}" into this playlist`,
                  },
                ] as const
              ).map(({ value, Icon, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                    mode === value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40 bg-card",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-colors",
                      mode === value
                        ? "border-primary bg-primary"
                        : "border-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", mode === value ? "text-primary" : "text-foreground")}>
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                  <Icon className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                </button>
              ))}
            </div>

            {/* New playlist name field */}
            {mode === "new" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  New playlist name
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`${playlist.name} + ${selected.name}`}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && !merging) handleMerge(); }}
                />
              </div>
            )}

            {/* Summary */}
            <p className="text-xs text-muted-foreground">
              {mode === "new"
                ? `${mergedCount} track${mergedCount !== 1 ? "s" : ""} total (duplicates removed)`
                : toAdd.length === 0
                  ? "All tracks already in this playlist — nothing to add"
                  : `${toAdd.length} new track${toAdd.length !== 1 ? "s" : ""} will be added (duplicates skipped)`}
            </p>

            {/* Buttons */}
            <div className="flex justify-between items-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("pick")}
                className="gap-1.5 text-muted-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleMerge}
                disabled={merging || (mode === "add" && toAdd.length === 0)}
                className="gap-1.5"
              >
                <GitMerge className="w-3.5 h-3.5" />
                {merging ? "Merging…" : "Merge"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
