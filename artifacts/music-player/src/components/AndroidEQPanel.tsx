import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EQ_BANDS, EQ_PRESETS, usePlayer } from "@/lib/player-context";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_MIN = -12;
const DB_MAX = 12;
const PRESET_NAMES = Object.keys(EQ_PRESETS);

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function AndroidEQPanel({ open, onOpenChange }: Props) {
  const { eqGains, eqPreset, setEqGain, applyEqPreset } = usePlayer();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-5">
        <DialogHeader>
          <DialogTitle className="text-base">Equalizer</DialogTitle>
        </DialogHeader>

        {/* dB scale hint */}
        <div className="flex justify-between text-[10px] text-muted-foreground px-1 mb-1">
          <span>+{DB_MAX}dB</span>
          <span>0</span>
          <span>{DB_MIN}dB</span>
        </div>

        {/* 5 vertical sliders */}
        <div className="flex justify-around items-center gap-1">
          {EQ_BANDS.map(({ label }, i) => (
            <div key={label} className="flex flex-col items-center gap-2">
              {/* current dB value */}
              <span className="text-[10px] tabular-nums text-muted-foreground min-w-[28px] text-center">
                {eqGains[i] > 0 ? `+${eqGains[i]}` : String(eqGains[i])}
              </span>

              {/* Vertical slider via CSS rotate — more reliable than writing-mode
                  across Android WebView versions. rotate(-90deg) maps:
                  drag-UP → RIGHT on original slider → value increases.
                  TOP = max, BOTTOM = min. */}
              <div style={{ position: "relative", width: "1.75rem", height: "8rem", flexShrink: 0 }}>
                <input
                  type="range"
                  min={DB_MIN}
                  max={DB_MAX}
                  step={1}
                  value={eqGains[i]}
                  onChange={(e) => setEqGain(i, Number(e.target.value))}
                  style={{
                    position:        "absolute",
                    left:            "50%",
                    top:             "50%",
                    width:           "8rem",
                    height:          "1.5rem",
                    margin:          0,
                    padding:         0,
                    transform:       "translate(-50%, -50%) rotate(-90deg)",
                    cursor:          "pointer",
                    accentColor:     "hsl(var(--primary))",
                  }}
                  aria-label={`${label} gain`}
                />
              </div>

              {/* frequency label */}
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-muted-foreground text-center">-12dB — +12dB</div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5 justify-center pt-3">
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => applyEqPreset(name)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                eqPreset === name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-card-border hover:border-primary/50",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
