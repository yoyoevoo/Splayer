import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  FileMusic,
  FolderOutput,
  Loader2,
  ScanSearch,
  Sparkles,
  Trash2,
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import {
  findDuplicates,
  formatBytes,
  type DuplicateGroup,
} from "@/lib/duplicateFinder";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/types";

interface DuplicateFinderProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Phase = "idle" | "scanning" | "results" | "confirming" | "done";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DuplicateFinder({ open, onOpenChange }: DuplicateFinderProps) {
  const { tracks, removeTrack } = usePlayer();
  const hasElectron = typeof window !== "undefined" && !!window.electronAPI;

  const [phase,   setPhase]   = useState<Phase>("idle");
  const [groups,  setGroups]  = useState<DuplicateGroup[]>([]);
  /** Set of track IDs the user has ticked for removal */
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());
  const [moveToFolder, setMoveToFolder] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [summary, setSummary] = useState<{ count: number; bytes: number } | null>(null);

  // ── reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPhase("idle");
    setGroups([]);
    setToRemove(new Set());
    setMoveToFolder(false);
    setRemoving(false);
    setSummary(null);
  }, []);

  // ── scan ─────────────────────────────────────────────────────────────────
  const startScan = useCallback(async () => {
    setPhase("scanning");
    // yield to let the spinner render
    await new Promise((r) => setTimeout(r, 80));
    const found = findDuplicates(tracks);

    // Auto-select non-keep tracks in each group for removal
    const autoSelect = new Set<string>();
    for (const g of found) {
      g.tracks.forEach((t) => {
        if (t.id !== g.keepId) autoSelect.add(t.id);
      });
    }

    setGroups(found);
    setToRemove(autoSelect);
    setPhase(found.length === 0 ? "done" : "results");
    if (found.length === 0) setSummary({ count: 0, bytes: 0 });
  }, [tracks]);

  // ── checkbox helpers ─────────────────────────────────────────────────────
  const toggleId = (id: string) =>
    setToRemove((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allDupeIds = groups.flatMap((g) =>
    g.tracks.filter((t) => t.id !== g.keepId).map((t) => t.id),
  );

  const selectAll   = () => setToRemove(new Set(allDupeIds));
  const deselectAll = () => setToRemove(new Set());

  const totalToRemoveBytes = tracks
    .filter((t) => toRemove.has(t.id))
    .reduce((sum, t) => sum + t.file.size, 0);

  // ── remove ───────────────────────────────────────────────────────────────
  const doRemove = async () => {
    setRemoving(true);

    let outputFolder: string | null = null;
    if (moveToFolder && hasElectron) {
      outputFolder = await window.electronAPI!.showFolderDialog();
      if (!outputFolder) {
        setRemoving(false);
        setPhase("results");
        return;
      }
    }

    const tracksToRemove = tracks.filter((t) => toRemove.has(t.id));
    let freedBytes = 0;

    for (const t of tracksToRemove) {
      if (outputFolder && hasElectron) {
        // copy file to the chosen folder before removing from library
        try {
          const buf = await t.file.arrayBuffer();
          await window.electronAPI!.writeFile(
            `${outputFolder}/${t.file.name}`,
            new Uint8Array(buf),
          );
        } catch {
          /* best-effort */
        }
      }
      freedBytes += t.file.size;
      removeTrack(t.id);
    }

    setSummary({ count: tracksToRemove.length, bytes: freedBytes });
    setPhase("done");
    setRemoving(false);
  };

  // ── group totals ─────────────────────────────────────────────────────────
  const totalDupeFiles = groups.reduce((s, g) => s + g.tracks.length - 1, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="max-w-3xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ScanSearch className="w-4 h-4 text-primary" />
              Duplicate File Finder
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col" style={{ maxHeight: "80vh" }}>

            {/* ── IDLE ─────────────────────────────────────────────────── */}
            {phase === "idle" && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                <ScanSearch className="w-12 h-12 text-primary/50" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Scan your library for duplicate songs
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Detects duplicates by matching title+artist metadata, and by
                    identical file size with matching duration.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tracks.length} {tracks.length === 1 ? "track" : "tracks"} in library
                </p>
                <Button onClick={startScan} disabled={tracks.length === 0} className="gap-2 mt-1">
                  <ScanSearch className="w-4 h-4" />
                  Scan Library
                </Button>
              </div>
            )}

            {/* ── SCANNING ─────────────────────────────────────────────── */}
            {phase === "scanning" && (
              <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Analysing {tracks.length} tracks…
                </p>
              </div>
            )}

            {/* ── RESULTS ──────────────────────────────────────────────── */}
            {phase === "results" && (
              <>
                {/* Summary bar */}
                <div className="px-6 py-3 border-b border-border bg-muted/10 flex items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{groups.length}</span> duplicate group{groups.length === 1 ? "" : "s"} found
                    {" · "}
                    <span className="font-medium text-foreground">{totalDupeFiles}</span> extra file{totalDupeFiles === 1 ? "" : "s"}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAll}>
                      Select all to remove
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={deselectAll}>
                      Deselect all
                    </Button>
                  </div>
                </div>

                {/* Groups list */}
                <ScrollArea className="flex-1 overflow-auto" style={{ maxHeight: "calc(80vh - 200px)" }}>
                  <div className="divide-y divide-border">
                    {groups.map((g, gi) => (
                      <GroupRow
                        key={g.id}
                        group={g}
                        index={gi + 1}
                        toRemove={toRemove}
                        onToggle={toggleId}
                      />
                    ))}
                  </div>
                </ScrollArea>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border bg-muted/10 space-y-3">
                  {hasElectron && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="move-folder"
                        checked={moveToFolder}
                        onCheckedChange={(c) => setMoveToFolder(!!c)}
                      />
                      <label htmlFor="move-folder" className="text-xs cursor-pointer select-none flex items-center gap-1.5 text-muted-foreground">
                        <FolderOutput className="w-3.5 h-3.5" />
                        Move files to a folder instead of removing permanently
                      </label>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      {toRemove.size > 0 ? (
                        <>
                          <span className="font-medium text-foreground">{toRemove.size}</span> file{toRemove.size === 1 ? "" : "s"} selected
                          {" · "}~{formatBytes(totalToRemoveBytes)} will be freed
                        </>
                      ) : (
                        "No files selected"
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={toRemove.size === 0}
                        onClick={() => setPhase("confirming")}
                        className="gap-1.5 min-w-36"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {moveToFolder ? "Move" : "Remove"} Selected ({toRemove.size})
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── DONE ─────────────────────────────────────────────────── */}
            {phase === "done" && summary && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                <Sparkles className="w-12 h-12 text-primary/60" />
                {summary.count === 0 ? (
                  <>
                    <p className="text-sm font-medium">No duplicates found!</p>
                    <p className="text-xs text-muted-foreground">Your library looks clean.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {summary.count} duplicate{summary.count === 1 ? "" : "s"} removed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~{formatBytes(summary.bytes)} freed
                    </p>
                  </>
                )}
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={reset}>
                    Scan again
                  </Button>
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation AlertDialog ───────────────────────────────────── */}
      <AlertDialog open={phase === "confirming"} onOpenChange={(v) => !v && setPhase("results")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {moveToFolder ? "Move" : "Remove"} {toRemove.size} file{toRemove.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {moveToFolder
                ? `The selected files will be copied to a folder you choose, then removed from your library. This cannot be undone from within the app.`
                : `The selected files will be removed from your library. This cannot be undone.`}
              {" "}~{formatBytes(totalToRemoveBytes)} will be freed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPhase("results")}>
              Go back
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doRemove}
              disabled={removing}
            >
              {removing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Removing…</>
              ) : (
                moveToFolder ? "Move files" : "Yes, remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── GroupRow ───────────────────────────────────────────────────────────────

function GroupRow({
  group,
  index,
  toRemove,
  onToggle,
}: {
  group: DuplicateGroup;
  index: number;
  toRemove: Set<string>;
  onToggle: (id: string) => void;
}) {
  const methodLabel =
    group.method === "metadata" ? "Title + Artist match" : "File size + Duration match";

  return (
    <div>
      {/* Group header */}
      <div className="px-5 py-2 bg-muted/20 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Group {index}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 h-4 rounded-sm font-normal">
          {methodLabel}
        </Badge>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {group.tracks.length} files
        </span>
      </div>

      {/* Track rows */}
      <div className="divide-y divide-border/50">
        {group.tracks.map((t) => {
          const isKeep   = t.id === group.keepId;
          const checked  = toRemove.has(t.id);

          return (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-3 px-5 py-3 transition-colors",
                isKeep   && "bg-emerald-500/5",
                !isKeep && checked && "bg-destructive/5",
              )}
            >
              {/* Checkbox — disabled for the keep track */}
              <div className="pt-0.5 shrink-0">
                {isKeep ? (
                  <div
                    className="w-4 h-4 rounded border border-border flex items-center justify-center bg-muted/30"
                    title="Recommended to keep"
                  >
                    <Check className="w-2.5 h-2.5 text-muted-foreground/40" />
                  </div>
                ) : (
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(t.id)}
                    title="Mark for removal"
                  />
                )}
              </div>

              {/* File icon */}
              <FileMusic className={cn("w-4 h-4 mt-0.5 shrink-0", isKeep ? "text-emerald-400" : "text-muted-foreground/50")} />

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{t.title}</span>
                  {isKeep && (
                    <Badge className="shrink-0 h-4 px-1.5 text-[10px] bg-emerald-600/20 text-emerald-400 border-emerald-600/30 font-normal">
                      Keep
                    </Badge>
                  )}
                  {!isKeep && checked && (
                    <Badge variant="destructive" className="shrink-0 h-4 px-1.5 text-[10px] font-normal opacity-80">
                      Remove
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                <div className="text-[11px] text-muted-foreground/60 truncate font-mono">
                  {t.file.name}
                </div>
              </div>

              {/* Metadata pills */}
              <div className="shrink-0 flex flex-col items-end gap-1 text-[11px] text-muted-foreground text-right">
                <span className="tabular-nums font-medium text-foreground/70">{formatBytes(t.file.size)}</span>
                <span className="tabular-nums">{formatTime(t.duration)}</span>
                <span>{formatDate(t.addedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
