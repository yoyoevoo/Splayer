import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/player-context";

/**
 * Visualizer canvas sits ON TOP of the album art (z:2).
 * Bar colours use ~0.70 alpha so the artwork shows through.
 * The whole canvas fades in/out via CSS opacity; display:none is
 * applied after the fade completes so the DOM is clean when hidden.
 */

const BAR_COUNT = 48;
const FADE_MS   = 400;

interface VisualizerProps {
  visible: boolean;
}

export function Visualizer({ visible }: VisualizerProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const { analyserRef, isPlaying } = usePlayer();

  // Stable refs — RAF loop never needs to restart when these change
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(256));

  // ── Fade + display:none management ──────────────────────────────────────
  const [cssDisplay, setCssDisplay] = useState<"block" | "none">(
    visible ? "block" : "none",
  );

  useEffect(() => {
    if (visible) {
      setCssDisplay("block");  // show immediately so opacity transition plays
      return;
    }
    const t = setTimeout(() => setCssDisplay("none"), FADE_MS);
    return () => clearTimeout(t);
  }, [visible]);

  // ── Single RAF draw loop (mounted once) ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let resumeThrottle = 0; // throttle AudioContext.resume() calls

    // Cache the --primary CSS variable; re-read at most once per second so
    // theme changes are picked up quickly without hitting getComputedStyle
    // on every animation frame.
    let cachedHsl = "";
    let lastHslRead = -Infinity;

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);

      // Keep canvas buffer matched to CSS size (DPR-aware, handles resize)
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w    = Math.round(rect.width  * dpr);
      const h    = Math.round(rect.height * dpr);

      if (w <= 0 || h <= 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      // Clip all drawing to a rounded-rect matching rounded-2xl (1 rem = 16 CSS px).
      // CSS overflow/clip-path is unreliable for GPU-composited canvas on Android
      // WebView — enforcing the clip inside the 2D context is the only reliable fix.
      const r = Math.min(Math.round(16 * dpr), w / 2, h / 2);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(w - r, 0);
      ctx.arcTo(w, 0, w, r, r);
      ctx.lineTo(w, h - r);
      ctx.arcTo(w, h, w - r, h, r);
      ctx.lineTo(r, h);
      ctx.arcTo(0, h, 0, h - r, r);
      ctx.lineTo(0, r);
      ctx.arcTo(0, 0, r, 0, r);
      ctx.closePath();
      ctx.clip();

      const analyser = analyserRef.current;
      if (!analyser || !isPlayingRef.current) { ctx.restore(); return; }

      // Safety: resume AudioContext if the browser suspended it (≤ once / 2 s)
      if (now - resumeThrottle > 2000) {
        resumeThrottle = now;
        const actx = analyser.context as AudioContext;
        if (actx.state === "suspended") actx.resume().catch(() => {});
      }

      // Read frequency data
      const binCount = analyser.frequencyBinCount;
      if (dataRef.current.length !== binCount) {
        dataRef.current = new Uint8Array(binCount);
      }
      analyser.getByteFrequencyData(dataRef.current);
      const data = dataRef.current;

      // Map lower 70 % of bins (≈ 0–8 kHz for music) to BAR_COUNT bars
      const usableBins = Math.floor(binCount * 0.70);
      const step  = Math.max(1, Math.floor(usableBins / BAR_COUNT));

      // 2 CSS-px gap between bars
      const gapPx = Math.max(2, Math.round(2 * dpr));
      const barW  = Math.max(1, Math.floor((w - (BAR_COUNT - 1) * gapPx) / BAR_COUNT));

      // Read the app's --primary CSS variable (throttled to once / second).
      // Stored as bare HSL channels, e.g. "24.6 95% 53.1%", so we wrap with
      // hsl(… / alpha) to produce theme-aware bar colors.
      if (now - lastHslRead > 1000) {
        cachedHsl = getComputedStyle(document.documentElement)
          .getPropertyValue("--primary").trim();
        lastHslRead = now;
      }
      const hsl = cachedHsl || "24.6 95% 53.1%"; // orange fallback

      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0,    `hsl(${hsl} / 0.85)`);
      grad.addColorStop(0.55, `hsl(${hsl} / 0.55)`);
      grad.addColorStop(1,    `hsl(${hsl} / 0.22)`);
      ctx.fillStyle = grad;

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let k = 0; k < step; k++) sum += data[i * step + k] ?? 0;
        const norm = sum / (step * 255);
        const bh   = Math.max(4, Math.round(norm * h));
        ctx.fillRect(i * (barW + gapPx), h - bh, barW, bh);
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []); // stable — all live values accessed via refs

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{
        position:     "absolute",
        top:          0,
        right:        0,
        bottom:       0,
        left:         0,
        width:        "100%",
        height:       "100%",
        display:      cssDisplay,
        opacity:      visible ? 1 : 0,
        transition:   `opacity ${FADE_MS}ms ease`,
        zIndex:       2,
        borderRadius: "inherit",
        overflow:     "hidden",
      }}
    />
  );
}
