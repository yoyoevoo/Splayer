import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import { AlbumCover } from "./AlbumCover";
import { EditTrackDialog } from "./EditTrackDialog";
import { Visualizer } from "./Visualizer";

export function NowPlaying() {
  const { currentTrack, setCustomCover } = usePlayer();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (!currentTrack) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-12">
        <div className="space-y-3 max-w-md">
          <h2 className="text-2xl font-serif text-foreground/80">
            Pick a track to begin
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose something from the playlist on the right, or press play to
            start with the first song.
          </p>
        </div>
      </div>
    );
  }

  const cover = trackCoverUrl(currentTrack);

  const onPickCover = () => coverInputRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setCustomCover(currentTrack.id, file);
    e.target.value = "";
  };

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center px-8 py-12">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentTrack.id + "-bg"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0 -z-10"
        >
          {cover ? (
            <>
              <img
                src={cover}
                alt=""
                className="w-full h-full object-cover scale-125 blur-3xl opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
            </>
          ) : (
            <div
              className="w-full h-full"
              style={{
                background:
                  "radial-gradient(circle at 50% 30%, hsl(var(--primary) / 0.15), transparent 60%)",
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentTrack.id}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-8 max-w-md w-full"
        >
          <div className="relative w-full max-w-sm group">
            {/* Visualizer canvas sits behind album art */}
            <Visualizer />
            {/* z-index: 2 so album art sits above the visualizer canvas (z:1) */}
            <div className="relative" style={{ zIndex: 2 }}>
              <AlbumCover
                src={cover}
                seed={currentTrack.title + currentTrack.artist}
                size="xl"
                className="rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
              />
            </div>
            <button
              onClick={onPickCover}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid="button-change-cover"
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur text-white text-sm">
                <ImagePlus className="w-4 h-4" />
                Change cover
              </div>
            </button>
          </div>

          <div className="text-center space-y-2 w-full">
            <h1 className="text-3xl font-serif tracking-tight text-foreground line-clamp-2">
              {currentTrack.title}
            </h1>
            <p className="text-base text-muted-foreground">
              {currentTrack.artist}
            </p>
            <p className="text-sm text-muted-foreground/70">
              {currentTrack.album}
              {currentTrack.year ? ` · ${currentTrack.year}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-edit-track"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit details
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onCoverChange}
      />
      <EditTrackDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        track={currentTrack}
      />
    </div>
  );
}
