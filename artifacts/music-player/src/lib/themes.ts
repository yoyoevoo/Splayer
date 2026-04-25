export interface AppTheme {
  id: string;
  name: string;
  isDark: boolean;
  previewBg: string;
  previewPanel: string;
  previewAccent: string;
  vars: Record<string, string>;
}

function darkBase(accent: string, accentFg: string, bg: string, card: string, border: string, fg: string, mutedFg: string): Record<string, string> {
  return {
    "button-outline": "rgba(255,255,255,.10)",
    "badge-outline": "rgba(255,255,255,.05)",
    "opaque-button-border-intensity": "9",
    "elevate-1": "rgba(255,255,255,.04)",
    "elevate-2": "rgba(255,255,255,.09)",
    background: bg, foreground: fg, border,
    card, "card-foreground": fg, "card-border": border,
    sidebar: card, "sidebar-foreground": fg, "sidebar-border": border,
    "sidebar-primary": accent, "sidebar-primary-foreground": accentFg,
    "sidebar-accent": border, "sidebar-accent-foreground": fg,
    "sidebar-ring": accent,
    popover: card, "popover-foreground": fg, "popover-border": border,
    primary: accent, "primary-foreground": accentFg,
    secondary: border, "secondary-foreground": fg,
    muted: border, "muted-foreground": mutedFg,
    accent: border, "accent-foreground": fg,
    input: border, ring: accent,
    destructive: "0 85% 50%", "destructive-foreground": "0 0% 100%",
    "chart-1": accent, "chart-2": "45 80% 60%",
    "chart-3": "10 70% 50%", "chart-4": "340 60% 55%", "chart-5": "20 90% 65%",
  };
}

export const BUILT_IN_THEMES: AppTheme[] = [
  {
    id: "dark",
    name: "Dark",
    isDark: true,
    previewBg: "#0a0a10",
    previewPanel: "#0f0f17",
    previewAccent: "#f97316",
    vars: darkBase(
      "25 85% 55%", "0 0% 100%",
      "240 10% 4%", "240 10% 6%", "240 10% 12%",
      "240 10% 95%", "240 5% 65%",
    ),
  },
  {
    id: "light",
    name: "Light",
    isDark: false,
    previewBg: "#f5f5f5",
    previewPanel: "#ffffff",
    previewAccent: "#3b82f6",
    vars: {
      "button-outline": "rgba(0,0,0,.10)",
      "badge-outline": "rgba(0,0,0,.05)",
      "opaque-button-border-intensity": "-8",
      "elevate-1": "rgba(0,0,0,.03)",
      "elevate-2": "rgba(0,0,0,.08)",
      background: "0 0% 96%", foreground: "220 20% 10%", border: "0 0% 87%",
      card: "0 0% 100%", "card-foreground": "220 20% 10%", "card-border": "0 0% 87%",
      sidebar: "0 0% 94%", "sidebar-foreground": "220 20% 10%", "sidebar-border": "0 0% 87%",
      "sidebar-primary": "220 85% 55%", "sidebar-primary-foreground": "0 0% 100%",
      "sidebar-accent": "0 0% 90%", "sidebar-accent-foreground": "220 20% 10%",
      "sidebar-ring": "220 85% 55%",
      popover: "0 0% 100%", "popover-foreground": "220 20% 10%", "popover-border": "0 0% 87%",
      primary: "220 85% 55%", "primary-foreground": "0 0% 100%",
      secondary: "0 0% 90%", "secondary-foreground": "220 20% 10%",
      muted: "0 0% 90%", "muted-foreground": "220 10% 45%",
      accent: "0 0% 90%", "accent-foreground": "220 20% 10%",
      input: "0 0% 87%", ring: "220 85% 55%",
      destructive: "0 85% 50%", "destructive-foreground": "0 0% 100%",
      "chart-1": "220 85% 55%", "chart-2": "160 70% 45%",
      "chart-3": "280 60% 55%", "chart-4": "340 70% 55%", "chart-5": "45 90% 55%",
    },
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    isDark: true,
    previewBg: "#050e1a",
    previewPanel: "#091525",
    previewAccent: "#22d3ee",
    vars: darkBase(
      "185 90% 55%", "220 60% 5%",
      "220 60% 5%", "220 55% 8%", "220 50% 15%",
      "185 30% 92%", "220 30% 58%",
    ),
  },
  {
    id: "forest",
    name: "Forest",
    isDark: true,
    previewBg: "#040d07",
    previewPanel: "#081510",
    previewAccent: "#84cc16",
    vars: darkBase(
      "90 85% 50%", "140 40% 4%",
      "140 40% 4%", "140 35% 7%", "140 30% 13%",
      "120 20% 90%", "140 15% 58%",
    ),
  },
  {
    id: "rose",
    name: "Rose",
    isDark: true,
    previewBg: "#0f0508",
    previewPanel: "#170910",
    previewAccent: "#f43f5e",
    vars: darkBase(
      "350 85% 62%", "0 0% 100%",
      "340 25% 5%", "340 22% 8%", "340 20% 14%",
      "350 20% 92%", "340 10% 58%",
    ),
  },
  {
    id: "dark-purple",
    name: "Dark Purple",
    isDark: true,
    previewBg: "#1a0a2e",
    previewPanel: "#2d1b4e",
    previewAccent: "#9b59b6",
    vars: darkBase(
      "283 39% 53%", "270 100% 95%",
      "270 64% 11%", "264 49% 21%", "264 50% 28%",
      "270 100% 95%", "270 40% 68%",
    ),
  },
];

export function getTheme(id: string): AppTheme {
  return BUILT_IN_THEMES.find((t) => t.id === id) ?? BUILT_IN_THEMES[0];
}

export function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else                h = ((r - g) / d + 4) * 60;
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslToHex(hsl: string): string {
  const parts = hsl.split(/[\s%]+/).map(Number);
  const h = parts[0], s = parts[1] / 100, l = parts[2] / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * col).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function accentFgFromHex(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "220 20% 10%" : "0 0% 100%";
}

export function isDarkColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

export function buildUserThemeVars(
  bgHex: string,
  panelHex: string,
  textHex: string,
  accentHex: string,
): Record<string, string> {
  const bgHsl     = hexToHsl(bgHex);
  const panelHsl  = hexToHsl(panelHex);
  const textHsl   = hexToHsl(textHex);
  const accentHsl = hexToHsl(accentHex);
  const accentFg  = accentFgFromHex(accentHex);
  const dark      = isDarkColor(bgHex);

  const panelParts = panelHsl.split(/[\s%]+/).map(Number);
  const textParts  = textHsl.split(/[\s%]+/).map(Number);

  const borderL   = dark
    ? Math.min(panelParts[2] + 9, 90)
    : Math.max(panelParts[2] - 9, 5);
  const borderHsl = `${panelParts[0]} ${panelParts[1]}% ${borderL}%`;

  const mutedL    = dark
    ? Math.max(textParts[2] - 28, 25)
    : Math.min(textParts[2] + 28, 75);
  const mutedFgHsl = `${textParts[0]} ${Math.max(textParts[1] - 10, 0)}% ${mutedL}%`;

  const btnOutline   = dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.10)";
  const badgeOutline = dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)";
  const intensity    = dark ? "9" : "-8";
  const elevate1     = dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.03)";
  const elevate2     = dark ? "rgba(255,255,255,.09)" : "rgba(0,0,0,.08)";

  return {
    "button-outline": btnOutline,
    "badge-outline": badgeOutline,
    "opaque-button-border-intensity": intensity,
    "elevate-1": elevate1,
    "elevate-2": elevate2,
    background: bgHsl, foreground: textHsl, border: borderHsl,
    card: panelHsl, "card-foreground": textHsl, "card-border": borderHsl,
    sidebar: panelHsl, "sidebar-foreground": textHsl, "sidebar-border": borderHsl,
    "sidebar-primary": accentHsl, "sidebar-primary-foreground": accentFg,
    "sidebar-accent": borderHsl, "sidebar-accent-foreground": textHsl,
    "sidebar-ring": accentHsl,
    popover: panelHsl, "popover-foreground": textHsl, "popover-border": borderHsl,
    primary: accentHsl, "primary-foreground": accentFg,
    secondary: borderHsl, "secondary-foreground": textHsl,
    muted: borderHsl, "muted-foreground": mutedFgHsl,
    accent: borderHsl, "accent-foreground": textHsl,
    input: borderHsl, ring: accentHsl,
    destructive: "0 85% 50%", "destructive-foreground": "0 0% 100%",
    "chart-1": accentHsl, "chart-2": "45 80% 60%",
    "chart-3": "10 70% 50%", "chart-4": "340 60% 55%", "chart-5": "20 90% 65%",
  };
}
