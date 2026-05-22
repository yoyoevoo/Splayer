import { useState } from "react";
import { cn } from "@/lib/utils";
import { EQ_BANDS, EQ_PRESETS, REVERB_PRESETS, usePlayer } from "@/lib/player-context";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EQPanelProps {
  trigger: React.ReactNode;
}

type Tab = "eq" | "reverb";

export function EQPanel({ trigger }: EQPanelProps) {
  const {
    eqGains, eqPreset, setEqGain, applyEqPreset,
    reverbMix, reverbDecay, reverbPreset,
    setReverbMix, setReverbDecay, applyReverbPreset,
  } = usePlayer();

  const [tab, setTab] = useState<Tab>("eq");

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 overflow-hidden">

        {/* ── Tab strip ── */}
        <div className="flex border-b border-border text-sm">
          {(["eq", "reverb"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 font-medium tracking-wide transition-colors",
                tab === t
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "eq" ? "EQ" : "Reverb"}
            </button>
          ))}
        </div>

        {/* ── EQ tab ── */}
        {tab === "eq" && (
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-wide">Equalizer</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{eqPreset}</span>
                <button
                  type="button"
                  onClick={() => applyEqPreset("Flat")}
                  className="text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  title="Reset all bands to 0 dB"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(EQ_PRESETS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyEqPreset(name)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                    eqPreset === name
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Band sliders */}
            <div className="flex items-end justify-between gap-2 pt-2">
              {EQ_BANDS.map((band, i) => (
                <div key={band.freq} className="flex flex-col items-center gap-2 flex-1">
                  <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-center leading-none">
                    {eqGains[i] > 0 ? "+" : ""}{Math.round(eqGains[i])}
                  </span>
                  <div className="relative flex items-center justify-center" style={{ height: 110, width: 28 }}>
                    <Slider
                      orientation="vertical"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={[eqGains[i]]}
                      onValueChange={([v]) => setEqGain(i, v)}
                      className="h-full"
                      aria-label={`${band.label} gain`}
                    />
                  </div>
                  <div className="w-4 h-px bg-border opacity-60" />
                  <span className="text-[10px] text-muted-foreground leading-none">{band.label}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between text-[9px] text-muted-foreground/50 px-0.5">
              <span>-12dB</span>
              <span>0</span>
              <span>+12dB</span>
            </div>
          </div>
        )}

        {/* ── Reverb tab ── */}
        {tab === "reverb" && (
          <div className="p-4 space-y-5">
            {/* Presets */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Preset
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(REVERB_PRESETS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyReverbPreset(name)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                      reverbPreset === name
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
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
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Mix
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(reverbMix * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[reverbMix]}
                onValueChange={([v]) => {
                  setReverbMix(v);
                  // If user moves mix away from a preset, clear preset label
                }}
                aria-label="Reverb mix (wet/dry)"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground/50">
                <span>Dry</span>
                <span>Wet</span>
              </div>
            </div>

            {/* Decay slider (only meaningful when mix > 0) */}
            <div className={cn("space-y-2 transition-opacity", reverbMix === 0 && "opacity-40 pointer-events-none")}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Decay
                </p>
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

      </PopoverContent>
    </Popover>
  );
}
