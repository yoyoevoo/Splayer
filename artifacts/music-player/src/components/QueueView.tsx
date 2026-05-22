import { ListMusic } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { formatTime } from "@/lib/format";
import { AlbumCover } from "./AlbumCover";
import { trackCoverUrl } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QueueView() {
  const {
    effectiveQueue,
    currentTrack,
    currentIndex,
    currentQueueLabel,
    currentPlaylistId,
    currentPlaylistType,
    playFromList,
  } = usePlayer();

  const upNext = currentIndex !== null
    ? effectiveQueue.slice(currentIndex + 1)
    : effectiveQueue;

  const jumpTo = (trackId: string) => {
    const idx = effectiveQueue.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    playFromList(
      effectiveQueue.map((t) => t.id),
      idx,
      currentQueueLabel,
      currentPlaylistId,
      currentPlaylistType,
    );
  };

  if (!currentTrack && effectiveQueue.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <ListMusic className="w-8 h-8 opacity-40" />
        <p className="text-sm">Nothing in the queue</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Now Playing */}
      {currentTrack && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 px-1">
            Now Playing
          </p>
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <AlbumCover
              src={trackCoverUrl(currentTrack)}
              seed={currentTrack.title + currentTrack.artist}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-foreground">
                {currentTrack.title}
              </p>
              {currentTrack.artist && (
                <p className="text-xs text-muted-foreground truncate">
                  {currentTrack.artist}
                </p>
              )}
            </div>
            {currentTrack.duration != null && (
              <span className="text-xs text-muted-foreground shrink-0">
                {formatTime(currentTrack.duration)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Up Next */}
      {upNext.length > 0 && (
        <div className="px-3 pt-3 pb-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 px-1">
            Up Next · {upNext.length} track{upNext.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-0.5">
            {upNext.map((track, i) => (
              <button
                key={track.id}
                onClick={() => jumpTo(track.id)}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-1.5 rounded-lg w-full text-left",
                  "hover:bg-muted/60 transition-colors group",
                )}
              >
                <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">
                  {i + 1}
                </span>
                <AlbumCover
                  src={trackCoverUrl(track)}
                  seed={track.title + track.artist}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate text-foreground group-hover:text-primary transition-colors">
                    {track.title}
                  </p>
                  {track.artist && (
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist}
                    </p>
                  )}
                </div>
                {track.duration != null && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTime(track.duration)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {upNext.length === 0 && currentTrack && (
        <p className="text-xs text-muted-foreground text-center py-6">
          No more tracks in queue
        </p>
      )}
    </div>
  );
}
