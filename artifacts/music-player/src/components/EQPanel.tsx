import { cn } from "@/lib/utils";
import { EQ_BANDS, EQ_PRESETS, usePlayer } from "@/lib/player-context";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EQPanelProps {
  trigger: React.ReactNode;
}

export function EQPanel({ trigger }: EQPanelProps) {
  const { eqGains, eqPreset, setEqGain, applyEqPreset } = usePlayer();

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-4 space-y-4"
      >
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
              {/* dB label */}
              <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-center leading-none">
                {eqGains[i] > 0 ? "+" : ""}{Math.round(eqGains[i])}
              </span>

              {/* Vertical slider — rendered as a rotated horizontal slider */}
              <div
                className="relative flex items-center justify-center"
                style={{ height: 110, width: 28 }}
              >
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

              {/* Zero tick mark */}
              <div className="w-4 h-px bg-border opacity-60" />

              {/* Frequency label */}
              <span className="text-[10px] text-muted-foreground leading-none">
                {band.label}
              </span>
            </div>
          ))}
        </div>

        {/* dB scale hint */}
        <div className="flex justify-between text-[9px] text-muted-foreground/50 px-0.5">
          <span>-12dB</span>
          <span>0</span>
          <span>+12dB</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
