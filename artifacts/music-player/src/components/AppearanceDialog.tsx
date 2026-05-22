import { useRef, useState, useEffect } from "react";
import { ImageIcon, Palette, Plus, RotateCcw, Trash2, Wand2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme, BUILT_IN_THEMES, FONTS } from "@/lib/theme-context";
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
        "relative flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-150 cursor-pointer group",
        "hover:scale-[1.03] active:scale-[0.98]",
        active
          ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/20"
          : "border-card-border hover:border-primary/50",
      )}
      aria-label={`Select ${theme.name} theme`}
    >
      {/* Preview area — h-14 on mobile, h-24 on sm+ */}
      <div className="relative w-full h-14 sm:h-24 shrink-0" style={{ background: theme.previewBg }}>
        <div
          className="absolute left-0 top-0 bottom-0 w-5 sm:w-7"
          style={{ background: theme.previewPanel, opacity: 0.9 }}
        />
        <div className="absolute left-6 sm:left-9 top-2 sm:top-3 right-2 sm:right-3 space-y-1 sm:space-y-1.5">
          <div className="h-1 sm:h-1.5 rounded-full w-2/3 opacity-60" style={{ background: theme.previewPanel }} />
          <div className="h-1 sm:h-1.5 rounded-full w-1/2 opacity-40" style={{ background: theme.previewPanel }} />
          <div className="h-1 sm:h-1.5 rounded-full w-3/4 opacity-30" style={{ background: theme.previewPanel }} />
        </div>
        <div className="absolute bottom-2 sm:bottom-3 left-6 sm:left-9 right-2 sm:right-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-3 h-3 sm:w-5 sm:h-5 rounded-full shrink-0 shadow-md" style={{ background: theme.previewAccent }} />
            <div className="flex-1 h-1 sm:h-1.5 rounded-full" style={{ background: theme.previewPanel, opacity: 0.5 }}>
              <div className="h-full w-1/3 rounded-full" style={{ background: theme.previewAccent }} />
            </div>
          </div>
        </div>
      </div>

      {/* Label — h-7 on mobile, h-8 on sm+ */}
      <div
        className="h-7 sm:h-8 px-2 sm:px-2.5 flex items-center shrink-0 min-w-0"
        style={{
          background: theme.previewPanel,
          color: theme.id === "light" ? "#1e293b" : "#f1f5f9",
        }}
      >
        <span className="text-[10px] sm:text-xs font-medium truncate w-full text-left">{theme.name}</span>
      </div>

      {active && (
        <div
          className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-3 h-3 sm:w-4 sm:h-4 rounded-full flex items-center justify-center shadow"
          style={{ background: theme.previewAccent }}
        >
          <svg viewBox="0 0 12 12" className="w-2 h-2 sm:w-2.5 sm:h-2.5" fill="none" stroke="white" strokeWidth="2">
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
  const [hexInput, setHexInput] = useState(value.toUpperCase());

  useEffect(() => {
    setHexInput(value.toUpperCase());
  }, [value]);

  const handleHexInput = (raw: string) => {
    const val = raw.startsWith("#") ? raw : "#" + raw;
    setHexInput(val.toUpperCase());
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) onChange(val);
  };

  const handleHexBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput)) setHexInput(value.toUpperCase());
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => ref.current?.click()}
        className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg border-2 border-card-border hover:border-primary/60 transition-colors shadow-sm overflow-hidden shrink-0"
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
        <p className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">{label}</p>
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexInput(e.target.value)}
          onBlur={handleHexBlur}
          maxLength={7}
          spellCheck={false}
          className="w-20 text-[9px] sm:text-[10px] font-mono text-muted-foreground bg-transparent border-b border-card-border focus:border-primary focus:outline-none"
          aria-label={`${label} hex color`}
        />
      </div>
    </div>
  );
}

function MiniPreview({ bg, panel, text, accent }: {
  bg: string; panel: string; text: string; accent: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden border-2 border-card-border w-full" style={{ background: bg }}>
      <div className="relative h-16 sm:h-24">
        <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8" style={{ background: panel, opacity: 0.95 }} />
        <div className="absolute left-8 sm:left-10 top-2 sm:top-3 right-2 sm:right-3 space-y-1.5 sm:space-y-2">
          <div className="h-1 sm:h-1.5 rounded-full w-3/4" style={{ background: text, opacity: 0.6 }} />
          <div className="h-1 sm:h-1.5 rounded-full w-1/2" style={{ background: text, opacity: 0.4 }} />
          <div className="h-1 sm:h-1.5 rounded-full w-2/3" style={{ background: text, opacity: 0.3 }} />
        </div>
        <div className="absolute bottom-2 sm:bottom-3 left-8 sm:left-10 right-2 sm:right-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full shrink-0" style={{ background: accent }} />
            <div className="flex-1 h-1 sm:h-1.5 rounded-full" style={{ background: panel, opacity: 0.5 }}>
              <div className="h-full w-2/5 rounded-full" style={{ background: accent }} />
            </div>
          </div>
        </div>
      </div>
      <div className="px-2 py-1 sm:px-3 sm:py-1.5 text-[9px] sm:text-[10px]" style={{ background: panel, color: text, opacity: 0.9 }}>
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
    <div className="space-y-3 pt-2 border-t border-card-border">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Wand2 className="w-3.5 h-3.5" />
        Create Your Own Theme
      </p>

      <div className="flex gap-3">
        {/* Color pickers in 2×2 grid */}
        <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <ColorSwatch label="Background" value={bg}     onChange={setBg}     />
          <ColorSwatch label="Panel"      value={panel}  onChange={setPanel}  />
          <ColorSwatch label="Text"       value={text}   onChange={setText}   />
          <ColorSwatch label="Accent"     value={accent} onChange={setAccent} />
        </div>

        {/* Live preview */}
        <div className="w-20 sm:w-28 shrink-0">
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
          className="gap-1 shrink-0 px-2.5 sm:px-3"
          title="Save and apply this theme"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Save Theme</span>
          <span className="sm:hidden">Save</span>
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
    wallpaper,
    wallpaperBlur,
    wallpaperOpacity,
    setWallpaper,
    setWallpaperBlur,
    setWallpaperOpacity,
    songColorTheme,
    setSongColorTheme,
    animatedTransitions,
    setAnimatedTransitions,
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
    customFont,
    setCustomFont,
  } = useTheme();
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const handleWallpaperChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setWallpaper(result);
    };
    reader.readAsDataURL(file);
  };
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [hexInput, setHexInput] = useState(currentAccentHex.toUpperCase());

  useEffect(() => {
    setHexInput(currentAccentHex.toUpperCase());
  }, [currentAccentHex]);

  const handleHexInput = (raw: string) => {
    const val = raw.startsWith("#") ? raw : "#" + raw;
    setHexInput(val.toUpperCase());
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) setCustomAccent(val);
  };

  const handleHexBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput)) setHexInput(currentAccentHex.toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            Appearance
          </DialogTitle>
        </DialogHeader>

        {/* ── Theme grid ────────────────────────────────────────────────── */}
        <div className="space-y-2 sm:space-y-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Theme</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
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
        <div className="space-y-2 sm:space-y-3 pt-2 border-t border-card-border">
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
              <input
                type="text"
                value={hexInput}
                onChange={(e) => handleHexInput(e.target.value)}
                onBlur={handleHexBlur}
                maxLength={7}
                spellCheck={false}
                className="w-24 text-xs font-mono text-muted-foreground bg-transparent border-b border-card-border focus:border-primary focus:outline-none"
                aria-label="Hex color code"
              />
            </div>

            {customAccent && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-muted-foreground hover:text-foreground shrink-0 px-2"
                onClick={() => setCustomAccent(null)}
                title="Reset to theme default accent"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            )}
          </div>

          <p className="hidden sm:block text-xs text-muted-foreground leading-relaxed">
            Applies to the play button, progress bar, active highlights, and icons.
          </p>
        </div>

        {/* ── Player Background ─────────────────────────────────────────── */}
        <div className="space-y-2 sm:space-y-3 pt-2 border-t border-card-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Player Background</p>
          <label className="flex items-center justify-between cursor-pointer gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Song Color Theme</p>
              <p className="text-xs text-muted-foreground">Tint background to match current album art</p>
            </div>
            <input
              type="checkbox"
              checked={songColorTheme}
              onChange={(e) => setSongColorTheme(e.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>
        </div>

        {/* ── Wallpaper ─────────────────────────────────────────────────── */}
        <div className="space-y-2 sm:space-y-3 pt-2 border-t border-card-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Wallpaper</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => wallpaperInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs sm:text-sm transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              {wallpaper ? "Change wallpaper" : "Set wallpaper"}
            </button>
            {wallpaper && (
              <button
                onClick={() => setWallpaper(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs sm:text-sm transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                Remove
              </button>
            )}
            <input ref={wallpaperInputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.avif" className="hidden" onChange={handleWallpaperChange} />
          </div>
          {wallpaper && (
            <div className="space-y-2 sm:space-y-3">
              <div className="w-full h-20 sm:h-24 rounded-xl overflow-hidden border border-card-border relative">
                <img src={wallpaper} alt="Wallpaper preview" className="w-full h-full object-cover" style={{ filter: `blur(${wallpaperBlur}px)`, opacity: wallpaperOpacity, transform: "scale(1.05)" }} />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Blur</p>
                  <p className="text-xs text-muted-foreground">{wallpaperBlur}px</p>
                </div>
                <input type="range" min={0} max={40} step={1} value={wallpaperBlur} onChange={(e) => setWallpaperBlur(Number(e.target.value))} className="w-full accent-primary" />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Opacity</p>
                  <p className="text-xs text-muted-foreground">{Math.round(wallpaperOpacity * 100)}%</p>
                </div>
                <input type="range" min={0.05} max={1} step={0.05} value={wallpaperOpacity} onChange={(e) => setWallpaperOpacity(Number(e.target.value))} className="w-full accent-primary" />
              </div>
            </div>
          )}
        </div>

        {/* ── Accessibility & Behaviour ──────────────────────────────────── */}
        <div className="space-y-2 sm:space-y-3 pt-2 border-t border-card-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Accessibility &amp; Behaviour</p>

          <label className="flex items-center justify-between cursor-pointer gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Animated Transitions</p>
              <p className="text-xs text-muted-foreground">Fade + slide when switching pages (200 ms)</p>
            </div>
            <input
              type="checkbox"
              checked={animatedTransitions}
              onChange={(e) => setAnimatedTransitions(e.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Reduce Motion</p>
              <p className="text-xs text-muted-foreground">Disable all animations — overrides transitions. Also respects OS preference.</p>
            </div>
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(e) => setReduceMotion(e.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>

          <label className={cn(
            "flex items-center justify-between cursor-pointer gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-all",
            highContrast
              ? "ring-2 ring-primary/70 bg-primary/8 shadow-[0_0_12px_2px_hsl(var(--primary)/0.18)]"
              : "hover:bg-muted/40",
          )}>
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                High Contrast
                {highContrast && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-primary text-primary-foreground px-1.5 py-0.5 rounded leading-none">
                    ON
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Stronger text, borders, and element contrast</p>
            </div>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => setHighContrast(e.target.checked)}
              className="accent-primary w-4 h-4 shrink-0"
            />
          </label>
        </div>

        {/* ── Font picker ────────────────────────────────────────────────── */}
        <div className="space-y-2 sm:space-y-3 pt-2 border-t border-card-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Font</p>
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map((font) => (
              <button
                key={font.name}
                onClick={() => setCustomFont(font.name)}
                style={{ fontFamily: font.family || "inherit" }}
                className={cn(
                  "h-9 px-3 rounded-lg text-sm border-2 transition-all text-left truncate",
                  customFont === font.name
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-card-border hover:border-primary/50 text-foreground",
                )}
              >
                {font.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Custom theme creator ───────────────────────────────────────── */}
        <CustomThemeCreator />
      </DialogContent>
    </Dialog>
  );
}
