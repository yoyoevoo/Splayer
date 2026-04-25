import { useRef, useState } from "react";
import { Palette, RotateCcw, X, Wand2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme, BUILT_IN_THEMES } from "@/lib/theme-context";
import { AppTheme, buildUserThemeVars, isDarkColor } from "@/lib/themes";
import { cn } from "@/lib/utils";

interface AppearanceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ThemeCard({ theme, active, onClick, onDelete }: {
  theme: AppTheme;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
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
      <div className="w-full h-20" style={{ background: theme.previewBg }}>
        <div
          className="absolute left-0 top-0 bottom-0 w-7"
          style={{ background: theme.previewPanel, opacity: 0.9 }}
        />
        <div className="absolute left-9 top-3 right-3 space-y-1.5">
          <div className="h-1.5 rounded-full w-2/3 opacity-60" style={{ background: theme.previewPanel }} />
          <div className="h-1.5 rounded-full w-1/2 opacity-40" style={{ background: theme.previewPanel }} />
          <div className="h-1.5 rounded-full w-3/4 opacity-30" style={{ background: theme.previewPanel }} />
        </div>
        <div className="absolute bottom-3 left-9 right-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full shrink-0 shadow-md" style={{ background: theme.previewAccent }} />
            <div className="flex-1 h-1.5 rounded-full" style={{ background: theme.previewPanel, opacity: 0.5 }}>
              <div className="h-full w-1/3 rounded-full" style={{ background: theme.previewAccent }} />
            </div>
          </div>
        </div>
      </div>

      <div
        className="px-2.5 py-1.5 text-xs font-medium text-left truncate"
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

      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/50 hover:bg-red-500/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          aria-label="Delete theme"
          title="Delete this theme"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </button>
  );
}

function ColorSwatch({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={() => ref.current?.click()}
        className="relative w-8 h-8 rounded-lg border-2 border-card-border hover:border-primary/60 transition-colors shadow-sm overflow-hidden shrink-0"
        title={`Pick ${label}`}
      >
        <div className="absolute inset-0" style={{ background: value }} />
        <input
          ref={ref}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{value.toUpperCase()}</p>
      </div>
    </div>
  );
}

function MiniPreview({ bg, panel, text, accent }: {
  bg: string; panel: string; text: string; accent: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden border-2 border-card-border w-full" style={{ background: bg }}>
      <div className="relative h-24">
        <div className="absolute left-0 top-0 bottom-0 w-8" style={{ background: panel, opacity: 0.95 }} />
        <div className="absolute left-10 top-3 right-3 space-y-2">
          <div className="h-1.5 rounded-full w-3/4" style={{ background: text, opacity: 0.6 }} />
          <div className="h-1.5 rounded-full w-1/2" style={{ background: text, opacity: 0.4 }} />
          <div className="h-1.5 rounded-full w-2/3" style={{ background: text, opacity: 0.3 }} />
        </div>
        <div className="absolute bottom-3 left-10 right-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full shrink-0" style={{ background: accent }} />
            <div className="flex-1 h-1.5 rounded-full" style={{ background: panel, opacity: 0.5 }}>
              <div className="h-full w-2/5 rounded-full" style={{ background: accent }} />
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-1.5 text-[10px]" style={{ background: panel, color: text, opacity: 0.9 }}>
        Preview
      </div>
    </div>
  );
}

function CustomThemeCreator() {
  const { saveUserTheme } = useTheme();

  const [bg,     setBg]     = useState("#1a1a2e");
  const [panel,  setPanel]  = useState("#16213e");
  const [text,   setText]   = useState("#e2e8f0");
  const [accent, setAccent] = useState("#6366f1");
  const [name,   setName]   = useState("");

  const handleSave = () => {
    const trimmed = name.trim() || "My Theme";
    const id = `user-${Date.now()}`;
    const theme: AppTheme = {
      id,
      name: trimmed,
      isDark: isDarkColor(bg),
      previewBg: bg,
      previewPanel: panel,
      previewAccent: accent,
      vars: buildUserThemeVars(bg, panel, text, accent),
    };
    saveUserTheme(theme);
    setName("");
  };

  return (
    <div className="space-y-4 pt-2 border-t border-card-border">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Wand2 className="w-3.5 h-3.5" />
        Create Your Own Theme
      </p>

      <div className="flex gap-4">
        {/* Color pickers */}
        <div className="flex-1 space-y-3">
          <ColorSwatch label="Background" value={bg}     onChange={setBg}     />
          <ColorSwatch label="Panel"      value={panel}  onChange={setPanel}  />
          <ColorSwatch label="Text"       value={text}   onChange={setText}   />
          <ColorSwatch label="Accent"     value={accent} onChange={setAccent} />
        </div>

        {/* Live preview */}
        <div className="w-32 shrink-0">
          <MiniPreview bg={bg} panel={panel} text={text} accent={accent} />
        </div>
      </div>

      {/* Name + save */}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder="Theme name…"
          maxLength={32}
          className="flex-1 h-8 px-3 rounded-lg border border-card-border bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button
          size="sm"
          onClick={handleSave}
          className="gap-1.5 shrink-0"
          title="Save and apply this theme"
        >
          <Plus className="w-3.5 h-3.5" />
          Save Theme
        </Button>
      </div>
    </div>
  );
}

export function AppearanceDialog({ open, onOpenChange }: AppearanceDialogProps) {
  const {
    themeId,
    customAccent,
    userThemes,
    setTheme,
    setCustomAccent,
    deleteUserTheme,
    currentAccentHex,
  } = useTheme();
  const colorInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            Appearance
          </DialogTitle>
          <DialogDescription>
            Choose a theme and accent color. Changes apply instantly and are saved automatically.
          </DialogDescription>
        </DialogHeader>

        {/* ── Theme grid (built-in + user) ──────────────────────────────── */}
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
            {userThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={themeId === theme.id}
                onClick={() => setTheme(theme.id)}
                onDelete={() => deleteUserTheme(theme.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Accent color picker ────────────────────────────────────────── */}
        <div className="space-y-3 pt-2 border-t border-card-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Accent Color</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => colorInputRef.current?.click()}
              className="relative w-10 h-10 rounded-xl border-2 border-card-border hover:border-primary/60 transition-colors shadow-sm overflow-hidden shrink-0"
              title="Pick accent color"
              aria-label="Pick accent color"
            >
              <div className="absolute inset-0" style={{ background: currentAccentHex }} />
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

        {/* ── Custom theme creator ───────────────────────────────────────── */}
        <CustomThemeCreator />
      </DialogContent>
    </Dialog>
  );
}
