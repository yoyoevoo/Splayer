import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/player-context";

const BAR_COUNT = 24;

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { analyserRef, isPlaying } = usePlayer();

  // Keep isPlaying in a ref so the RAF loop never needs to restart
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Pre-allocate frequency data buffer (re-sized when needed)
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(256));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;

    const draw = () => {
      rafId = requestAnimationFrame(draw);

      // Auto-resize canvas buffer to match CSS size (handles layout changes)
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);

      if (w <= 0 || h <= 0) return;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
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

      // Only use lower 65% of bins (upper bins are mostly silence for music)
      const usableBins = Math.floor(binCount * 0.65);
      const step = Math.max(1, Math.floor(usableBins / BAR_COUNT));

      const gap = Math.max(1, Math.round(w * 0.006));
      const barW = Math.max(2, Math.floor((w / 2 - BAR_COUNT * gap) / BAR_COUNT));
      const cx = Math.floor(w / 2);

      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0,   "rgba(249,115,22,0.92)");
      grad.addColorStop(0.5, "rgba(251,146,60,0.70)");
      grad.addColorStop(1,   "rgba(254,215,170,0.35)");
      ctx.fillStyle = grad;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average a band of bins for smooth bars
        let sum = 0;
        for (let k = 0; k < step; k++) {
          sum += data[i * step + k] ?? 0;
        }
        const norm = sum / (step * 255);
        const bh = Math.max(3, Math.round(norm * h * 0.92));

        ctx.fillRect(cx + i * (barW + gap),       h - bh, barW, bh); // right
        ctx.fillRect(cx - (i + 1) * (barW + gap), h - bh, barW, bh); // left mirror
      }
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, []); // runs once — uses refs for all live values

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full rounded-2xl pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}
