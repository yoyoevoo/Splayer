import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  ImageOff,
  Images,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { fetchAlbumArt } from "@/lib/artFetcher";
import { trackCoverUrl } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/types";

interface ArtworkFetcherProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type FetchPhase = "idle" | "fetching" | "done";

interface ResultItem {
  track: Track;
  status: "pending" | "found" | "notfound";
  previewUrl?: string; // object URL — must be revoked
  blob?: Blob;
  kept?: boolean; // true=approve, false=reject, undefined=undecided
}

export function ArtworkFetcher({ open, onOpenChange }: ArtworkFetcherProps) {
  const { tracks, setCustomCover } = usePlayer();

  // tracks that have no album art at all
  const missing = tracks.filter((t) => !trackCoverUrl(t));

  const [phase, setPhase] = useState<FetchPhase>("idle");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ ok: number; skip: number } | null>(null);

  const cancelRef = useRef(false);

  // ── reset on open/close ──────────────────────────────────────────────────
  const reset = useCallback(() => {
    cancelRef.current = true;
    setPhase("idle");
    setResults((prev) => {
      // revoke object URLs
      prev.forEach((r) => r.previewUrl && URL.revokeObjectURL(r.previewUrl));
      return [];
    });
    setCurrentIdx(0);
    setApplying(false);
    setApplied(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // ── start fetching ───────────────────────────────────────────────────────
  const startFetch = useCallback(async () => {
    if (missing.length === 0) return;
    cancelRef.current = false;

    // initialise result list
    const initial: ResultItem[] = missing.map((t) => ({
      track: t,
      status: "pending",
    }));
    setResults(initial);
    setPhase("fetching");
    setCurrentIdx(0);

    for (let i = 0; i < missing.length; i++) {
      if (cancelRef.current) break;
      setCurrentIdx(i);

      const t = missing[i];
      const art = await fetchAlbumArt(t.artist, t.album);

      setResults((prev) => {
        const next = [...prev];
        next[i] = art
          ? {
              track: t,
              status: "found",
              previewUrl: art.url,
              blob: art.blob,
              kept: undefined, // awaiting user decision
            }
          : { track: t, status: "notfound" };
        return next;
      });
    }

    setPhase("done");
  }, [missing]);

  // ── decide on a result ───────────────────────────────────────────────────
  const decide = (i: number, keep: boolean) => {
    setResults((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], kept: keep };
      return next;
    });
  };

  const approveAll = () =>
    setResults((prev) =>
      prev.map((r) =>
        r.status === "found" ? { ...r, kept: true } : r,
      ),
    );

  const rejectAll = () =>
    setResults((prev) =>
      prev.map((r) =>
        r.status === "found" ? { ...r, kept: false } : r,
      ),
    );

  // ── apply kept covers ────────────────────────────────────────────────────
  const applyKept = async () => {
    setApplying(true);
    let ok = 0;
    let skip = 0;
    for (const r of results) {
      if (r.kept === true && r.blob) {
        const file = new File([r.blob], "cover.jpg", {
          type: r.blob.type || "image/jpeg",
        });
        await setCustomCover(r.track.id, file);
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
        ok++;
      } else {
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
        skip++;
      }
    }
    setApplied({ ok, skip });
    setResults([]);
    setApplying(false);
  };

  // ── derived numbers ──────────────────────────────────────────────────────
  const totalMissing = missing.length;
  const foundCount = results.filter((r) => r.status === "found").length;
  const keptCount  = results.filter((r) => r.kept === true).length;
  const decidedCount = results.filter((r) => r.kept !== undefined).length;
  const progress =
    phase === "fetching" && totalMissing > 0
      ? Math.round(((currentIdx) / totalMissing) * 100)
      : phase === "done"
      ? 100
      : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Images className="w-4 h-4 text-primary" />
            Fetch Missing Artwork
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col" style={{ maxHeight: "80vh" }}>

          {/* ── IDLE ─────────────────────────────────────────────────────── */}
          {phase === "idle" && (
            <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
              {totalMissing === 0 ? (
                <>
                  <Check className="w-10 h-10 text-emerald-400" />
                  <p className="text-sm font-medium">All songs already have artwork!</p>
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Sparkles className="w-10 h-10 text-primary/70" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {totalMissing} song{totalMissing === 1 ? "" : "s"} without artwork
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Artwork is fetched from MusicBrainz Cover Art Archive and
                      iTunes. You can approve or reject each result before saving.
                    </p>
                  </div>
                  <Button onClick={startFetch} className="gap-2 mt-2">
                    <Images className="w-4 h-4" />
                    Start Fetching
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── FETCHING / DONE ───────────────────────────────────────────── */}
          {(phase === "fetching" || phase === "done") && (
            <>
              {/* Progress bar */}
              <div className="px-6 py-3 border-b border-border space-y-2 bg-muted/10">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {phase === "fetching" ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Searching for artwork… ({currentIdx + 1}/{totalMissing})
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-medium">
                      Done — found {foundCount} of {totalMissing}
                    </span>
                  )}
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>

              {/* Results scroll area */}
              <ScrollArea className="flex-1 overflow-auto" style={{ maxHeight: "calc(80vh - 200px)" }}>
                {results.length === 0 ? (
                  <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting…
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {results.map((r, i) => (
                      <ResultRow
                        key={r.track.id}
                        result={r}
                        isCurrent={phase === "fetching" && i === currentIdx}
                        onKeep={() => decide(i, true)}
                        onSkip={() => decide(i, false)}
                      />
                    ))}
                  </ul>
                )}
              </ScrollArea>

              {/* Footer controls */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 bg-muted/10">
                {phase === "done" && foundCount > 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={approveAll} className="text-xs">
                      Keep all ({foundCount})
                    </Button>
                    <Button size="sm" variant="ghost" onClick={rejectAll} className="text-xs text-muted-foreground">
                      Skip all
                    </Button>
                  </div>
                )}
                {phase === "fetching" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground text-xs"
                    onClick={() => { cancelRef.current = true; }}
                  >
                    Cancel
                  </Button>
                )}
                {phase === "done" && (
                  <div className="flex gap-2 ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                      Discard all
                    </Button>
                    <Button
                      size="sm"
                      disabled={keptCount === 0 || applying}
                      onClick={applyKept}
                      className="min-w-32"
                    >
                      {applying ? (
                        <><Loader2 className="w-3 h-3 animate-spin mr-1.5" /> Saving…</>
                      ) : (
                        `Save ${keptCount} cover${keptCount === 1 ? "" : "s"}`
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── APPLIED ──────────────────────────────────────────────────── */}
          {applied && (
            <div className="flex flex-col items-center gap-4 py-14 px-6 text-center">
              <Check className="w-10 h-10 text-emerald-400" />
              <div>
                <p className="text-sm font-medium">{applied.ok} cover{applied.ok === 1 ? "" : "s"} saved!</p>
                {applied.skip > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {applied.skip} skipped
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ResultRow ──────────────────────────────────────────────────────────────

function ResultRow({
  result,
  isCurrent,
  onKeep,
  onSkip,
}: {
  result: ResultItem;
  isCurrent: boolean;
  onKeep: () => void;
  onSkip: () => void;
}) {
  const { track, status, previewUrl, kept } = result;

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-5 py-3 transition-colors",
        isCurrent && "bg-primary/5",
        kept === true && "bg-emerald-500/5",
        kept === false && "bg-muted/30 opacity-50",
      )}
    >
      {/* Art thumbnail */}
      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 bg-muted flex items-center justify-center">
        {status === "found" && previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
        ) : status === "notfound" ? (
          <ImageOff className="w-5 h-5 text-muted-foreground/40" />
        ) : (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Track info */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{track.title}</div>
        <div className="text-xs text-muted-foreground truncate">
          {track.artist}
          {track.album && track.album !== "Unknown Album" ? ` · ${track.album}` : ""}
        </div>
        {status === "notfound" && (
          <div className="text-[11px] text-muted-foreground/60 mt-0.5">No artwork found</div>
        )}
      </div>

      {/* Actions */}
      {status === "found" && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="icon"
            variant={kept === true ? "default" : "ghost"}
            className={cn(
              "h-8 w-8",
              kept === true ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "text-muted-foreground hover:text-emerald-400",
            )}
            onClick={onKeep}
            title="Keep this artwork"
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant={kept === false ? "destructive" : "ghost"}
            className={cn("h-8 w-8", kept !== false && "text-muted-foreground hover:text-destructive")}
            onClick={onSkip}
            title="Skip this artwork"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {status === "pending" && isCurrent && (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
      )}
    </li>
  );
}
