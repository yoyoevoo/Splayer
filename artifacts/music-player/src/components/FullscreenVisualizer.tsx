import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, BarChart2, Flame, Gauge, Pause, Play, SkipBack, SkipForward, Sparkles, Wand2, X, Zap } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { currentPlatform } from "@/lib/platform-api";
import { trackCoverUrl } from "@/lib/types";
import { AlbumCover } from "./AlbumCover";
import { cn } from "@/lib/utils";

// ── Style / Mode config ────────────────────────────────────────────────────
type VizStyle = "bars" | "wave" | "particles";
type VizMode  = "ambient" | "reactive";
const STYLES: VizStyle[] = ["bars", "wave", "particles"];
const STYLE_LABELS: Record<VizStyle, string> = { bars: "Bars", wave: "Wave", particles: "Particles" };

function readStyle(): VizStyle {
  try {
    const s = localStorage.getItem("viz-fs-style") as VizStyle | null;
    if (s && STYLES.includes(s)) return s;
  } catch { /* ignore */ }
  return "bars";
}

function readMode(): VizMode {
  try {
    const m = localStorage.getItem("viz-fs-mode");
    if (m === "ambient" || m === "reactive") return m;
  } catch { /* ignore */ }
  return "ambient";
}

type ReactiveSubMode = "pure" | "amplified";

function readReactiveSubMode(): ReactiveSubMode {
  try {
    const m = localStorage.getItem("viz-fs-reactive-mode");
    if (m === "pure" || m === "amplified") return m;
  } catch { /* ignore */ }
  return "amplified";
}

type AmbientIntensity = "extra-chill" | "chill" | "medium" | "high";
const AMBIENT_INTENSITIES: AmbientIntensity[] = ["extra-chill", "chill", "medium", "high"];
const AMBIENT_INTENSITY_LABELS: Record<AmbientIntensity, string> = {
  "extra-chill": "Extra Chill",
  "chill":       "Chill",
  "medium":      "Medium",
  "high":        "High",
};

// Per-intensity parameters for each ambient visualizer style
const AMBIENT_CFG = {
  "extra-chill": {
    // Bars: 5–15 % of screen height, very slow
    barBase: 0.05, barAmp1: 0.07, barAmp2: 0.03, barT1: 0.30, barT2: 0.18,
    // Wave: tiny amplitude, very slow
    wA1: 0.025, wA2: 0.012, wA3: 0.006, wT1: 0.28, wT2: 0.18, wT3: 0.50,
    // Particles: 40, tiny, barely drifting
    pN: 40,  pSzMin: 0.4, pSzRange: 0.8,  pSpMin: 0.08, pSpRange: 0.18, pBA: 0.06, pBF: 0.25,
  },
  "chill": {
    // Bars: 10–25 % of screen height
    barBase: 0.10, barAmp1: 0.10, barAmp2: 0.05, barT1: 1.20, barT2: 0.70,
    // Wave: gentle (original behaviour)
    wA1: 0.09,  wA2: 0.05,  wA3: 0.025, wT1: 1.10, wT2: 0.70, wT3: 2.00,
    // Particles: 80, small, slow
    pN: 80,  pSzMin: 0.7, pSzRange: 1.8,  pSpMin: 0.30, pSpRange: 0.80, pBA: 0.25, pBF: 0.80,
  },
  "medium": {
    // Bars: 20–50 % of screen height
    barBase: 0.20, barAmp1: 0.20, barAmp2: 0.10, barT1: 2.20, barT2: 1.30,
    // Wave: moderate speed & amplitude
    wA1: 0.18,  wA2: 0.10,  wA3: 0.05,  wT1: 2.20, wT2: 1.40, wT3: 3.80,
    // Particles: 140, medium
    pN: 140, pSzMin: 1.0, pSzRange: 3.0,  pSpMin: 0.70, pSpRange: 1.80, pBA: 0.40, pBF: 1.50,
  },
  "high": {
    // Bars: 40–80 % of screen height, fast
    barBase: 0.40, barAmp1: 0.27, barAmp2: 0.13, barT1: 3.80, barT2: 2.20,
    // Wave: large & fast
    wA1: 0.30,  wA2: 0.18,  wA3: 0.09,  wT1: 3.80, wT2: 2.40, wT3: 6.00,
    // Particles: 220, larger, fast
    pN: 220, pSzMin: 1.5, pSzRange: 5.0,  pSpMin: 1.40, pSpRange: 3.00, pBA: 0.65, pBF: 2.50,
  },
} as const;

function readAmbientIntensity(): AmbientIntensity {
  try {
    const m = localStorage.getItem("viz-fs-ambient-intensity");
    if (m === "extra-chill" || m === "chill" || m === "medium" || m === "high") return m;
  } catch { /* ignore */ }
  return "chill";
}

// ── Particle type ──────────────────────────────────────────────────────────
type Particle = { x: number; y: number; vx: number; vy: number; baseSpeed: number; size: number; alpha: number; decay: number };

// ── Component ──────────────────────────────────────────────────────────────
interface Props { onClose: () => void }

export function FullscreenVisualizer({ onClose }: Props) {
  const { currentTrack, isPlaying, analyserRef, togglePlay, next, prev, setFsVizOpen } = usePlayer();

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const [vizStyle, setVizStyle] = useState<VizStyle>(readStyle);
  const vizStyleRef = useRef<VizStyle>(vizStyle);
  vizStyleRef.current = vizStyle;

  const [vizMode, setVizMode] = useState<VizMode>(readMode);
  const vizModeRef = useRef<VizMode>(vizMode);
  vizModeRef.current = vizMode;

  const [reactiveSubMode, setReactiveSubMode] = useState<ReactiveSubMode>(readReactiveSubMode);
  const reactiveSubModeRef = useRef<ReactiveSubMode>(reactiveSubMode);
  reactiveSubModeRef.current = reactiveSubMode;

  const [ambientIntensity, setAmbientIntensity] = useState<AmbientIntensity>(readAmbientIntensity);
  const ambientIntensityRef = useRef<AmbientIntensity>(ambientIntensity);
  ambientIntensityRef.current = ambientIntensity;

  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const freqDataRef  = useRef(new Uint8Array(256));
  const tdDataRef    = useRef(new Uint8Array(256));
  const particlesRef = useRef<Particle[]>([]);

  // ── Auto-hide toolbar ────────────────────────────────────────────────────
  const showToolbar = useCallback(() => {
    setToolbarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
  }, []);

  useEffect(() => {
    showToolbar();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [showToolbar]);

  // ── ESC to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Signal Player.tsx to hide the transport bar while fullscreen ─────────
  useEffect(() => {
    setFsVizOpen(true);
    return () => setFsVizOpen(false);
  }, [setFsVizOpen]);

  // ── RAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let cachedHsl   = "";
    let lastHslRead = -Infinity;

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);

      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w    = Math.round(rect.width  * dpr);
      const h    = Math.round(rect.height * dpr);
      if (w <= 0 || h <= 0) return;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        particlesRef.current = [];
      }

      ctx.clearRect(0, 0, w, h);

      const maxDrawH = h;
      const barClipTop = 0;
      const barMaxH    = h;

      if (now - lastHslRead > 1000) {
        cachedHsl   = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
        lastHslRead = now;
      }
      const hsl     = cachedHsl || "24.6 95% 53.1%";
      const analyser = analyserRef.current;
      const playing  = isPlayingRef.current;
      const style    = vizStyleRef.current;
      const mode     = vizModeRef.current;
      const t        = now / 1000;

      // ampFactor: 1.0 in Pure (or Ambient), scales 0.5–2.5 in Amplified based on volume
      const subMode   = reactiveSubModeRef.current;
      const audioEl   = document.querySelector("audio") as HTMLAudioElement | null;
      const audioVol  = audioEl?.volume ?? 1;
      const ampFactor = (mode === "reactive" && subMode === "amplified")
        ? Math.max(0.5, 0.5 + audioVol * 2.0)
        : 1.0;

      // ── Bars ───────────────────────────────────────────────────────────
      if (style === "bars") {
        if (barClipTop > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, barClipTop, w, h - barClipTop);
          ctx.clip();
        }
        // Fewer, wider bars on mobile — thick bold bars suit a small portrait screen
        const BAR_COUNT = currentPlatform === "android" ? 28 : 80;
        const gap       = currentPlatform === "android"
          ? Math.max(4, Math.round(5 * dpr))
          : Math.max(2, Math.round(2 * dpr));
        const barW      = Math.max(1, Math.floor((w - (BAR_COUNT - 1) * gap) / BAR_COUNT));

        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0,    `hsl(${hsl} / 0.92)`);
        grad.addColorStop(0.55, `hsl(${hsl} / 0.65)`);
        grad.addColorStop(1,    `hsl(${hsl} / 0.28)`);
        ctx.fillStyle = grad;

        if (mode === "reactive" && analyser) {
          const binCount = analyser.frequencyBinCount;
          if (freqDataRef.current.length !== binCount) freqDataRef.current = new Uint8Array(binCount);
          if (playing) analyser.getByteFrequencyData(freqDataRef.current);
          const usable = Math.floor(binCount * 0.75);
          const step   = Math.max(1, Math.floor(usable / BAR_COUNT));
          ctx.shadowColor = `hsl(${hsl})`;
          for (let i = 0; i < BAR_COUNT; i++) {
            let sum = 0;
            for (let k = 0; k < step; k++) sum += freqDataRef.current[i * step + k] ?? 0;
            const raw  = sum / (step * 255);
            const norm = Math.min(1, raw * ampFactor);
            const bh   = Math.max(2 * dpr, Math.round(norm * barMaxH));
            ctx.shadowBlur = norm > 0.45 ? norm * 45 * dpr : 0;
            ctx.fillRect(i * (barW + gap), h - bh, barW, bh);
          }
          ctx.shadowBlur = 0;
        } else {
          // Ambient: intensity-controlled layered sine
          const ic = AMBIENT_CFG[ambientIntensityRef.current];
          for (let i = 0; i < BAR_COUNT; i++) {
            const phase = (i / BAR_COUNT) * Math.PI * 4;
            const norm  = ic.barBase
              + ic.barAmp1 * (0.5 + 0.5 * Math.sin(phase + t * ic.barT1))
              + ic.barAmp2 * (0.5 + 0.5 * Math.abs(Math.sin(phase * 0.5 + t * ic.barT2)));
            const bh = Math.max(4 * dpr, Math.round(norm * barMaxH));
            ctx.fillRect(i * (barW + gap), h - bh, barW, bh);
          }
        }
        if (barClipTop > 0) ctx.restore();
      }

      // ── Wave ───────────────────────────────────────────────────────────
      else if (style === "wave") {
        ctx.beginPath();

        if (mode === "reactive" && analyser) {
          const fftSize  = analyser.fftSize;
          const binCount = analyser.frequencyBinCount;
          if (tdDataRef.current.length  !== fftSize)  tdDataRef.current  = new Uint8Array(fftSize);
          if (freqDataRef.current.length !== binCount) freqDataRef.current = new Uint8Array(binCount);
          if (playing) {
            analyser.getByteTimeDomainData(tdDataRef.current);
            analyser.getByteFrequencyData(freqDataRef.current);
          } else {
            tdDataRef.current.fill(128);
            freqDataRef.current.fill(0);
          }

          let bassSum = 0;
          const bassLen = Math.min(6, binCount);
          for (let i = 0; i < bassLen; i++) bassSum += freqDataRef.current[i];
          const bassEnergy = playing ? bassSum / (bassLen * 255) : 0;
          const amplitude  = maxDrawH * (0.40 + bassEnergy * 0.20 * ampFactor);

          ctx.strokeStyle = `hsl(${hsl} / 0.92)`;
          ctx.lineWidth   = Math.max(2, 3.5 * dpr);
          ctx.shadowColor = `hsl(${hsl})`;
          ctx.shadowBlur  = Math.min(80, 20 + bassEnergy * 35 * ampFactor) * dpr;

          const data   = tdDataRef.current;
          const sliceW = w / data.length;
          for (let i = 0; i < data.length; i++) {
            const deviation = (data[i] - 128) / 128.0;
            const y = h / 2 + deviation * amplitude;
            i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sliceW, y);
          }
          ctx.lineTo(w, h / 2);
        } else {
          // Ambient: intensity-controlled sine waves
          const ic = AMBIENT_CFG[ambientIntensityRef.current];
          ctx.strokeStyle = `hsl(${hsl} / 0.88)`;
          ctx.lineWidth   = Math.max(1.5, 2.5 * dpr);
          ctx.shadowColor = `hsl(${hsl} / 0.55)`;
          ctx.shadowBlur  = 16 * dpr;
          const PTS    = 256;
          const sliceW = w / PTS;
          for (let i = 0; i <= PTS; i++) {
            const x = i * sliceW;
            const y = h / 2
              + Math.sin(i / PTS * Math.PI * 6  + t * ic.wT1) * maxDrawH * ic.wA1
              + Math.sin(i / PTS * Math.PI * 3  + t * ic.wT2) * maxDrawH * ic.wA2
              + Math.sin(i / PTS * Math.PI * 12 + t * ic.wT3) * maxDrawH * ic.wA3;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── Particles ──────────────────────────────────────────────────────
      else {
        if (!particlesRef.current.length) {
          particlesRef.current = Array.from({ length: 120 }, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 1.5 + 0.4;
            return {
              x: w / 2, y: h / 2,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              baseSpeed: speed, size: Math.random() * 2.5 + 0.8,
              alpha: Math.random(), decay: 0.003 + Math.random() * 0.004,
            };
          });
        }

        const parts = particlesRef.current;

        if (mode === "reactive" && analyser) {
          const binCount = analyser.frequencyBinCount;
          if (freqDataRef.current.length !== binCount) freqDataRef.current = new Uint8Array(binCount);
          if (playing) analyser.getByteFrequencyData(freqDataRef.current);

          let bassSum = 0;
          for (let i = 0; i < 6; i++) bassSum += freqDataRef.current[i];
          const bassAvg    = playing ? bassSum / 6 : 0;
          const bassEnergy = bassAvg / 255;

          let totalSum = 0;
          const energyLen = Math.floor(binCount * 0.5);
          for (let i = 0; i < energyLen; i++) totalSum += freqDataRef.current[i];
          const overallEnergy = playing ? totalSum / (energyLen * 255) : 0;

          // Scale energies by ampFactor so Pure/Amplified affects thresholds + counts
          const effectiveBass    = Math.min(1, bassEnergy    * ampFactor);
          const effectiveOverall = Math.min(1, overallEnergy * ampFactor);

          const isBassHit   = effectiveBass > 200 / 255;   // only strong beats
          const speedMult   = 1 + effectiveBass * 9;
          const targetCount = Math.round(60 + effectiveOverall * 90); // max 150

          const spawnBatch = Math.min(10, Math.max(0, targetCount - parts.length));
          for (let s = 0; s < spawnBatch; s++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = isBassHit ? (Math.random() * 5 + 3) : (Math.random() * 2 + 0.5);
            parts.push({
              x: w / 2, y: h / 2,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              baseSpeed: speed,
              size: isBassHit ? Math.random() * 12 + 2 : Math.random() * 3 + 0.5,
              alpha: 1.0,
              decay: isBassHit ? 0.010 + Math.random() * 0.010 : 0.004 + Math.random() * 0.005,
            });
          }

          const currentMult = isBassHit ? speedMult : 1 + effectiveOverall * 3;

          for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            p.x += p.vx * currentMult;
            p.y += p.vy * currentMult;
            p.alpha -= p.decay * (isBassHit ? 1.5 : 1);

            const outOfBounds = p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60;
            if (p.alpha <= 0 || outOfBounds) {
              if (parts.length > targetCount) { parts.splice(i, 1); continue; }
              const angle = Math.random() * Math.PI * 2;
              const speed = isBassHit ? (Math.random() * 5 + 3) : (Math.random() * 2 + 0.5);
              p.x = w / 2; p.y = h / 2;
              p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
              p.baseSpeed = speed;
              p.size = isBassHit ? Math.random() * 12 + 2 : Math.random() * 3 + 0.5;
              p.alpha = 1.0;
              p.decay = isBassHit ? 0.010 + Math.random() * 0.010 : 0.004 + Math.random() * 0.005;
            }

            const fi    = Math.floor((i / Math.max(1, parts.length - 1)) * Math.min(binCount - 1, energyLen - 1));
            const freq  = playing ? Math.min(1, freqDataRef.current[fi] / 255 * ampFactor) : 0;
            const size  = Math.max(0.5, (p.size + freq * 10) * dpr);
            const alpha = Math.min(0.95, p.alpha * (0.35 + freq * 0.65));
            if (alpha < 0.02) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${hsl} / ${alpha.toFixed(2)})`;
            ctx.fill();
          }
        } else {
          // Ambient: intensity-controlled particle drift
          const ic = AMBIENT_CFG[ambientIntensityRef.current];
          const targetCount = ic.pN;

          // Spawn toward target count (batched to avoid stutter)
          const toSpawn = Math.min(8, Math.max(0, targetCount - parts.length));
          for (let s = 0; s < toSpawn; s++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = ic.pSpMin + Math.random() * ic.pSpRange;
            parts.push({
              x: w / 2, y: h / 2,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              baseSpeed: speed, size: ic.pSzMin + Math.random() * ic.pSzRange,
              alpha: Math.random(), decay: 0.002,
            });
          }

          const boost = 1 + ic.pBA * Math.abs(Math.sin(t * ic.pBF));

          for (let i = parts.length - 1; i >= 0; i--) {
            const p    = parts[i];
            const freq = 0.05 + 0.1 * Math.abs(Math.sin(i * 0.3 + t * 0.5));
            p.x += p.vx * boost;
            p.y += p.vy * boost;
            const oob = p.x < -30 || p.x > w + 30 || p.y < -30 || p.y > h + 30;
            if (oob) {
              if (parts.length > targetCount) { parts.splice(i, 1); continue; }
              p.x = w / 2; p.y = h / 2;
              const a = Math.random() * Math.PI * 2;
              const speed = ic.pSpMin + Math.random() * ic.pSpRange;
              p.baseSpeed = speed;
              p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed;
              p.size  = ic.pSzMin + Math.random() * ic.pSzRange;
              p.alpha = Math.random();
            }
            const size  = (p.size + freq * 2) * dpr;
            const alpha = Math.min(0.85, 0.18 + freq * 0.6);
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${hsl} / ${alpha.toFixed(2)})`;
            ctx.fill();
          }
        }
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []); // stable — all live values accessed via refs

  // ── Style / mode cycling ──────────────────────────────────────────────────
  const cycleStyle = () => {
    const nx = STYLES[(STYLES.indexOf(vizStyleRef.current) + 1) % STYLES.length];
    setVizStyle(nx);
    try { localStorage.setItem("viz-fs-style", nx); } catch { /* ignore */ }
  };

  const toggleMode = () => {
    const nx: VizMode = vizModeRef.current === "ambient" ? "reactive" : "ambient";
    setVizMode(nx);
    try { localStorage.setItem("viz-fs-mode", nx); } catch { /* ignore */ }
  };

  const toggleReactiveSubMode = () => {
    const nx: ReactiveSubMode = reactiveSubModeRef.current === "pure" ? "amplified" : "pure";
    setReactiveSubMode(nx);
    try { localStorage.setItem("viz-fs-reactive-mode", nx); } catch { /* ignore */ }
  };

  const changeAmbientIntensity = (level: AmbientIntensity) => {
    setAmbientIntensity(level);
    particlesRef.current = []; // reset so they respawn immediately at new parameters
    try { localStorage.setItem("viz-fs-ambient-intensity", level); } catch { /* ignore */ }
  };

  const cover    = currentTrack ? trackCoverUrl(currentTrack) : undefined;
  const isMobile = currentPlatform === "android";

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black overflow-hidden"
      onMouseMove={showToolbar}
      style={{ cursor: toolbarVisible ? "default" : "none" }}
    >
      {/* Full-screen canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle dark veil */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />

      {/* Centre: album art → title → artist → playback controls */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        {currentTrack ? (
          <>
            <div
              className="rounded-2xl overflow-hidden shadow-[0_32px_96px_-8px_rgba(0,0,0,0.85)] pointer-events-none"
              style={isMobile
                ? { width: "min(45vw, 220px)", height: "min(45vw, 220px)" }
                : { width: 220, height: 220 }}
            >
              <AlbumCover
                src={cover}
                seed={currentTrack.title + currentTrack.artist}
                title={currentTrack.title}
                artist={currentTrack.artist}
                size="xl"
                className="w-full h-full"
              />
            </div>

            <div className="flex flex-col items-center gap-1 pointer-events-none">
              <p className={cn(
                "text-white font-semibold text-center drop-shadow-lg truncate",
                isMobile ? "text-xl max-w-[85vw]" : "text-2xl max-w-xl",
              )}>
                {currentTrack.title}
              </p>
              <p className="text-white/65 text-sm text-center drop-shadow">
                {currentTrack.artist}
              </p>
            </div>

            <div className={cn("flex items-center", isMobile ? "gap-6" : "gap-2.5")}>
              <button
                onClick={prev}
                className={cn("flex items-center justify-center rounded-full bg-white/12 active:bg-white/22 text-white transition-colors", isMobile ? "w-14 h-14" : "w-9 h-9")}
              >
                <SkipBack className={cn("fill-current", isMobile ? "w-6 h-6" : "w-4 h-4")} />
              </button>
              <button
                onClick={togglePlay}
                className={cn("flex items-center justify-center rounded-full bg-white/22 active:bg-white/32 text-white transition-colors", isMobile ? "w-16 h-16" : "w-10 h-10")}
              >
                {isPlaying
                  ? <Pause className={cn("fill-current", isMobile ? "w-7 h-7" : "w-5 h-5")} />
                  : <Play  className={cn("fill-current ml-0.5", isMobile ? "w-7 h-7" : "w-5 h-5")} />}
              </button>
              <button
                onClick={next}
                className={cn("flex items-center justify-center rounded-full bg-white/12 active:bg-white/22 text-white transition-colors", isMobile ? "w-14 h-14" : "w-9 h-9")}
              >
                <SkipForward className={cn("fill-current", isMobile ? "w-6 h-6" : "w-4 h-4")} />
              </button>
            </div>
          </>
        ) : (
          <p className="text-white/40 text-sm pointer-events-none">Nothing playing</p>
        )}
      </div>

      {/* Top toolbar — auto-hides after 3 s of no mouse movement */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 transition-all duration-300 ease-in-out",
          toolbarVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none",
        )}
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)",
          paddingBottom: 44,
          ...(isMobile ? { paddingTop: "env(safe-area-inset-top, 0px)" } : {}),
        }}
      >
        {isMobile ? (
          /* ── Mobile: single horizontally-scrollable row — never clips ──── */
          <div
            className="flex items-center gap-2 overflow-x-auto px-4 pt-4 pb-3"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <button
              onClick={onClose}
              className="flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-white/12 active:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              Exit
            </button>
            {vizMode === "reactive" && (
              <button
                onClick={toggleReactiveSubMode}
                className="flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-white/12 active:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
              >
                {reactiveSubMode === "pure"
                  ? <Gauge className="w-3.5 h-3.5 shrink-0" />
                  : <Flame className="w-3.5 h-3.5 shrink-0" />}
                {reactiveSubMode === "pure" ? "Pure" : "Amplified"}
              </button>
            )}
            <button
              onClick={toggleMode}
              className="flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-white/12 active:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
            >
              {vizMode === "ambient"
                ? <Wand2 className="w-3.5 h-3.5 shrink-0" />
                : <Zap   className="w-3.5 h-3.5 shrink-0" />}
              {vizMode === "ambient" ? "Ambient" : "Reactive"}
            </button>
            <button
              onClick={cycleStyle}
              className="flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-white/12 active:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
            >
              {vizStyle === "bars"      && <BarChart2 className="w-3.5 h-3.5 shrink-0" />}
              {vizStyle === "wave"      && <Activity  className="w-3.5 h-3.5 shrink-0" />}
              {vizStyle === "particles" && <Sparkles  className="w-3.5 h-3.5 shrink-0" />}
              {STYLE_LABELS[vizStyle]}
            </button>
            {vizMode === "ambient" && AMBIENT_INTENSITIES.map(level => (
              <button
                key={level}
                onClick={() => changeAmbientIntensity(level)}
                className={cn(
                  "flex-shrink-0 min-h-[44px] px-3 rounded-xl text-xs font-medium transition-colors backdrop-blur-sm",
                  ambientIntensity === level
                    ? "bg-white/30 text-white"
                    : "bg-white/10 active:bg-white/20 text-white/65",
                )}
              >
                {AMBIENT_INTENSITY_LABELS[level]}
              </button>
            ))}
          </div>
        ) : (
          /* ── Desktop: single-row layout ──────────────────────────────────── */
          <div className="flex items-center justify-between px-5 py-4">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/12 hover:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              Exit
              <span className="text-white/40 font-normal ml-0.5 text-[11px]">ESC</span>
            </button>
            <div className="flex items-center gap-2">
              {vizMode === "ambient" && (
                <div className="flex items-center gap-1">
                  {AMBIENT_INTENSITIES.map(level => (
                    <button
                      key={level}
                      onClick={() => changeAmbientIntensity(level)}
                      className={cn(
                        "h-8 px-2.5 rounded-lg text-xs font-medium transition-colors backdrop-blur-sm",
                        ambientIntensity === level
                          ? "bg-white/30 text-white"
                          : "bg-white/10 hover:bg-white/20 text-white/65 hover:text-white",
                      )}
                    >
                      {AMBIENT_INTENSITY_LABELS[level]}
                    </button>
                  ))}
                </div>
              )}
              {vizMode === "reactive" && (
                <button
                  onClick={toggleReactiveSubMode}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/12 hover:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
                >
                  {reactiveSubMode === "pure"
                    ? <Gauge className="w-3.5 h-3.5 shrink-0" />
                    : <Flame className="w-3.5 h-3.5 shrink-0" />}
                  {reactiveSubMode === "pure" ? "Pure" : "Amplified"}
                </button>
              )}
              <button
                onClick={toggleMode}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/12 hover:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
              >
                {vizMode === "ambient"
                  ? <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  : <Zap   className="w-3.5 h-3.5 shrink-0" />}
                {vizMode === "ambient" ? "Ambient" : "Reactive"}
              </button>
              <button
                onClick={cycleStyle}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/12 hover:bg-white/22 text-white text-xs font-medium transition-colors backdrop-blur-sm"
              >
                {vizStyle === "bars"      && <BarChart2 className="w-3.5 h-3.5 shrink-0" />}
                {vizStyle === "wave"      && <Activity  className="w-3.5 h-3.5 shrink-0" />}
                {vizStyle === "particles" && <Sparkles  className="w-3.5 h-3.5 shrink-0" />}
                {STYLE_LABELS[vizStyle]}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
