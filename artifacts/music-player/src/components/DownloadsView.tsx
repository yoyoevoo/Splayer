import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import {
  readDownloadHistory,
  removeDownloadRecord,
  clearAllDownloadRecords,
} from "@/lib/downloads-history";

function formatBytes(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

function totalBytes(history: ReturnType<typeof readDownloadHistory>): number {
  return history.reduce((acc, r) => acc + (r.fileSize ?? 0), 0);
}

const AVATAR_GRADIENTS = [
  ["#7c3aed", "#4f46e5"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ef4444"],
  ["#ec4899", "#8b5cf6"],
  ["#14b8a6", "#0ea5e9"],
];

function avatarGradient(title: string): string {
  const idx = (title.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length;
  const [from, to] = AVATAR_GRADIENTS[idx];
  return `linear-gradient(135deg, ${from}, ${to})`;
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

  function handleClearAll() {
    clearAllDownloadRecords();
    setHistory([]);
  }

  if (history.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No downloads yet. Use the YouTube downloader to grab music.
      </div>
    );
  }

  const totalSize = totalBytes(history);

  return (
    <div className="space-y-1">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{history.length}</span>
          {" download"}{history.length !== 1 ? "s" : ""}
          {" · "}
          <span className="font-semibold text-foreground">{formatBytes(totalSize)}</span>
        </p>
        <button
          onClick={handleClearAll}
          className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-md hover:bg-red-500/10"
        >
          Clear All
        </button>
      </div>

      {/* ── Card list ── */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
        {history.map((record) => {
          const inLibrary  = tracks.some((t) => t.id === record.trackId);
          const coverUrl   = tracks.find((t) => t.id === record.trackId)?.embeddedCoverUrl
                          ?? tracks.find((t) => t.id === record.trackId)?.customCoverUrl;
          const isAudio    = record.type === "audio";
          const ext        = record.ext.toUpperCase();
          const isMp4      = ext === "MP4";

          return (
            <div
              key={record.id}
              className="group flex items-center gap-2 rounded-xl border border-white/[0.07] px-2.5 py-2 transition-all duration-150 hover:border-white/[0.14] hover:brightness-110 overflow-hidden w-full"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
              }}
            >
              {/* Thumbnail — fixed 48×48 to save horizontal space */}
              <div
                className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center text-white font-bold text-base"
                style={{
                  width:  48,
                  height: 48,
                  minWidth: 48,
                  background: coverUrl ? undefined : avatarGradient(record.title),
                }}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={record.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="select-none drop-shadow">
                    {(record.title[0] ?? "?").toUpperCase()}
                  </span>
                )}
              </div>

              {/* Title + artist + badge — min-w-0 so truncation works */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-white truncate leading-tight">
                  {record.title}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {record.artist || "Unknown artist"}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide shrink-0"
                    style={{
                      background: isMp4 ? "rgba(168,85,247,0.2)" : "rgba(34,197,94,0.18)",
                      color:      isMp4 ? "#c084fc"              : "#4ade80",
                      border:     isMp4 ? "1px solid rgba(168,85,247,0.35)"
                                        : "1px solid rgba(34,197,94,0.3)",
                    }}
                  >
                    {ext}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 truncate">
                    {formatBytes(record.fileSize)} · {formatDate(record.downloadedAt)}
                  </span>
                </div>
              </div>

              {/* Action buttons — always shrink-0 so they never push out */}
              <div className="flex items-center gap-0.5 shrink-0">
                {inLibrary && isAudio && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-white hover:bg-white/10"
                    title="Play this track"
                    onClick={() => handlePlay(record.trackId)}
                  >
                    <Play className="h-3 w-3 fill-current" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  title="Remove from history"
                  onClick={() => handleDelete(record.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
