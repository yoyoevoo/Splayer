/**
 * SetArtworkDialog — per-track artwork picker.
 *
 * Two paths:
 *   1. Upload Image  → local file picker → preview → Apply
 *   2. Fetch from Web → MusicBrainz / iTunes search → preview → Apply
 *
 * On Apply: calls setCustomCover, which updates IDB + state everywhere
 * (library thumb, main player, mini player) instantly.
 */
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  Globe,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { fetchAlbumArt } from "@/lib/artFetcher";
import type { Track } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SetArtworkDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  track: Track;
}

type Mode = "choose" | "fetching" | "preview" | "not-found";

export function SetArtworkDialog({
  open,
  onOpenChange,
  track,
}: SetArtworkDialogProps) {
  const { setCustomCover } = usePlayer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode,        setMode]        = useState<Mode>("choose");
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [source,      setSource]      = useState<string>("");
  const [applying,    setApplying]    = useState(false);

  // ── helpers ──────────────────────────────────────────────────────────────
  const revokePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  const reset = () => {
    revokePreview();
    setMode("choose");
    setPreviewUrl(null);
    setPreviewBlob(null);
    setSource("");
    setApplying(false);
  };

  const showPreview = (blob: Blob, src: string) => {
    revokePreview();
    setPreviewUrl(URL.createObjectURL(blob));
    setPreviewBlob(blob);
    setSource(src);
    setMode("preview");
  };

  // ── Upload flow ───────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    showPreview(file, "Local file");
  };

  // ── Fetch flow ────────────────────────────────────────────────────────────
  const handleFetch = async () => {
    setMode("fetching");
    const art = await fetchAlbumArt(track.artist, track.album);
    if (!art) {
      setMode("not-found");
      return;
    }
    showPreview(art.blob, art.source === "musicbrainz" ? "MusicBrainz" : "iTunes");
    // art.url was already created inside fetchAlbumArt; we've recreated via showPreview
    URL.revokeObjectURL(art.url);
  };

  // ── Apply ─────────────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!previewBlob) return;
    setApplying(true);
    const file = new File(
      [previewBlob],
      "cover.jpg",
      { type: previewBlob.type || "image/jpeg" },
    );
    await setCustomCover(track.id, file);
    revokePreview();
    onOpenChange(false);
    // reset after a tick so the dialog close animation doesn't flash
    setTimeout(reset, 300);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xs w-full gap-4">
        <DialogHeader className="gap-0.5">
          <DialogTitle className="text-base">Set Artwork</DialogTitle>
          <p className="text-xs text-muted-foreground truncate">
            {track.title}
            {track.artist ? ` · ${track.artist}` : ""}
          </p>
        </DialogHeader>

        {/* ── CHOOSE ─────────────────────────────────────────────────────── */}
        {mode === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <OptionCard
              icon={<Upload className="w-5 h-5" />}
              label="Upload Image"
              sub="JPG · PNG · WEBP"
              onClick={() => fileInputRef.current?.click()}
            />
            <OptionCard
              icon={<Globe className="w-5 h-5" />}
              label="Fetch from Web"
              sub="MusicBrainz · iTunes"
              onClick={handleFetch}
            />
          </div>
        )}

        {/* ── FETCHING ───────────────────────────────────────────────────── */}
        {mode === "fetching" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Searching for artwork…</p>
          </div>
        )}

        {/* ── NOT FOUND ──────────────────────────────────────────────────── */}
        {mode === "not-found" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <div>
              <p className="text-sm font-medium">No artwork found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Try uploading manually
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Go back
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                Upload image
              </Button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ────────────────────────────────────────────────────── */}
        {mode === "preview" && previewUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-44 h-44 rounded-2xl object-cover shadow-lg border border-border/40"
              />
              <span className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                {source}
              </span>
            </div>

            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={reset}
                disabled={applying}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Apply
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── OptionCard ─────────────────────────────────────────────────────────────

function OptionCard({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-3 p-5 rounded-xl text-center",
        "border border-border transition-all duration-150",
        "hover:border-primary/60 hover:bg-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        "group",
      )}
    >
      <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
      </div>
    </button>
  );
}
