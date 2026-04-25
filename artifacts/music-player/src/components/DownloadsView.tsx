import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import {
  readDownloadHistory,
  removeDownloadRecord,
} from "@/lib/downloads-history";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

export function DownloadsView() {
  const { tracks, playFromList } = usePlayer();
  const [history, setHistory] = useState(() => readDownloadHistory());

  function handlePlay(trackId: string) {
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx >= 0) {
      playFromList(tracks.map((t) => t.id), idx, "Downloads");
    }
  }

  function handleDelete(id: string) {
    removeDownloadRecord(id);
    setHistory((h) => h.filter((r) => r.id !== id));
  }

  if (history.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No downloads yet. Use the YouTube downloader to grab music.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
      {history.map((record) => {
        const inLibrary = tracks.some((t) => t.id === record.trackId);
        return (
          <div
            key={record.id}
            className="flex items-center gap-3 rounded-lg border border-card-border bg-card px-3 py-2"
          >
            <div className="text-base shrink-0">
              {record.type === "audio" ? "🎵" : "🎬"}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{record.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {record.artist}
                {" · "}
                {record.ext.toUpperCase()}
                {" · "}
                {formatBytes(record.fileSize)}
                {" · "}
                {formatDate(record.downloadedAt)}
              </p>
              {record.filePath && (
                <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-0.5">
                  {record.filePath}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {inLibrary && record.type === "audio" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Play this track"
                  onClick={() => handlePlay(record.trackId)}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                title="Remove from history"
                onClick={() => handleDelete(record.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
