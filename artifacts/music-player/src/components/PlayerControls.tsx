import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlayer } from "@/lib/player-context";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PlayerControls() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const total = duration || currentTrack?.duration || 0;

  return (
    <div className="border-t border-card-border bg-card/60 backdrop-blur px-4 py-3">
      <div className="flex items-center gap-4">
        {/* Left: track-mini */}
        <div className="hidden md:flex items-center gap-3 w-64 min-w-0">
          {currentTrack ? (
            <>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {currentTrack.title}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {currentTrack.artist}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Nothing playing</div>
          )}
        </div>

        {/* Center: controls + seek */}
        <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleShuffle}
              className={cn(
                "h-9 w-9",
                shuffle ? "text-primary" : "text-muted-foreground",
              )}
              data-testid="button-shuffle"
              aria-label="Shuffle"
            >
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={prev}
              className="h-10 w-10"
              data-testid="button-prev"
              aria-label="Previous"
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              onClick={togglePlay}
              className="h-11 w-11 rounded-full"
              data-testid="button-play-pause"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 translate-x-[1px]" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={next}
              className="h-10 w-10"
              data-testid="button-next"
              aria-label="Next"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={cycleRepeat}
              className={cn(
                "h-9 w-9",
                repeat !== "off" ? "text-primary" : "text-muted-foreground",
              )}
              data-testid="button-repeat"
              aria-label="Repeat"
            >
              {repeat === "one" ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full max-w-2xl">
            <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[Math.min(currentTime, total)]}
              max={Math.max(total, 1)}
              step={0.1}
              onValueChange={(v) => seek(v[0])}
              className="flex-1"
              data-testid="slider-seek"
              disabled={!currentTrack}
            />
            <span className="text-[11px] text-muted-foreground tabular-nums w-10">
              {formatTime(total)}
            </span>
          </div>
        </div>

        {/* Right: volume */}
        <div className="hidden md:flex items-center gap-2 w-48">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleMute}
            className="h-8 w-8 text-muted-foreground"
            data-testid="button-mute"
            aria-label="Mute"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : volume < 0.5 ? (
              <Volume1 className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[muted ? 0 : volume * 100]}
            max={100}
            step={1}
            onValueChange={(v) => setVolume(v[0] / 100)}
            className="flex-1"
            data-testid="slider-volume"
          />
        </div>
      </div>
    </div>
  );
}
