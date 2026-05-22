import { useState } from "react";
import { ChevronDown, ChevronUp, Download, X } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import type { ActiveDownload } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FloatingDownloadBadge() {
  const { downloads, cancelDownload, miniMode } = usePlayer();
  const [collapsed, setCollapsed] = useState(false);

  if (downloads.length === 0) return null;

  const activeCount = downloads.filter(
    (d) => d.status === "pending" || d.status === "downloading",
  ).length;

  // Mini player: 80px bar + 24px gap + 16px clearance = 120px
  // Full player: PlayerControls footer ≈ 94px + 8px clearance = 100px
  const bottomClass = miniMode ? "bottom-[120px]" : "bottom-[100px]";

  return (
    <div className={`fixed ${bottomClass} right-4 z-[150] w-72 rounded-xl border border-card-border bg-card shadow-2xl`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border">
        <div className="flex items-center gap-2">
          <Download className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">
            Downloads
            {activeCount > 0 && (
              <span className="ml-1 text-muted-foreground font-normal">
                · {activeCount} active
              </span>
            )}
          </span>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto divide-y divide-card-border/40">
          {downloads.map((dl) => (
            <DownloadRow
              key={dl.id}
              dl={dl}
              onCancel={() => cancelDownload(dl.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadRow({
  dl,
  onCancel,
}: {
  dl: ActiveDownload;
  onCancel: () => void;
}) {
  const done       = dl.status === "done";
  const error      = dl.status === "error";
  const pending    = dl.status === "pending";
  const active     = dl.status === "downloading";

  // Derive a single overall percent for merged downloads
  const overallPercent = dl.type === "merged"
    ? dl.progressMerge > 0
      ? dl.progressMerge
      : dl.progressVideo > 0
        ? Math.round((dl.progressAudio + dl.progressVideo) / 2)
        : Math.round(dl.progressAudio / 2)
    : dl.progressAudio;

  // Status label shown below the title
  const statusLabel = (() => {
    if (pending) return "Queued";
    if (done)    return null;
    if (error)   return dl.errorMsg ?? "Download failed";
    if (dl.type === "merged") {
      if (dl.progressMerge > 0) return `Merging… ${dl.progressMerge}%`;
      if (dl.progressVideo > 0) return `Video… ${dl.progressVideo}%`;
      return `Audio… ${dl.progressAudio}%`;
    }
    return `${dl.progressAudio}%`;
  })();

  return (
    <div className="flex items-start gap-2.5 p-3">
      {/* Thumbnail */}
      {dl.thumbnailUrl ? (
        <img
          src={dl.thumbnailUrl}
          alt=""
          className="w-12 h-8 rounded object-cover shrink-0 mt-0.5"
        />
      ) : (
        <div className="w-12 h-8 rounded bg-muted shrink-0 mt-0.5 flex items-center justify-center">
          <Download className="w-3 h-3 text-muted-foreground" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs font-medium leading-tight truncate">{dl.title}</p>

        {/* Progress bar */}
        {(active || pending) && (
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                pending
                  ? "w-full bg-muted-foreground/30 animate-pulse"
                  : "bg-primary",
              )}
              style={active ? { width: `${overallPercent}%` } : undefined}
            />
          </div>
        )}

        {/* Status text */}
        {done && (
          <p className="text-[10px] text-green-500 font-medium">Saved to library ✓</p>
        )}
        {statusLabel && (
          <p
            className={cn(
              "text-[10px]",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {statusLabel}
          </p>
        )}
      </div>

      {/* Cancel / dismiss button */}
      {!done && (
        <button
          onClick={onCancel}
          title={pending ? "Remove from queue" : "Cancel"}
          className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
