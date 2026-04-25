import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlbumCover } from "./AlbumCover";
import { usePlayer } from "@/lib/player-context";
import { writeID3ToFile, isMP3 } from "@/lib/id3Writer";
import { trackCoverUrl } from "@/lib/types";
import type { Track } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckSquare2, FolderOutput, HardDrive, Square } from "lucide-react";

interface BulkTagEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type FieldKey = "title" | "artist" | "album" | "year" | "genre";

const FIELDS: { key: FieldKey; label: string; placeholder: string }[] = [
  { key: "title",  label: "Title",  placeholder: "New title…"  },
  { key: "artist", label: "Artist", placeholder: "New artist…" },
  { key: "album",  label: "Album",  placeholder: "New album…"  },
  { key: "year",   label: "Year",   placeholder: "e.g. 2024"   },
  { key: "genre",  label: "Genre",  placeholder: "e.g. Pop"    },
];

type SavePhase = "idle" | "saving" | "done";

export function BulkTagEditor({ open, onOpenChange }: BulkTagEditorProps) {
  const { tracks, updateTrackInfo } = usePlayer();

  // ── selection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleTrack = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected  = tracks.length > 0 && selectedIds.size === tracks.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () =>
    setSelectedIds(
      allSelected ? new Set() : new Set(tracks.map((t) => t.id)),
    );

  // ── field values & enabled ────────────────────────────────────────────────
  const [values,  setValues]  = useState<Record<FieldKey, string>>({
    title: "", artist: "", album: "", year: "", genre: "",
  });
  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    title: false, artist: false, album: false, year: false, genre: false,
  });

  const setVal = (k: FieldKey, v: string) =>
    setValues((p) => ({ ...p, [k]: v }));
  const setEn  = (k: FieldKey, v: boolean) =>
    setEnabled((p) => ({ ...p, [k]: v }));

  // ── write-to-files toggle ─────────────────────────────────────────────────
  const [writeFiles,  setWriteFiles]  = useState(false);
  const hasElectron = typeof window !== "undefined" && !!window.electronAPI;

  // ── save state ────────────────────────────────────────────────────────────
  const [phase,    setPhase]    = useState<SavePhase>("idle");
  const [progress, setProgress] = useState(0);
  const [result,   setResult]   = useState<{
    saved: number; written: number; failed: number; errors: string[];
  } | null>(null);

  const canApply =
    selectedIds.size > 0 &&
    Object.values(enabled).some(Boolean) &&
    phase !== "saving";

  // ── apply handler ─────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!canApply) return;

    let outputFolder: string | null = null;
    if (writeFiles && hasElectron) {
      outputFolder = await window.electronAPI!.showFolderDialog();
      if (!outputFolder) return; // user cancelled picker
    }

    setPhase("saving");
    setProgress(0);

    const selected = tracks.filter((t) => selectedIds.has(t.id));
    const res = { saved: 0, written: 0, failed: 0, errors: [] as string[] };

    // Build the partial info to apply (only checked fields)
    const info = Object.fromEntries(
      FIELDS.filter((f) => enabled[f.key]).map((f) => [f.key, values[f.key]]),
    ) as Partial<Record<FieldKey, string>>;

    for (let i = 0; i < selected.length; i++) {
      const track = selected[i];
      try {
        await updateTrackInfo(track.id, info);
        res.saved++;

        if (writeFiles && outputFolder && isMP3(track)) {
          const dest = `${outputFolder}/${track.file.name}`;
          const wr   = await writeID3ToFile(track, info, dest);
          if (wr.success) res.written++;
          else res.errors.push(`${track.title}: ${wr.error ?? "write error"}`);
        }
      } catch (err) {
        res.failed++;
        res.errors.push(`${track.title}: ${String(err)}`);
      }
      setProgress(Math.round(((i + 1) / selected.length) * 100));
    }

    setResult(res);
    setPhase("done");
  };

  const reset = () => {
    setPhase("idle");
    setProgress(0);
    setResult(null);
    setSelectedIds(new Set());
    setValues({ title: "", artist: "", album: "", year: "", genre: "" });
    setEnabled({ title: false, artist: false, album: false, year: false, genre: false });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">Bulk Tag Editor</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0" style={{ height: "calc(90vh - 80px)", maxHeight: 600 }}>

          {/* ── LEFT: track list ─────────────────────────────────────────── */}
          <div className="w-56 flex flex-col border-r border-border shrink-0">
            {/* Select-all header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/20">
              <Checkbox
                id="select-all"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
              />
              <label htmlFor="select-all" className="text-xs font-medium cursor-pointer select-none">
                Select all
              </label>
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {selectedIds.size}/{tracks.length}
              </span>
            </div>

            <ScrollArea className="flex-1">
              {tracks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center p-6">
                  No tracks in library
                </p>
              ) : (
                <ul className="p-1.5 space-y-0.5">
                  {tracks.map((t) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      selected={selectedIds.has(t.id)}
                      onToggle={() => toggleTrack(t.id)}
                    />
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* ── RIGHT: edit form ──────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

              {/* Selection summary */}
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 ? (
                  <CheckSquare2 className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-medium">
                  {selectedIds.size === 0
                    ? "No songs selected"
                    : `${selectedIds.size} song${selectedIds.size === 1 ? "" : "s"} selected`}
                </span>
              </div>

              <p className="text-xs text-muted-foreground -mt-2">
                Check a field to apply it. Unchecked fields are left unchanged.
              </p>

              <Separator />

              {/* Fields */}
              <div className="space-y-3">
                {FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      id={`field-${key}`}
                      checked={enabled[key]}
                      onCheckedChange={(c) => setEn(key, !!c)}
                    />
                    <label
                      htmlFor={`field-${key}`}
                      className="text-sm w-14 shrink-0 cursor-pointer select-none text-muted-foreground"
                    >
                      {label}
                    </label>
                    <Input
                      className="flex-1 h-8 text-sm"
                      placeholder={placeholder}
                      value={values[key]}
                      disabled={!enabled[key]}
                      onChange={(e) => {
                        setVal(key, e.target.value);
                        if (!enabled[key]) setEn(key, true);
                      }}
                      onFocus={() => setEn(key, true)}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              {/* Write-to-files toggle */}
              {hasElectron && (
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="write-files"
                    checked={writeFiles}
                    onCheckedChange={(c) => setWriteFiles(!!c)}
                    className="mt-0.5"
                  />
                  <div>
                    <label
                      htmlFor="write-files"
                      className="text-sm font-medium cursor-pointer select-none flex items-center gap-1.5"
                    >
                      <FolderOutput className="w-3.5 h-3.5 text-muted-foreground" />
                      Also write ID3 tags to files
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Saves modified MP3 files to a folder you choose.
                      Non-MP3 formats are metadata-only.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Bottom: progress + button ─────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-border space-y-3 bg-muted/10">
              {phase === "saving" && (
                <div className="space-y-1.5">
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground text-right tabular-nums">
                    {progress}%
                  </p>
                </div>
              )}

              {phase === "done" && result && (
                <div className="flex items-center gap-2 text-xs">
                  <HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-emerald-400 font-medium">
                    {result.saved} updated
                  </span>
                  {result.written > 0 && (
                    <span className="text-muted-foreground">
                      · {result.written} written to disk
                    </span>
                  )}
                  {result.failed > 0 && (
                    <span className="text-destructive">
                      · {result.failed} failed
                    </span>
                  )}
                  {result.errors.length > 0 && (
                    <span
                      title={result.errors.join("\n")}
                      className="underline decoration-dotted cursor-help text-muted-foreground"
                    >
                      (details)
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                {phase === "done" && (
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Edit more
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={!canApply}
                  className="min-w-36"
                >
                  {phase === "saving"
                    ? "Saving…"
                    : phase === "done"
                    ? "Done"
                    : `Apply to ${selectedIds.size || "Selected"} Song${selectedIds.size === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrackRow({
  track,
  selected,
  onToggle,
}: {
  track: Track;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors",
        selected ? "bg-accent" : "hover:bg-muted/40",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      <AlbumCover
        src={trackCoverUrl(track)}
        seed={track.title + track.artist}
        size="sm"
        className="shrink-0 !w-8 !h-8"
      />
      <div className="min-w-0">
        <div className="text-xs font-medium truncate leading-tight">{track.title}</div>
        <div className="text-[10px] text-muted-foreground truncate leading-tight">
          {track.artist}
        </div>
      </div>
    </li>
  );
}
