import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  accentFgFromHex,
  AppTheme,
  BUILT_IN_THEMES,
  getTheme,
  hexToHsl,
  hslToHex,
} from "./themes";

const LS_THEME        = "app-theme-id";
const LS_WALLPAPER    = "app-wallpaper";
const LS_WALL_BLUR    = "app-wallpaper-blur";
const LS_WALL_OPACITY = "app-wallpaper-opacity";
const LS_ACCENT       = "app-custom-accent";
const LS_SONG_COLOR   = "app-song-color-theme";
const LS_USER_THEMES  = "app-user-themes";
const LS_ANIM_TRANS   = "animated-transitions";
const LS_REDUCE_MOT   = "reduce-motion";
const LS_HIGH_CON     = "high-contrast";
const LS_FONT         = "custom-font";

export const FONTS = [
  { name: "Default",          family: "",                              url: "" },
  { name: "Inter",            family: "'Inter', sans-serif",          url: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" },
  { name: "Roboto",           family: "'Roboto', sans-serif",         url: "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" },
  { name: "Poppins",          family: "'Poppins', sans-serif",        url: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" },
  { name: "Nunito",           family: "'Nunito', sans-serif",         url: "https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700&display=swap" },
  { name: "JetBrains Mono",   family: "'JetBrains Mono', monospace",  url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap" },
  { name: "Playfair Display", family: "'Playfair Display', serif",    url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap" },
  { name: "Raleway",          family: "'Raleway', sans-serif",        url: "https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap" },
] as const;

function loadUserThemes(): AppTheme[] {
  try {
    const raw = localStorage.getItem(LS_USER_THEMES);
    return raw ? (JSON.parse(raw) as AppTheme[]) : [];
  } catch {
    return [];
  }
}

interface ThemeContextValue {
  themeId: string;
  customAccent: string | null;
  userThemes: AppTheme[];
  setTheme: (id: string) => void;
  setCustomAccent: (hex: string | null) => void;
  saveUserTheme: (theme: AppTheme) => void;
  deleteUserTheme: (id: string) => void;
  currentTheme: AppTheme;
  currentAccentHex: string;
  wallpaper: string | null;
  wallpaperBlur: number;
  wallpaperOpacity: number;
  setWallpaper: (url: string | null) => void;
  setWallpaperBlur: (v: number) => void;
  setWallpaperOpacity: (v: number) => void;
  songColorTheme: boolean;
  setSongColorTheme: (v: boolean) => void;
  applySongTheme: (vars: Record<string, string> | null) => void;
  animatedTransitions: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  customFont: string;
  effectiveReduceMotion: boolean;
  setAnimatedTransitions: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setCustomFont: (font: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: AppTheme, customAccent: string | null) {
  const root = document.documentElement;

  if (theme.isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  if (customAccent) {
    const hsl = hexToHsl(customAccent);
    const fg  = accentFgFromHex(customAccent);
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", hsl);
    root.style.setProperty("--sidebar-primary", hsl);
    root.style.setProperty("--sidebar-primary-foreground", fg);
    root.style.setProperty("--sidebar-ring", hsl);
    root.style.setProperty("--chart-1", hsl);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() =>
    localStorage.getItem(LS_THEME) ?? "dark",
  );
  const [customAccent, setCustomAccentState] = useState<string | null>(() =>
    localStorage.getItem(LS_ACCENT),
  );
  const [userThemes, setUserThemes] = useState<AppTheme[]>(loadUserThemes);
  const [wallpaper, setWallpaperState] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_WALLPAPER); } catch { return null; }
  });
  const [wallpaperBlur, setWallpaperBlurState] = useState<number>(() => {
    try { return Number(localStorage.getItem(LS_WALL_BLUR) ?? "10"); } catch { return 10; }
  });
  const [wallpaperOpacity, setWallpaperOpacityState] = useState<number>(() => {
    try { return Number(localStorage.getItem(LS_WALL_OPACITY) ?? "0.3"); } catch { return 0.3; }
  });
  const [songColorTheme, setSongColorThemeState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_SONG_COLOR) === "1"; } catch { return false; }
  });
  const [songThemeVars, setSongThemeVars] = useState<Record<string, string> | null>(null);
  const setSongColorTheme = (v: boolean) => {
    setSongColorThemeState(v);
    if (!v) setSongThemeVars(null);
    try { localStorage.setItem(LS_SONG_COLOR, v ? "1" : "0"); } catch {}
  };
  const applySongTheme = useCallback((vars: Record<string, string> | null) => {
    setSongThemeVars(vars);
  }, []);

  // ── New appearance settings ──────────────────────────────────────────────
  const [animatedTransitions, setAnimTransState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_ANIM_TRANS) !== "false"; } catch { return true; }
  });
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_REDUCE_MOT) === "true"; } catch { return false; }
  });
  const [highContrast, setHighContrastState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_HIGH_CON) === "true"; } catch { return false; }
  });
  const [customFont, setCustomFontState] = useState<string>(() => {
    try { return localStorage.getItem(LS_FONT) ?? "Default"; } catch { return "Default"; }
  });
  const [osReduceMotion, setOsReduceMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const h = (e: MediaQueryListEvent) => setOsReduceMotion(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const effectiveReduceMotion = reduceMotion || osReduceMotion;

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", highContrast);
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", effectiveReduceMotion);
  }, [effectiveReduceMotion]);

  useEffect(() => {
    const fontDef = FONTS.find(f => f.name === customFont);
    let link = document.getElementById("app-font-link") as HTMLLinkElement | null;
    if (fontDef?.url) {
      if (!link) {
        link = document.createElement("link");
        link.id = "app-font-link";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = fontDef.url;
    } else {
      link?.remove();
    }
    if (fontDef?.family) {
      document.documentElement.style.setProperty("--app-font-sans", fontDef.family);
    } else {
      document.documentElement.style.removeProperty("--app-font-sans");
    }
  }, [customFont]);

  const setAnimatedTransitions = (v: boolean) => {
    setAnimTransState(v);
    try { localStorage.setItem(LS_ANIM_TRANS, v ? "true" : "false"); } catch {}
  };
  const setReduceMotion = (v: boolean) => {
    setReduceMotionState(v);
    try { localStorage.setItem(LS_REDUCE_MOT, v ? "true" : "false"); } catch {}
  };
  const setHighContrast = (v: boolean) => {
    setHighContrastState(v);
    try { localStorage.setItem(LS_HIGH_CON, v ? "true" : "false"); } catch {}
  };
  const setCustomFont = (font: string) => {
    setCustomFontState(font);
    try { localStorage.setItem(LS_FONT, font); } catch {}
  };

  const setWallpaper = (url: string | null) => {
    setWallpaperState(url);
    try {
      if (!url) { localStorage.removeItem(LS_WALLPAPER); return; }
      localStorage.setItem(LS_WALLPAPER, url);
    } catch { console.warn("Could not save wallpaper to localStorage"); }
  };
  const setWallpaperBlur = (v: number) => {
    setWallpaperBlurState(v);
    try { localStorage.setItem(LS_WALL_BLUR, String(v)); } catch {}
  };
  const setWallpaperOpacity = (v: number) => {
    setWallpaperOpacityState(v);
    try { localStorage.setItem(LS_WALL_OPACITY, String(v)); } catch {}
  };

  const allThemes = [...BUILT_IN_THEMES, ...userThemes];

  const currentTheme =
    allThemes.find((t) => t.id === themeId) ?? BUILT_IN_THEMES[0];

  const currentAccentHex: string = customAccent
    ? customAccent
    : hslToHex(currentTheme.vars["primary"] ?? "25 85% 55%");

  useEffect(() => {
    applyTheme(currentTheme, customAccent);
    if (songThemeVars) {
      const root = document.documentElement;
      root.classList.add("dark");
      Object.entries(songThemeVars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
    }
  }, [currentTheme, customAccent, songThemeVars]);

  const setTheme = useCallback((id: string) => {
    localStorage.setItem(LS_THEME, id);
    setThemeId(id);
  }, []);

  const setCustomAccent = useCallback((hex: string | null) => {
    if (hex) {
      localStorage.setItem(LS_ACCENT, hex);
    } else {
      localStorage.removeItem(LS_ACCENT);
    }
    setCustomAccentState(hex);
  }, []);

  const saveUserTheme = useCallback((theme: AppTheme) => {
    setUserThemes((prev) => {
      const next = [...prev.filter((t) => t.id !== theme.id), theme];
      localStorage.setItem(LS_USER_THEMES, JSON.stringify(next));
      return next;
    });
    localStorage.setItem(LS_THEME, theme.id);
    setThemeId(theme.id);
  }, []);

  const deleteUserTheme = useCallback((id: string) => {
    setUserThemes((prev) => {
      const next = prev.filter((t) => t.id !== id);
      localStorage.setItem(LS_USER_THEMES, JSON.stringify(next));
      return next;
    });
    setThemeId((cur) => (cur === id ? "dark" : cur));
  }, []);

  const value: ThemeContextValue = {
    themeId,
    customAccent,
    userThemes,
    setTheme,
    setCustomAccent,
    saveUserTheme,
    deleteUserTheme,
    currentTheme,
    currentAccentHex,
    wallpaper,
    wallpaperBlur,
    wallpaperOpacity,
    setWallpaper,
    setWallpaperBlur,
    setWallpaperOpacity,
    songColorTheme,
    setSongColorTheme,
    applySongTheme,
    animatedTransitions,
    reduceMotion,
    highContrast,
    customFont,
    effectiveReduceMotion,
    setAnimatedTransitions,
    setReduceMotion,
    setHighContrast,
    setCustomFont,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export { BUILT_IN_THEMES };
