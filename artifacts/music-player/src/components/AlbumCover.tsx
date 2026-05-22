import { Music } from "lucide-react";
import { platformAPI } from "@/lib/platform-api";
import { gradientFor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface AlbumCoverProps {
  src?: string;
  seed: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  rounded?: boolean;
  artist?: string;
  title?: string;
}

const artCache = new Map<string, string | null>();
(window as any).__albumArtCache = artCache;

function getBlockedKey(title: string, artist: string) {
  return `art-blocked:${title.toLowerCase()}::${artist.toLowerCase()}`;
}
function isBlocked(title: string, artist: string): boolean {
  try { return localStorage.getItem(getBlockedKey(title, artist)) === "1"; } catch { return false; }
}
function setBlocked(title: string, artist: string) {
  try { localStorage.setItem(getBlockedKey(title, artist), "1"); } catch {}
}
function clearBlocked(title: string, artist: string) {
  try { localStorage.removeItem(getBlockedKey(title, artist)); } catch {}
}
(window as any).__blockArt = (title: string, artist: string) => {
  const k = `${title}::${artist}`.toLowerCase();
  artCache.set(k, null);
  setBlocked(title, artist);
  try { localStorage.removeItem("fetched-art:" + k); } catch {}
};

function cleanForSearch(title: string, artist: string): string {
  const cleanTitle = title
    .replace(/\\\[NA\\\]/gi, "")
    .replace(/\(.*?(official|video|audio|lyric|hd|4k|mv).*?\)/gi, "")
    .replace(/\[.*?\]/gi, "")
    .trim();
  if (artist && artist !== "Unknown Artist") {
    return `${artist} ${cleanTitle}`;
  } else if (cleanTitle.includes(" - ")) {
    const parts = cleanTitle.split(" - ");
    return `${parts[0].trim()} ${parts.slice(1).join(" - ").trim()}`;
  }
  return cleanTitle;
}

const LS_ART_PREFIX = "album-art-url:";

function saveArtToStorage(cacheKey: string, url: string | null) {
  try {
    if (url) localStorage.setItem(LS_ART_PREFIX + cacheKey, url);
    else localStorage.removeItem(LS_ART_PREFIX + cacheKey);
  } catch {}
}

function loadArtFromStorage(cacheKey: string): string | null {
  try { return localStorage.getItem(LS_ART_PREFIX + cacheKey); } catch { return null; }
}

// Pre-populate artCache from localStorage — defer so Electron has time to load storage
function populateArtCacheFromStorage() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS_ART_PREFIX)) {
        const cacheKey = k.slice(LS_ART_PREFIX.length);
        const url = localStorage.getItem(k);
        if (url) artCache.set(cacheKey, url);
      }
    }
  } catch {}
}
populateArtCacheFromStorage();
// Also run after a short delay in case Electron storage loads async
setTimeout(populateArtCacheFromStorage, 500);

async function fetchAlbumArt(title: string, artist: string): Promise<string | null> {
  const cacheKey = `${title}::${artist}`.toLowerCase();
  if (isBlocked(title, artist)) { artCache.set(cacheKey, null); return null; }
  if (artCache.has(cacheKey)) return artCache.get(cacheKey)!;
  // Check localStorage before hitting the network
  const stored = loadArtFromStorage(cacheKey);
  if (stored) { artCache.set(cacheKey, stored); return stored; }
  try {
    const query = encodeURIComponent(cleanForSearch(title, artist));
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    const art = data.results?.[0]?.artworkUrl100?.replace("100x100bb", "500x500bb") ?? null;
    artCache.set(cacheKey, art);
    saveArtToStorage(cacheKey, art);
    window.dispatchEvent(new CustomEvent("art-fetched", { detail: { key: cacheKey } }));
    return art;
  } catch {
    artCache.set(cacheKey, null);
    return null;
  }
}

export function AlbumCover({ src, seed, size = "md", className, rounded = true, artist, title }: AlbumCoverProps) {
  const [fetchedArt, setFetchedArt] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (src) { setFetchedArt(undefined); return; }
    if (!title && !artist) return;
    const t = title ?? seed;
    const a = artist ?? "";
    const cacheKey = `${t}::${a}`.toLowerCase();
    if (artCache.has(cacheKey)) { setFetchedArt(artCache.get(cacheKey) ?? null); return; }
    // Check localStorage directly in case module-level pre-population ran before this component mounted
    const stored = loadArtFromStorage(cacheKey);
    // Debug: write results to a file so we can read them from terminal
    try {
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
      const line = `key=${cacheKey} stored=${stored ? "FOUND:" + stored.slice(0,40) : "MISSING"} lsLen=${localStorage.length} allKeys=${allKeys.filter(k=>k?.startsWith("album-art")).join("|")}\n`;
      (window as any).electronAPI?.writeDebugLog?.(line);
    } catch {}
    if (stored) { artCache.set(cacheKey, stored); setFetchedArt(stored); return; }
    setLoading(true);
    fetchAlbumArt(t, a).then((art) => { setFetchedArt(art); setLoading(false); });
  }, [src, title, artist, seed]);

  // Reset image error whenever the resolved source changes
  useEffect(() => { setImgError(false); }, [fetchedArt, src]);

  // undefined = not checked yet, null = checked but none found, string = found
  const displaySrc = fetchedArt !== undefined ? (fetchedArt ?? src ?? undefined) : src;
  const sizeCls = size === "sm" ? "w-12 h-12" : size === "md" ? "w-16 h-16" : size === "lg" ? "w-32 h-32" : "w-full aspect-square";

  return (
    <div className={cn("relative overflow-visible flex items-center justify-center shrink-0 shadow-lg", rounded ? "rounded-lg" : "", sizeCls, className)}>
      <div className={cn("absolute inset-0 overflow-hidden flex items-center justify-center", rounded ? "rounded-lg" : "")} style={(!displaySrc || imgError) ? { background: gradientFor(seed) } : undefined}>
        {displaySrc && !imgError ? (
          <img src={displaySrc} alt="" className={cn("w-full h-full object-cover transition-opacity duration-500", loading ? "opacity-0" : "opacity-100")} draggable={false} onError={() => setImgError(true)} />
        ) : (
          <Music className={cn("w-1/3 h-1/3 text-white/70 transition-opacity duration-300", loading ? "opacity-30 animate-pulse" : "opacity-70")} strokeWidth={1.5} />
        )}
      </div>
    </div>
  );
}
