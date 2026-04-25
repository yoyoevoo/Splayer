import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/player-context";

const BAR_COUNT = 48;
const FADE_MS   = 400;

interface VisualizerProps {
  visible: boolean;
}

export function Visualizer({ visible }: VisualizerProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const { analyserRef, isPlaying } = usePlayer();

  // Keep live values in refs so the RAF loop never restarts
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Pre-allocated frequency data buffer
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(256));

  // ── visibility: fade then display:none ──────────────────────────────────
  const [display, setDisplay] = useState<"block" | "none">(visible ? "block" : "none");

  useEffect(() => {
    if (visible) {
      setDisplay("block");
      return;
    }
    const t = setTimeout(() => setDisplay("none"), FADE_MS);
    return () => clearTimeout(t);
  }, [visible]);

  // ── single RAF loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;

    const draw = () => {
      rafId = requestAnimationFrame(draw);

      // Resize canvas buffer to match CSS size each frame
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w    = Math.round(rect.width  * dpr);
      const h    = Math.round(rect.height * dpr);

      if (w <= 0 || h <= 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }

      const analyser = analyserRef.current;
      if (!analyser || !isPlayingRef.current) {
        ctx.clearRect(0, 0, w, h);
        return;
      }

      const binCount = analyser.frequencyBinCount;
      if (dataRef.current.length !== binCount) {
        dataRef.current = new Uint8Array(binCount);
      }
      analyser.getByteFrequencyData(dataRef.current);
      const data = dataRef.current;

      ctx.clearRect(0, 0, w, h);

      // Use lower 70 % of bins (covers 0–~8 kHz at 44.1 kHz / 512 FFT)
      const usableBins = Math.floor(binCount * 0.70);
      const step  = Math.max(1, Math.floor(usableBins / BAR_COUNT));

      // 2 CSS-px gaps between bars
      const gapPx = Math.max(2, Math.round(2 * dpr));
      const barW  = Math.max(1, Math.floor((w - (BAR_COUNT - 1) * gapPx) / BAR_COUNT));

      // Orange gradient, ~0.70 max opacity so album art shows through
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0,    "rgba(249,115,22,0.72)");
      grad.addColorStop(0.55, "rgba(251,146,60,0.55)");
      grad.addColorStop(1,    "rgba(254,215,170,0.28)");
      ctx.fillStyle = grad;

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let k = 0; k < step; k++) {
          sum += data[i * step + k] ?? 0;
        }
        const norm = sum / (step * 255);
        const bh   = Math.max(3, Math.round(norm * h));
        const x    = i * (barW + gapPx);
        ctx.fillRect(x, h - bh, barW, bh);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, []); // runs once — reads live values from refs

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        display,
        opacity:    visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        zIndex: 0,
      }}
    />
  );
}
