import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/player-context";

const TOUR_KEY    = "splayer_tour_done";
const VIZ_TIP_KEY = "splayer_viz_tip_done";
const PAD    = 10;
const TW     = 300;
const TH     = 200;
const GAP    = 18;
const SPRING = { stiffness: 340, damping: 32, mass: 0.8 };

// ── Tour steps ──────────────────────────────────────────────────────────────

interface Step {
  selector: string;
  title: string;
  description: string;
  informational?: boolean;
}

const STEPS: Step[] = [
  {
    selector: '[data-testid="tab-library"]',
    title: "Your Library",
    description: "Your music lives here. Splayer scans your local files automatically.",
  },
  {
    selector: '[data-testid="input-search"]',
    title: "Search",
    description: "Search your library or find music on YouTube.",
  },
  {
    selector: '[data-testid="button-header-add"]',
    title: "Download from YouTube",
    description: "Click 'Add music' → 'From YouTube' to search and download any song or playlist directly into your library.",
  },
  {
    selector: '[data-testid="button-header-add"]',
    title: "Import from Spotify",
    description: "Click 'Add music' → 'From Spotify' to import your Spotify playlists and liked songs straight into Splayer.",
  },
  {
    selector: '[data-testid="player-controls"]',
    title: "Player Controls",
    description: "Play, pause, skip, shuffle and repeat.",
  },
  {
    selector: '[data-testid="button-eq"]',
    title: "Equalizer",
    description: "Open the equalizer to tune your sound with presets or manual sliders.",
  },
  {
    selector: "",
    informational: true,
    title: "Fullscreen Visualizer",
    description:
      "When a song is playing, switch to Full Player mode and click the expand icon on the album art to open the fullscreen visualizer — it reacts to your music in real time.",
  },
  {
    selector: '[data-testid="button-mini-player"]',
    title: "Mini Player",
    description: "Pop out a mini player so you can control music from anywhere on your desktop.",
  },
  {
    selector: '[data-testid="tab-podcasts"]',
    title: "Podcasts",
    description: "Subscribe to any podcast via RSS feed or import from YouTube. New episodes sync automatically.",
  },
  {
    selector: '[data-testid="tab-books"]',
    title: "Audiobooks",
    description: "Add local audiobook files or import from YouTube. Splayer remembers your position in each book automatically.",
  },
  {
    selector: '[data-testid="button-jump-to-current"]',
    title: "Jump to Current Song",
    description: "Lost track of what's playing? Click this button to instantly scroll your library to the current song.",
  },
  {
    selector: '[data-testid="button-settings"]',
    title: "Settings",
    description: "Customize startup, themes, and more.",
  },
];

// ── Placement helpers ────────────────────────────────────────────────────────

type Side = "top" | "bottom" | "left" | "right";

interface Rect { x: number; y: number; w: number; h: number }
interface Placement { side: Side; tx: number; ty: number; arrowOffset: number }

function place(r: Rect): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  const above   = r.y - PAD - GAP;
  const below   = vh - (r.y + r.h + PAD + GAP);
  const toLeft  = r.x - PAD - GAP;
  const toRight = vw - (r.x + r.w + PAD + GAP);

  let side: Side = "bottom";
  if      (below  >= TH) side = "bottom";
  else if (above  >= TH) side = "top";
  else if (toRight >= TW) side = "right";
  else if (toLeft  >= TW) side = "left";
  else side = "bottom";

  let tx = 0, ty = 0, arrowOffset = 0;

  if (side === "bottom") {
    tx = Math.max(12, Math.min(vw - TW - 12, cx - TW / 2));
    ty = r.y + r.h + PAD + GAP;
    arrowOffset = cx - tx;
  } else if (side === "top") {
    tx = Math.max(12, Math.min(vw - TW - 12, cx - TW / 2));
    ty = r.y - PAD - GAP - TH;
    arrowOffset = cx - tx;
  } else if (side === "right") {
    tx = r.x + r.w + PAD + GAP;
    ty = Math.max(12, Math.min(vh - TH - 12, cy - TH / 2));
    arrowOffset = cy - ty;
  } else {
    tx = r.x - PAD - GAP - TW;
    ty = Math.max(12, Math.min(vh - TH - 12, cy - TH / 2));
    arrowOffset = cy - ty;
  }

  return { side, tx, ty, arrowOffset };
}

// ── Arrow ────────────────────────────────────────────────────────────────────

function Arrow({ side, offset }: { side: Side; offset: number }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    background: "rgba(14,14,22,0.96)",
    transform: "rotate(45deg)",
  };

  if (side === "bottom") return (
    <div style={{ ...base, top: -5, left: Math.max(14, Math.min(TW - 24, offset - 5)),
      borderTop: "1px solid rgba(255,255,255,0.12)", borderLeft: "1px solid rgba(255,255,255,0.12)" }} />
  );
  if (side === "top") return (
    <div style={{ ...base, bottom: -5, left: Math.max(14, Math.min(TW - 24, offset - 5)),
      borderBottom: "1px solid rgba(255,255,255,0.12)", borderRight: "1px solid rgba(255,255,255,0.12)" }} />
  );
  if (side === "right") return (
    <div style={{ ...base, left: -5, top: Math.max(14, Math.min(TH - 24, offset - 5)),
      borderBottom: "1px solid rgba(255,255,255,0.12)", borderLeft: "1px solid rgba(255,255,255,0.12)" }} />
  );
  return (
    <div style={{ ...base, right: -5, top: Math.max(14, Math.min(TH - 24, offset - 5)),
      borderTop: "1px solid rgba(255,255,255,0.12)", borderRight: "1px solid rgba(255,255,255,0.12)" }} />
  );
}

// ── Confetti burst ───────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "hsl(var(--primary))", "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa",
];

function Confetti() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    angle: (i / 18) * 360,
    dist: 80 + (i % 3) * 30,
    delay: (i % 4) * 0.05,
  }));

  return (
    <>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute", width: 6, height: 6,
            borderRadius: i % 2 === 0 ? "50%" : 1,
            background: p.color, top: "50%", left: "50%",
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.dist,
            y: Math.sin((p.angle * Math.PI) / 180) * p.dist,
            opacity: 0, scale: 0,
          }}
          transition={{ duration: 0.9, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

// ── Shared card body (dots + nav buttons) ────────────────────────────────────

function CardNav({
  step, onPrev, onNext, onSkip,
}: {
  step: number;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-[5px] mb-4">
        {STEPS.map((_, i) => (
          <motion.div
            key={i}
            animate={{ width: i === step ? 16 : 6, opacity: i <= step ? 1 : 0.3 }}
            transition={{ duration: 0.25 }}
            style={{
              height: 5, borderRadius: 99,
              background: i === step
                ? "hsl(var(--primary))"
                : i < step ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>

      {/* Prev / Next */}
      <div className="flex items-center gap-2">
        {step > 0 ? (
          <button
            onClick={onPrev}
            className="flex items-center gap-0.5 px-3 py-1.5 rounded-lg text-[13px] text-white/50 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>
        ) : (
          <div className="w-16" />
        )}
        <div className="flex-1" />
        <button
          onClick={onNext}
          className={cn(
            "flex items-center gap-1 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors",
            "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {step >= STEPS.length - 1 ? "Finish" : "Next"}
          {step < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </>
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startTour() {
  window.dispatchEvent(new Event("splayer:tour-start"));
}

// ── Main tour component ──────────────────────────────────────────────────────

export function TourOverlay() {
  const [active,    setActive]    = useState(false);
  const [step,      setStep]      = useState(0);
  const [completed, setCompleted] = useState(false);
  const [target,    setTarget]    = useState<Rect | null>(null);

  const sx = useSpring(typeof window !== "undefined" ? window.innerWidth  / 2 - 100 : 0, SPRING);
  const sy = useSpring(typeof window !== "undefined" ? window.innerHeight / 2 - 50  : 0, SPRING);
  const sw = useSpring(200, SPRING);
  const sh = useSpring(100, SPRING);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => setActive(true), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const h = () => { setStep(0); setCompleted(false); setActive(true); };
    window.addEventListener("splayer:tour-start", h);
    return () => window.removeEventListener("splayer:tour-start", h);
  }, []);

  const measure = useCallback((idx: number) => {
    const s = STEPS[idx];
    if (!s || s.informational || !s.selector) { setTarget(null); return; }

    const el = document.querySelector(s.selector) as HTMLElement | null;
    if (!el) {
      sx.set(window.innerWidth  / 2 - 80);
      sy.set(window.innerHeight / 2 - 40);
      sw.set(160); sh.set(80);
      setTarget(null);
      return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      sx.set(r.left  - PAD); sy.set(r.top   - PAD);
      sw.set(r.width + PAD * 2); sh.set(r.height + PAD * 2);
      setTarget({ x: r.left, y: r.top, w: r.width, h: r.height });
    }, 80);
  }, [sx, sy, sw, sh]);

  useEffect(() => {
    if (active && !completed) {
      if (STEPS[step]?.informational) setTarget(null);
      else measure(step);
    }
  }, [active, step, completed, measure]);

  useEffect(() => {
    if (!active || completed || STEPS[step]?.informational) return;
    const h = () => measure(step);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [active, completed, step, measure]);

  const next = () => step >= STEPS.length - 1 ? setCompleted(true) : setStep(s => s + 1);
  const prev = () => step > 0 && setStep(s => s - 1);
  const skip = () => { localStorage.setItem(TOUR_KEY, "1"); setActive(false); };
  const done = () => { localStorage.setItem(TOUR_KEY, "1"); setActive(false); };

  if (!active) return null;

  const isInfo = !completed && !!STEPS[step]?.informational;

  const placement: Placement = (!completed && !isInfo && target)
    ? place(target)
    : { side: "bottom", tx: window.innerWidth / 2 - TW / 2, ty: window.innerHeight / 2 + 60, arrowOffset: TW / 2 };

  const tooltipEnter = placement.side === "top"    ? { y:  12 }
                     : placement.side === "bottom" ? { y: -12 }
                     : placement.side === "right"  ? { x: -12 }
                     : { x: 12 };
  const tooltipExit  = placement.side === "top"    ? { y: -8  }
                     : placement.side === "bottom" ? { y:  8  }
                     : placement.side === "right"  ? { x:  8  }
                     : { x: -8 };

  const cardBg = { background: "rgba(14,14,22,0.96)", backdropFilter: "blur(20px)" };

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{ position: "fixed", inset: 0, zIndex: 9990, pointerEvents: "all" }}
      >
        {!completed ? (
          isInfo ? (
            // ── Informational card — no spotlight, centered ──
            <div
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, scale: 0.94, y: -14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 14 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{ width: TW, zIndex: 9991 }}
                  className="rounded-2xl border border-white/[0.08] shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <div style={cardBg} className="rounded-2xl p-5">
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
                        {step + 1} of {STEPS.length}
                      </span>
                      <button
                        onClick={skip}
                        className="text-[11px] text-white/30 hover:text-white/55 transition-colors leading-none"
                      >
                        Skip tour
                      </button>
                    </div>

                    {/* Title */}
                    <p className="text-[15px] font-semibold text-white mb-3 leading-snug">
                      {STEPS[step].title}
                    </p>

                    {/* Icon illustration */}
                    <div className="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08]">
                      <div className="w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center flex-shrink-0">
                        <Maximize2 className="w-3.5 h-3.5 text-white/70" />
                      </div>
                      <span className="text-[11px] text-white/40 leading-snug">
                        Tap this icon on the album art in Full Player
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-[13px] text-white/55 leading-relaxed mb-5">
                      {STEPS[step].description}
                    </p>

                    <CardNav step={step} onPrev={prev} onNext={next} onSkip={skip} />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            // ── Regular step — spotlight + anchored tooltip ──
            <>
              {/* Spotlight cutout */}
              <motion.div
                style={{
                  position: "absolute", left: sx, top: sy, width: sw, height: sh,
                  borderRadius: 12, pointerEvents: "none",
                  boxShadow: [
                    "0 0 0 9999px rgba(0,0,0,0.68)",
                    "0 0 0 2px hsl(var(--primary) / 0.7)",
                    "0 0 28px 6px hsl(var(--primary) / 0.18)",
                  ].join(", "),
                }}
              />

              {/* Tooltip card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, scale: 0.94, ...tooltipEnter }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, ...tooltipExit }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: "absolute",
                    left: placement.tx, top: placement.ty,
                    width: TW, zIndex: 9991,
                  }}
                  className="rounded-2xl border border-white/[0.08] shadow-2xl overflow-visible"
                  onClick={e => e.stopPropagation()}
                >
                  {target && <Arrow side={placement.side} offset={placement.arrowOffset} />}

                  <div style={cardBg} className="rounded-2xl p-5">
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
                        {step + 1} of {STEPS.length}
                      </span>
                      <button
                        onClick={skip}
                        className="text-[11px] text-white/30 hover:text-white/55 transition-colors leading-none"
                      >
                        Skip tour
                      </button>
                    </div>

                    <p className="text-[15px] font-semibold text-white mb-1.5 leading-snug">
                      {STEPS[step].title}
                    </p>
                    <p className="text-[13px] text-white/55 leading-relaxed mb-5">
                      {STEPS[step].description}
                    </p>

                    <CardNav step={step} onPrev={prev} onNext={next} onSkip={skip} />
                  </div>
                </motion.div>
              </AnimatePresence>
            </>
          )
        ) : (
          // ── Completion screen ──
          <div
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
            className="fixed inset-0 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative rounded-3xl border border-white/[0.08] shadow-2xl p-10 text-center"
              style={{ background: "rgba(14,14,22,0.97)", backdropFilter: "blur(24px)", width: 340 }}
            >
              <div className="relative flex items-center justify-center w-24 h-24 mx-auto mb-6 pointer-events-none">
                <Confetti />
                {[0, 1].map(i => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-primary/40"
                    initial={{ width: 36, height: 36, opacity: 0.9 }}
                    animate={{ width: 90 + i * 28, height: 90 + i * 28, opacity: 0 }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                  />
                ))}
                <span className="text-5xl relative z-10 select-none">🎉</span>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2 leading-tight">You're all set!</h2>
              <p className="text-[13px] text-white/45 leading-relaxed mb-8 mx-4">
                Drop your music files or let Splayer scan your library to get started.
              </p>
              <button
                onClick={done}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-[14px] hover:opacity-90 transition-opacity"
              >
                Start listening
              </button>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ── VizTip — one-time pulsing hint on the fullscreen visualizer button ────────

export function VizTip() {
  const { currentTrack } = usePlayer();
  const prevTrack = useRef<typeof currentTrack>(null);
  const [visible,  setVisible]  = useState(false);
  const [btnRect,  setBtnRect]  = useState<DOMRect | null>(null);

  useEffect(() => {
    const prev = prevTrack.current;
    prevTrack.current = currentTrack;

    // Only fires on the null → track transition
    if (prev !== null || currentTrack === null) return;
    if (localStorage.getItem(VIZ_TIP_KEY)) return;

    const btn = document.querySelector('[data-testid="button-fs-visualizer"]') as HTMLElement | null;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    setBtnRect(r);
    setVisible(true);

    const t = setTimeout(() => {
      localStorage.setItem(VIZ_TIP_KEY, "1");
      setVisible(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [currentTrack]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      localStorage.setItem(VIZ_TIP_KEY, "1");
      setVisible(false);
    };
    window.addEventListener("pointerdown", dismiss, { once: true });
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [visible]);

  if (!visible || !btnRect) return null;

  const cx   = btnRect.left + btnRect.width  / 2;
  const cy   = btnRect.top  + btnRect.height / 2;
  const size = Math.max(btnRect.width, btnRect.height);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9980, pointerEvents: "none" }}>
      {/* Pulsing rings centered on the button */}
      {[0, 1].map(i => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            left: cx, top: cy,
            x: "-50%", y: "-50%",
            width: size + 6, height: size + 6,
            borderRadius: "50%",
            border: "1.5px solid hsl(var(--primary) / 0.75)",
          }}
          initial={{ scale: 1, opacity: 0.85 }}
          animate={{ scale: 1.7 + i * 0.25, opacity: 0 }}
          transition={{
            duration: 1.3, repeat: Infinity, repeatType: "loop",
            delay: i * 0.55, ease: "easeOut",
          }}
        />
      ))}

      {/* Glowing border around the button */}
      <div
        style={{
          position: "absolute",
          left: btnRect.left - 3, top: btnRect.top - 3,
          width: btnRect.width + 6, height: btnRect.height + 6,
          borderRadius: 99,
          boxShadow: [
            "0 0 0 1.5px hsl(var(--primary))",
            "0 0 10px 3px hsl(var(--primary) / 0.5)",
          ].join(", "),
        }}
      />

      {/* Tooltip bubble */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
        style={{
          position: "absolute",
          left: cx, top: btnRect.bottom + 8,
          x: "-50%",
          background: "rgba(14,14,22,0.96)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "5px 11px",
          whiteSpace: "nowrap",
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        Open fullscreen visualizer
        {/* Arrow pointing up toward the button */}
        <div style={{
          position: "absolute",
          top: -4, left: "50%",
          transform: "translateX(-50%) rotate(45deg)",
          width: 7, height: 7,
          background: "rgba(14,14,22,0.96)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
        }} />
      </motion.div>
    </div>
  );
}
