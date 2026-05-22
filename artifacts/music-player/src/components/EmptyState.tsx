import { FolderOpen, Music, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/player-context";
import { currentPlatform } from "@/lib/platform-api";
import { motion } from "framer-motion";

export function EmptyState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { addFiles, isScanning, autoScanLibrary } = usePlayer();

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const onPickFiles = () => fileInputRef.current?.click();
  const onPickFolder = () => folderInputRef.current?.click();
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = "";
  };

  const isAndroid = currentPlatform === "android";

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
            {isScanning && isAndroid ? (
              <RefreshCw className="w-10 h-10 text-primary animate-spin" strokeWidth={1.5} />
            ) : (
              <Music className="w-10 h-10 text-primary" strokeWidth={1.5} />
            )}
          </div>
        </div>
        {isAndroid ? (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl font-serif tracking-tight text-foreground">
                {isScanning ? "Scanning your library…" : "No music found"}
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                {isScanning
                  ? "Looking for audio files on your device. This may take a moment."
                  : "No audio files were found on your device. Make sure your music files have been downloaded and try scanning again."}
              </p>
            </div>
            {!isScanning && (
              <Button
                onClick={() => autoScanLibrary(true)}
                size="lg"
                className="gap-2 px-6"
              >
                <RefreshCw className="w-4 h-4" />
                Scan again
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="text-3xl font-serif tracking-tight text-foreground">
                Your listening room is quiet
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                Add some music from your computer to get started. Drop files
                anywhere, pick individual songs, or grab a whole folder. Your files
                stay on your machine — nothing is uploaded.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={onPickFiles} size="lg" className="gap-2 px-6">
                <Upload className="w-4 h-4" />
                Add files
              </Button>
              <Button
                onClick={onPickFolder}
                size="lg"
                variant="outline"
                className="gap-2 px-6"
              >
                <FolderOpen className="w-4 h-4" />
                Add folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Supports MP3, FLAC, WAV, OGG, M4A, MP4
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/*,.mp4,.m4a,.m4v,.mov,.mkv,.webm"
              multiple
              className="hidden"
              onChange={onChange}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onChange}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}
