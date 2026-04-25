import { useState } from "react";
import {
  Heart,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume1,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePlayer } from "@/lib/player-context";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LyricsPanel } from "./LyricsPanel";
import { EQPanel } from "./EQPanel";

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
    crossfadeEnabled,
    crossfadeSecs,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleCrossfade,
    setCrossfadeSecs,
    toggleLike,
  } = usePlayer();

  const [lyricsOpen, setLyricsOpen] = useState(false);

  const total = duration || currentTrack?.duration || 0;
  const liked = currentTrack?.liked ?? false;

  return (
    <>
      <div className="border-t border-card-border bg-card/60 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Left: track info + heart */}
          <div className="hidden md:flex items-center gap-2 w-64 min-w-0">
            {currentTrack ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {currentTrack.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {currentTrack.artist}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleLike(currentTrack.id)}
                  className={cn(
                    "h-8 w-8 shrink-0",
                    liked
                      ? "text-red-500 hover:text-red-400"
                      : "text-muted-foreground hover:text-red-400",
                  )}
                  data-testid="button-like-current"
                  aria-label={liked ? "Unlike" : "Like"}
                >
                  <Heart
                    className="h-4 w-4"
                    fill={liked ? "currentColor" : "none"}
                  />
                </Button>
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

          {/* Right: EQ + lyrics + crossfade + volume */}
          <div className="hidden md:flex items-center gap-1 w-64">
            <EQPanel
              trigger={
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  data-testid="button-eq"
                  aria-label="Equalizer"
                  title="Equalizer"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setLyricsOpen(true)}
              className={cn(
                "h-8 w-8",
                lyricsOpen ? "text-primary" : "text-muted-foreground",
              )}
              data-testid="button-lyrics"
              aria-label="Lyrics"
              title="Lyrics"
            >
              <Mic2 className="h-4 w-4" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8",
                    crossfadeEnabled ? "text-primary" : "text-muted-foreground",
                  )}
                  data-testid="button-crossfade"
                  aria-label="Crossfade"
                  title="Crossfade"
                >
                  <Waves className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-52 p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Crossfade</span>
                  <button
                    type="button"
                    onClick={toggleCrossfade}
                    className={cn(
                      "relative w-8 h-4 rounded-full transition-colors",
                      crossfadeEnabled ? "bg-primary" : "bg-muted",
                    )}
                    data-testid="toggle-crossfade"
                    aria-label="Toggle crossfade"
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                        crossfadeEnabled ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>
                {crossfadeEnabled && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Duration</span>
                      <span>{crossfadeSecs}s</span>
                    </div>
                    <Slider
                      value={[crossfadeSecs]}
                      min={1}
                      max={10}
                      step={1}
                      onValueChange={(v) => setCrossfadeSecs(v[0])}
                      data-testid="slider-crossfade"
                    />
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <div
              className="flex items-center gap-1.5 flex-1 min-w-0"
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.01 : -0.01;
                const next = Math.min(1, Math.max(0, volume + delta));
                setVolume(next);
              }}
            >
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
                className="h-8 w-8 text-muted-foreground shrink-0"
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
              <span className="text-[11px] tabular-nums text-muted-foreground w-6 shrink-0 text-right">
                {muted ? 0 : Math.round(volume * 100)}
              </span>
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
      </div>

      <LyricsPanel open={lyricsOpen} onOpenChange={setLyricsOpen} />
    </>
  );
}
