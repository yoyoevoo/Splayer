import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EQ_BANDS, EQ_PRESETS, REVERB_PRESETS, usePlayer } from "@/lib/player-context";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_MIN = -12;
const DB_MAX = 12;
const PRESET_NAMES = Object.keys(EQ_PRESETS);
const REVERB_PRESET_NAMES = Object.keys(REVERB_PRESETS);

type Tab = "eq" | "reverb";

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function AndroidEQPanel({ open, onOpenChange }: Props) {
  const {
    eqGains, eqPreset, setEqGain, applyEqPreset,
    reverbMix, reverbDecay, reverbPreset,
    setReverbMix, setReverbDecay, applyReverbPreset,
  } = usePlayer();

  const [tab, setTab] = useState<Tab>("eq");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base">Audio</DialogTitle>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex border-b border-border text-sm mx-5 mt-3">
          {(["eq", "reverb"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 font-medium tracking-wide transition-colors",
                tab === t
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground",
              )}
            >
              {t === "eq" ? "EQ" : "Reverb"}
            </button>
          ))}
        </div>

        {/* ── EQ tab ── */}
        {tab === "eq" && (
          <div className="px-5 pb-5 pt-4 space-y-4">
            {/* dB scale hint */}
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>+{DB_MAX}dB</span>
              <span>0</span>
              <span>{DB_MIN}dB</span>
            </div>

            {/* 5 vertical sliders — Radix UI Slider with pointer events, touch-safe */}
            <div className="flex justify-around items-center gap-1">
              {EQ_BANDS.map(({ label }, i) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <span className="text-[10px] tabular-nums text-muted-foreground min-w-[28px] text-center">
                    {eqGains[i] > 0 ? `+${eqGains[i]}` : String(eqGains[i])}
                  </span>

                  {/* Radix Slider handles pointer & touch events natively */}
                  <div className="relative flex items-center justify-center" style={{ height: 112, width: 28 }}>
                    <Slider
                      orientation="vertical"
                      min={DB_MIN}
                      max={DB_MAX}
                      step={1}
                      value={[eqGains[i]]}
                      onValueChange={([v]) => setEqGain(i, v)}
                      className="h-full"
                      aria-label={`${label} gain`}
                    />
                  </div>

                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-muted-foreground text-center">-12dB — +12dB</div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              {PRESET_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyEqPreset(name)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    eqPreset === name
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-card-border",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Reverb tab ── */}
        {tab === "reverb" && (
          <div className="px-5 pb-5 pt-4 space-y-5">
            {/* Presets */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Preset
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REVERB_PRESET_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyReverbPreset(name)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                      reverbPreset === name
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-card-border",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Mix slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Mix</p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(reverbMix * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[reverbMix]}
                onValueChange={([v]) => setReverbMix(v)}
                aria-label="Reverb mix"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground/50">
                <span>Dry</span>
                <span>Wet</span>
              </div>
            </div>

            {/* Decay slider */}
            <div className={cn("space-y-2 transition-opacity", reverbMix === 0 && "opacity-40 pointer-events-none")}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Decay</p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {reverbDecay.toFixed(1)}s
                </span>
              </div>
              <Slider
                min={0.1}
                max={8}
                step={0.1}
                value={[reverbDecay]}
                onValueChange={([v]) => setReverbDecay(v)}
                aria-label="Reverb decay time"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground/50">
                <span>Short</span>
                <span>Long</span>
              </div>
            </div>

            {reverbMix === 0 && (
              <p className="text-[10px] text-muted-foreground/60 text-center -mt-2">
                Increase Mix to enable reverb
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
