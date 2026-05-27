import {
  Heart,
  Mic2,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
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
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/lib/player-context";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EQPanel } from "./EQPanel";
import { currentPlatform } from "@/lib/platform-api";
import { AndroidEQPanel } from "./AndroidEQPanel";
import { WaveformScrubber } from "./WaveformScrubber";

function useSleepTimer(onExpire: () => void) {
  const [sleepEnd, setSleepEnd] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (sleepEnd === null) return;
    const tick = () => {
      const left = Math.max(0, sleepEnd - Date.now());
      setRemaining(left);
      if (left === 0) {
        setSleepEnd(null);
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepEnd]);

  const start = (minutes: number) => {
    setSleepEnd(Date.now() + minutes * 60 * 1000);
  };
  const cancel = () => setSleepEnd(null);
  const active = sleepEnd !== null;

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const label = `${mm}:${String(ss).padStart(2, "0")}`;

  return { active, label, start, cancel };
}

type SleepTimerHook = ReturnType<typeof useSleepTimer>;

function SleepTimerInput({ sleep }: { sleep: SleepTimerHook }) {
  const [minutes, setMinutes] = useState(30);
  const PRESETS = [15, 30, 60];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={999}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
          className="w-16 h-8 rounded-md border border-input bg-background px-2 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground">min</span>
        <button
          type="button"
          onClick={() => sleep.start(minutes)}
          className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
        >
          Start
        </button>
      </div>
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setMinutes(p); sleep.start(p); }}
            className="flex-1 h-6 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {p}m
          </button>
        ))}
      </div>
      {sleep.active && (
        <button
          type="button"
          onClick={sleep.cancel}
          className="w-full h-7 rounded-md border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 transition-colors"
        >
          Cancel · {sleep.label} left
        </button>
      )}
    </div>
  );
}

const SKIP_PRESETS = [5, 10, 15, 30, 45, 60];

function SkipButton({
  direction,
  secs,
  onSkip,
  onChangeSecs,
}: {
  direction: "back" | "forward";
  secs: number;
  onSkip: () => void;
  onChangeSecs: (s: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef       = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    longPressRef.current = setTimeout(() => {
      setMenuOpen(true);
    }, 600);
  }
  function handleMouseUp() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenuOpen(true);
  }
  function handleClick() {
    if (longPressRef.current !== null) {
      return;
    }
    onSkip();
  }

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const btnRect = menuOpen && btnRef.current ? btnRef.current.getBoundingClientRect() : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        title={`Skip ${direction === "back" ? "back" : "forward"} ${secs}s · right-click to change`}
        className="h-8 w-8 flex flex-col items-center justify-center gap-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
      >
        {direction === "back"
          ? <RotateCcw className="h-3.5 w-3.5" />
          : <RotateCw  className="h-3.5 w-3.5" />}
        <span className="text-[8px] font-bold leading-none tabular-nums">{secs}</span>
      </button>
      {menuOpen && btnRect && createPortal(
        <div
          style={{
            position: "fixed",
            bottom: window.innerHeight - btnRect.top + 8,
            left: btnRect.left + btnRect.width / 2,
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
          className="bg-popover border border-border rounded-md shadow-lg p-1 w-32"
        >
          {SKIP_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChangeSecs(p);
                setMenuOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors cursor-pointer",
                secs === p ? "text-primary font-medium" : "text-foreground",
              )}
            >
              {p}s
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function PlayerControls() {
  const [androidEQOpen, setAndroidEQOpen] = useState(false);
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
    speed,
    setSpeed,
    lyricsOpen,
    setLyricsOpen,
    toggleCrossfade,
    setCrossfadeSecs,
    toggleLike,
    isMono,
    toggleMono,
    skipBackSecs,
    skipForwardSecs,
    setSkipBackSecs,
    setSkipForwardSecs,
    skipBack,
    skipForward,
  } = usePlayer();

  const sleep = useSleepTimer(() => { if (isPlaying) togglePlay(); });

  const SPEED_OPTIONS = [
    { value: 0.5,  label: "0.5×" },
    { value: 0.75, label: "0.75×" },
    { value: 1,    label: "Normal" },
    { value: 1.25, label: "1.25×" },
    { value: 1.5,  label: "1.5×" },
    { value: 2,    label: "2×" },
  ];

  const total = duration || currentTrack?.duration || 0;
  const liked = currentTrack?.liked ?? false;

  return (
    <>
      <div
        data-testid="player-controls"
        className={cn(
          "border-t border-card-border px-4 py-3",
          currentPlatform === "android" ? "relative z-10 bg-card" : "bg-card/60 backdrop-blur",
        )}
        style={currentPlatform === "android"
          ? { backgroundColor: "hsl(var(--card) / 1)" }
          : undefined}
      >
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
              <SkipButton
                direction="back"
                secs={skipBackSecs}
                onSkip={skipBack}
                onChangeSecs={setSkipBackSecs}
              />
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
              <SkipButton
                direction="forward"
                secs={skipForwardSecs}
                onSkip={skipForward}
                onChangeSecs={setSkipForwardSecs}
              />
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
              <WaveformScrubber
                track={currentTrack}
                currentTime={currentTime}
                duration={total}
                onSeek={seek}
              />
              <span className="text-[11px] text-muted-foreground tabular-nums w-10">
                {formatTime(total)}
              </span>
            </div>

            {/* Android-only second row: EQ + crossfade */}
            {currentPlatform === "android" && (
              <div className="flex items-center gap-3 pt-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                  onClick={() => setAndroidEQOpen(true)}
                  aria-label="Open equalizer"
                  title="Equalizer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  EQ
                </Button>

                <button
                  type="button"
                  onClick={toggleCrossfade}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground h-8 px-2 shrink-0"
                  aria-label="Toggle crossfade"
                >
                  <Waves className={cn("h-3.5 w-3.5", crossfadeEnabled && "text-primary")} />
                  <span className={crossfadeEnabled ? "text-primary" : ""}>
                    {crossfadeEnabled ? `${crossfadeSecs}s` : "Crossfade"}
                  </span>
                </button>

                {/* Native range input: reliable touch handling in Android WebView */}
                {crossfadeEnabled && (
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={crossfadeSecs}
                    onChange={(e) => setCrossfadeSecs(Number(e.target.value))}
                    className="flex-1 max-w-[110px] h-1 accent-primary cursor-pointer"
                    aria-label="Crossfade duration"
                  />
                )}

                <button
                  type="button"
                  onClick={toggleMono}
                  className={cn(
                    "h-8 px-2 rounded text-[11px] font-bold tracking-wider transition-colors",
                    isMono
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground",
                  )}
                  aria-label={isMono ? "Mono — click for stereo" : "Stereo — click for mono"}
                  title={isMono ? "Mono" : "Stereo"}
                >
                  {isMono ? "MONO" : "STEREO"}
                </button>
              </div>
            )}
          </div>

          {/* Right: EQ + lyrics + crossfade + volume */}
          <div className="hidden md:flex items-center justify-end gap-1 w-80">
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
              onClick={() => setLyricsOpen(!lyricsOpen)}
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

            {/* Speed */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "h-8 px-1.5 text-xs font-medium tabular-nums",
                    speed !== 1 ? "text-primary" : "text-muted-foreground",
                  )}
                  data-testid="button-speed"
                  aria-label="Playback speed"
                  title="Playback speed"
                >
                  {speed === 1 ? "1×" : SPEED_OPTIONS.find(o => o.value === speed)?.label ?? `${speed}×`}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-36 p-1">
                {SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSpeed(opt.value)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors",
                      speed === opt.value ? "text-primary font-medium" : "text-foreground",
                    )}
                    data-testid={`speed-option-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

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

            {/* Sleep timer */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn("h-8 w-8", sleep.active ? "text-primary" : "text-muted-foreground")}
                  aria-label="Sleep timer"
                  title="Sleep timer"
                >
                  {sleep.active
                    ? <span className="text-[10px] tabular-nums font-medium leading-none">{sleep.label}</span>
                    : <Moon className="h-4 w-4" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Sleep timer</p>
                <SleepTimerInput sleep={sleep} />
              </PopoverContent>
            </Popover>

            {/* Mono toggle */}
            <button
              type="button"
              onClick={toggleMono}
              className={cn(
                "h-8 px-2 rounded text-[11px] font-bold tracking-wider transition-colors",
                isMono
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="button-mono"
              aria-label={isMono ? "Mono — click for stereo" : "Stereo — click for mono"}
              title={isMono ? "Mono — click for stereo" : "Stereo — click for mono"}
            >
              {isMono ? "MONO" : "STEREO"}
            </button>

            <div
              className="flex items-center gap-1.5"
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
                className="w-20"
                data-testid="slider-volume"
              />
            </div>
          </div>
        </div>
      </div>

      <AndroidEQPanel open={androidEQOpen} onOpenChange={setAndroidEQOpen} />
    </>
  );
}
