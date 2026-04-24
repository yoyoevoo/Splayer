import { Music, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef } from "react";
import { usePlayer } from "@/lib/player-context";
import { motion } from "framer-motion";

export function EmptyState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addFiles } = usePlayer();

  const onPick = () => fileInputRef.current?.click();
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = "";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="h-full w-full flex items-center justify-center px-8"
    >
      <div className="max-w-xl text-center flex flex-col items-center gap-6">
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-12 rounded-full blur-3xl opacity-40"
            style={{
              background:
                "radial-gradient(circle, hsl(var(--primary) / 0.5), transparent 70%)",
            }}
          />
          <div className="relative w-24 h-24 rounded-2xl flex items-center justify-center bg-card border border-card-border shadow-2xl">
            <Music className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-serif tracking-tight text-foreground">
            Your listening room is quiet
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Add some music from your computer to get started. Drag audio files
            anywhere on this window, or pick them with the button below. Your
            files stay on your machine — nothing is uploaded.
          </p>
        </div>
        <Button onClick={onPick} size="lg" className="gap-2 px-6">
          <Upload className="w-4 h-4" />
          Add Music
        </Button>
        <p className="text-xs text-muted-foreground/70">
          Supports MP3, FLAC, WAV, OGG, M4A
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={onChange}
        />
      </div>
    </motion.div>
  );
}
