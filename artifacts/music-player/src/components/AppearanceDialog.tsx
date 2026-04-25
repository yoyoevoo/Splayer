import { useRef } from "react";
import { Palette, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme, BUILT_IN_THEMES } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

interface AppearanceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ThemeCard({ theme, active, onClick }: {
  theme: typeof BUILT_IN_THEMES[0];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-xl overflow-hidden border-2 transition-all duration-150 cursor-pointer group",
        "hover:scale-[1.03] active:scale-[0.98]",
        active
          ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/20"
          : "border-card-border hover:border-primary/50",
      )}
      aria-label={`Select ${theme.name} theme`}
    >
      {/* Preview thumbnail */}
      <div
        className="w-full h-20"
        style={{ background: theme.previewBg }}
      >
        {/* Simulated sidebar strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-7"
          style={{ background: theme.previewPanel, opacity: 0.9 }}
        />
        {/* Simulated main content area */}
        <div className="absolute left-9 top-3 right-3 space-y-1.5">
          <div
            className="h-1.5 rounded-full w-2/3 opacity-60"
            style={{ background: theme.previewPanel }}
          />
          <div
            className="h-1.5 rounded-full w-1/2 opacity-40"
            style={{ background: theme.previewPanel }}
          />
          <div
            className="h-1.5 rounded-full w-3/4 opacity-30"
            style={{ background: theme.previewPanel }}
          />
        </div>
        {/* Accent dot + progress bar simulation */}
        <div className="absolute bottom-3 left-9 right-3">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full shrink-0 shadow-md"
              style={{ background: theme.previewAccent }}
            />
            <div className="flex-1 h-1.5 rounded-full" style={{ background: theme.previewPanel, opacity: 0.5 }}>
              <div
                className="h-full w-1/3 rounded-full"
                style={{ background: theme.previewAccent }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Label */}
      <div
        className="px-2.5 py-1.5 text-xs font-medium text-left"
        style={{
          background: theme.previewPanel,
          color: theme.id === "light" ? "#1e293b" : "#f1f5f9",
        }}
      >
        {theme.name}
      </div>

      {active && (
        <div
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow"
          style={{ background: theme.previewAccent }}
        >
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="2">
            <polyline points="2,6 5,9 10,3" />
          </svg>
        </div>
      )}
    </button>
  );
}

export function AppearanceDialog({ open, onOpenChange }: AppearanceDialogProps) {
  const { themeId, customAccent, setTheme, setCustomAccent, currentAccentHex } = useTheme();
  const colorInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            Appearance
          </DialogTitle>
          <DialogDescription>
            Choose a theme and accent color. Changes apply instantly and are saved automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Theme grid */}
        <div className="space-y-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Theme</p>
          <div className="grid grid-cols-3 gap-2.5">
            {BUILT_IN_THEMES.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={themeId === theme.id}
                onClick={() => setTheme(theme.id)}
              />
            ))}
          </div>
        </div>

        {/* Accent color picker */}
        <div className="space-y-3 pt-2 border-t border-card-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Accent Color</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => colorInputRef.current?.click()}
              className="relative w-10 h-10 rounded-xl border-2 border-card-border hover:border-primary/60 transition-colors shadow-sm overflow-hidden shrink-0"
              title="Pick accent color"
              aria-label="Pick accent color"
            >
              <div
                className="absolute inset-0"
                style={{ background: currentAccentHex }}
              />
              <input
                ref={colorInputRef}
                type="color"
                value={currentAccentHex}
                onChange={(e) => setCustomAccent(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                aria-label="Accent color picker"
              />
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground font-medium">
                {customAccent ? "Custom color" : "Theme default"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{currentAccentHex.toUpperCase()}</p>
            </div>

            {customAccent && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setCustomAccent(null)}
                title="Reset to theme default accent"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Applies to the play button, progress bar, active highlights, and icons.
            Click the color swatch to open the picker.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
