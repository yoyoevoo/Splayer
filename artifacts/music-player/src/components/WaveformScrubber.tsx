import { useEffect, useRef, useState, useCallback } from "react";
import { Track } from "@/lib/types";

const N_BARS = 180;
const BAR_GAP = 1; // px gap between bars

// Module-level cache so waveform survives re-renders / track switches
const waveCache = new Map<string, Float32Array>();

async function decodeWaveform(track: Track): Promise<Float32Array> {
  if (waveCache.has(track.id)) return waveCache.get(track.id)!;

  const res   = await fetch(track.url);
  const buf   = await res.arrayBuffer();
  const ctx   = new AudioContext();
  const audio = await ctx.decodeAudioData(buf);
  await ctx.close();

  const raw    = audio.getChannelData(0);
  const chunk  = Math.floor(raw.length / N_BARS);
  const bars   = new Float32Array(N_BARS);
  for (let i = 0; i < N_BARS; i++) {
    let sum = 0;
    const start = i * chunk;
    for (let j = 0; j < chunk; j++) sum += Math.abs(raw[start + j]);
    bars[i] = sum / chunk;
  }
  // Normalise to [0, 1]
  const max = Math.max(...bars, 0.001);
  for (let i = 0; i < N_BARS; i++) bars[i] /= max;

  waveCache.set(track.id, bars);
  return bars;
}

interface Props {
  track: Track | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function WaveformScrubber({ track, currentTime, duration, onSeek }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<Float32Array | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const rafRef = useRef<number>(0);

  // Decode waveform when track changes
  useEffect(() => {
    setBars(null);
    if (!track) return;
    // Check cache first (sync path)
    if (waveCache.has(track.id)) {
      setBars(waveCache.get(track.id)!);
      return;
    }
    let cancelled = false;
    decodeWaveform(track).then((b) => { if (!cancelled) setBars(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, [track?.id]);

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext("2d");
    if (!ctx)  return;

    // Read the app's --primary CSS variable so bars match the active theme.
    // Stored as bare HSL channels, e.g. "24.6 95% 53.1%".
    const hsl = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary").trim() || "24.6 95% 53.1%";

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
    const hover    = hoverRatio;

    if (!bars) {
      // Flat placeholder bar
      const y = H / 2;
      ctx.fillStyle = `hsl(${hsl} / 0.25)`;
      ctx.fillRect(0, y - 1, W * progress, 2);
      ctx.fillStyle = "rgba(255 255 255 / 0.12)";
      ctx.fillRect(W * progress, y - 1, W * (1 - progress), 2);
      return;
    }

    const barW = (W - (N_BARS - 1) * BAR_GAP) / N_BARS;
    const playedX = W * progress;
    const hoverX  = hover !== null ? W * hover : null;

    for (let i = 0; i < N_BARS; i++) {
      const x   = i * (barW + BAR_GAP);
      const amp = bars[i];
      const barH = Math.max(2, amp * (H - 4));
      const y   = (H - barH) / 2;

      const barMid = x + barW / 2;
      const played  = barMid < playedX;
      const hovered = hoverX !== null && barMid < hoverX;

      if (played) {
        ctx.fillStyle = `hsl(${hsl} / 0.95)`;
      } else if (hovered) {
        ctx.fillStyle = `hsl(${hsl} / 0.45)`;
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      }

      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(1, barW), barH, 2);
      ctx.fill();
    }

    // Playhead line
    if (progress > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(playedX - 1, 0, 2, H);
    }
  }, [bars, currentTime, duration, hoverRatio]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Resize observer to keep canvas sharp
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      canvas.style.width  = canvas.offsetWidth  + "px";
      canvas.style.height = canvas.offsetHeight + "px";
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const ratioFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  return (
    <canvas
      ref={canvasRef}
      className="flex-1 h-9 cursor-pointer"
      style={{ imageRendering: "pixelated" }}
      onClick={(e) => { if (duration > 0) onSeek(ratioFromEvent(e) * duration); }}
      onMouseMove={(e) => setHoverRatio(ratioFromEvent(e))}
      onMouseLeave={() => setHoverRatio(null)}
      title="Seek"
    />
  );
}
