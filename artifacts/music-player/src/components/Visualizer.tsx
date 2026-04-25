import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/player-context";

// Orange accent palette matching the app theme
const ORANGE_0 = "rgba(249,115,22,0.9)";  // orange-500
const ORANGE_1 = "rgba(251,146,60,0.7)";  // orange-400
const ORANGE_2 = "rgba(254,215,170,0.3)"; // orange-200

const BAR_COUNT = 28;

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { analyserRef, isPlaying } = usePlayer();
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Resize canvas to match CSS size (pixel-accurate, DPR-aware)
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const dpr = window.devicePixelRatio || 1;
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      const { width, height } = canvas;

      ctx.clearRect(0, 0, width, height);

      if (!analyser) return;

      // Reuse typed array
      const binCount = analyser.frequencyBinCount;
      if (!dataRef.current || dataRef.current.length !== binCount) {
        dataRef.current = new Uint8Array(binCount);
      }
      analyser.getByteFrequencyData(dataRef.current);

      const data = dataRef.current;

      // We only use the lower half of bins (most musical content is there)
      const usableBins = Math.floor(binCount * 0.6);
      const step = Math.max(1, Math.floor(usableBins / BAR_COUNT));

      const gap = Math.max(1, Math.floor(width * 0.005));
      const totalBars = BAR_COUNT * 2;
      const barW = Math.max(2, Math.floor((width - (totalBars - 1) * gap) / totalBars));
      const centerX = Math.round(width / 2);

      // Build gradient once per frame (height can change on resize)
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0,   ORANGE_0);
      grad.addColorStop(0.5, ORANGE_1);
      grad.addColorStop(1,   ORANGE_2);
      ctx.fillStyle = grad;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average a few bins per bar for smoother look
        let sum = 0;
        for (let k = 0; k < step; k++) {
          sum += data[i * step + k] ?? 0;
        }
        const norm = sum / (step * 255);
        const barH = Math.max(3, Math.round(norm * height * 0.92));

        // Right side
        const xRight = centerX + i * (barW + gap);
        ctx.fillRect(xRight, height - barH, barW, barH);

        // Left mirror
        const xLeft = centerX - (i + 1) * (barW + gap);
        ctx.fillRect(xLeft, height - barH, barW, barH);
      }
    };

    draw();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyserRef]);

  // When paused, clear the canvas so bars don't freeze
  useEffect(() => {
    if (!isPlaying) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [isPlaying]);

  return (
    <div ref={containerRef} className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
