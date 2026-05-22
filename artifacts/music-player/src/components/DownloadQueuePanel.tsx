import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import {
  clearAllDownloadRecords,
  readDownloadHistory,
  type DownloadRecord,
} from "@/lib/downloads-history";
import { cn } from "@/lib/utils";
import type { ActiveDownload } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AVATAR_GRADIENTS: [string, string][] = [
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

export function DownloadQueueButton({ className }: { className?: string }) {
  const { downloads } = usePlayer();
  const [open, setOpen] = useState(false);

  const activeCount = downloads.filter(
    (d) => d.status === "pending" || d.status === "downloading",
  ).length;

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={cn("relative h-8 w-8 text-muted-foreground", className)}
        title="Download Queue"
        aria-label="Download Queue"
      >
        <Download className="w-4 h-4" />
        {activeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none pointer-events-none">
            {activeCount > 9 ? "9+" : activeCount}
          </span>
        )}
      </Button>
      <DownloadQueueDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function DownloadQueueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { downloads, cancelDownload, startDownload } = usePlayer();
  const [history, setHistory] = useState<DownloadRecord[]>([]);

  // Refresh history whenever downloads state changes (a completion adds to localStorage)
  useEffect(() => {
    setHistory(readDownloadHistory().slice(0, 20));
  }, [downloads]);

  // Also refresh immediately when the dialog opens
  useEffect(() => {
    if (open) setHistory(readDownloadHistory().slice(0, 20));
  }, [open]);

  const activeDownloads = downloads.filter(
    (d) => d.status === "pending" || d.status === "downloading",
  );
  const failedDownloads = downloads.filter((d) => d.status === "error");

  function handleRetry(dl: ActiveDownload) {
    cancelDownload(dl.id);
    startDownload(
      dl.videoUrl,
      { title: dl.title, author: dl.author, thumbnailUrl: dl.thumbnailUrl },
      dl.type,
      dl.videoFormatId,
    );
  }

  function handleClearCompleted() {
    clearAllDownloadRecords();
    setHistory([]);
  }

  const hasAnything =
    activeDownloads.length > 0 || failedDownloads.length > 0 || history.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-card-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="w-4 h-4 text-primary shrink-0" />
            Download Queue
            {activeDownloads.length > 0 && (
              <span className="text-xs font-normal bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                {activeDownloads.length} active
              </span>
            )}
            {failedDownloads.length > 0 && (
              <span className="text-xs font-normal bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">
                {failedDownloads.length} failed
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
          {!hasAnything ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              No downloads yet.
            </div>
          ) : (
            <div className="divide-y divide-card-border/40">
              {/* ── Active Downloads ── */}
              {activeDownloads.length > 0 && (
                <section className="px-5 py-4 space-y-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Active
                  </h3>
                  {activeDownloads.map((dl) => (
                    <ActiveDownloadRow
                      key={dl.id}
                      dl={dl}
                      onCancel={() => cancelDownload(dl.id)}
                    />
                  ))}
                </section>
              )}

              {/* ── Failed Downloads ── */}
              {failedDownloads.length > 0 && (
                <section className="px-5 py-4 space-y-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-red-400">
                    Failed
                  </h3>
                  {failedDownloads.map((dl) => (
                    <FailedDownloadRow
                      key={dl.id}
                      dl={dl}
                      onRetry={() => handleRetry(dl)}
                      onDismiss={() => cancelDownload(dl.id)}
                    />
                  ))}
                </section>
              )}

              {/* ── Completed Downloads ── */}
              {history.length > 0 && (
                <section className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Completed
                    </h3>
                    <button
                      onClick={handleClearCompleted}
                      className="text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {history.map((record) => (
                    <CompletedDownloadRow key={record.id} record={record} />
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActiveDownloadRow({
  dl,
  onCancel,
}: {
  dl: ActiveDownload;
  onCancel: () => void;
}) {
  const isPending = dl.status === "pending";

  const overallPercent =
    dl.type === "merged"
      ? dl.progressMerge > 0
        ? dl.progressMerge
        : dl.progressVideo > 0
          ? Math.round((dl.progressAudio + dl.progressVideo) / 2)
          : Math.round(dl.progressAudio / 2)
      : dl.progressAudio;

  const statusText = isPending
    ? "Queued…"
    : dl.type === "merged"
      ? dl.progressMerge > 0
        ? `Merging… ${dl.progressMerge}%`
        : dl.progressVideo > 0
          ? `Video… ${dl.progressVideo}%`
          : `Audio… ${dl.progressAudio}%`
      : `${dl.progressAudio}%`;

  return (
    <div className="flex items-center gap-3">
      {dl.thumbnailUrl ? (
        <img
          src={dl.thumbnailUrl}
          alt=""
          className="w-10 h-7 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-7 rounded bg-muted shrink-0 flex items-center justify-center">
          <Download className="w-3 h-3 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-medium truncate leading-tight">{dl.title}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">{statusText}</span>
        </div>
        {dl.author && (
          <p className="text-[10px] text-muted-foreground truncate -mt-0.5">{dl.author}</p>
        )}
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          {isPending ? (
            <div className="h-full w-full bg-muted-foreground/30 animate-pulse rounded-full" />
          ) : (
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${overallPercent}%` }}
            />
          )}
        </div>
      </div>
      <button
        onClick={onCancel}
        title={isPending ? "Remove from queue" : "Cancel"}
        className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function FailedDownloadRow({
  dl,
  onRetry,
  onDismiss,
}: {
  dl: ActiveDownload;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-7 rounded bg-destructive/10 border border-destructive/20 shrink-0 flex items-center justify-center">
        <AlertCircle className="w-3 h-3 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{dl.title}</p>
        <p className="text-[10px] text-destructive truncate mt-0.5">
          {dl.errorMsg ?? "Download failed"}
        </p>
      </div>
      <button
        onClick={onRetry}
        title="Retry"
        className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
      <button
        onClick={onDismiss}
        title="Dismiss"
        className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function CompletedDownloadRow({ record }: { record: DownloadRecord }) {
  const ext = record.ext.toUpperCase();
  const isMp4 = ext === "MP4";

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-7 h-7 rounded flex items-center justify-center text-white text-[11px] font-bold shrink-0"
        style={{ background: avatarGradient(record.title) }}
      >
        {(record.title[0] ?? "?").toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{record.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-semibold tracking-wide shrink-0"
            style={{
              background: isMp4 ? "rgba(168,85,247,0.2)" : "rgba(34,197,94,0.18)",
              color: isMp4 ? "#c084fc" : "#4ade80",
              border: isMp4
                ? "1px solid rgba(168,85,247,0.35)"
                : "1px solid rgba(34,197,94,0.3)",
            }}
          >
            {ext}
          </span>
          <p className="text-[10px] text-muted-foreground truncate">
            {record.artist || "Unknown"} · {formatBytes(record.fileSize)}
          </p>
        </div>
      </div>
      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
    </div>
  );
}
