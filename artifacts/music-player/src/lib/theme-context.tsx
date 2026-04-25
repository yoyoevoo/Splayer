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

const LS_THEME       = "app-theme-id";
const LS_ACCENT      = "app-custom-accent";
const LS_USER_THEMES = "app-user-themes";

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

  const allThemes = [...BUILT_IN_THEMES, ...userThemes];

  const currentTheme =
    allThemes.find((t) => t.id === themeId) ?? BUILT_IN_THEMES[0];

  const currentAccentHex: string = customAccent
    ? customAccent
    : hslToHex(currentTheme.vars["primary"] ?? "25 85% 55%");

  useEffect(() => {
    applyTheme(currentTheme, customAccent);
  }, [currentTheme, customAccent]);

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
