import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Player from "@/pages/Player";
import { PlayerProvider, usePlayer } from "@/lib/player-context";
import { checkAndRunAutoBackup } from "@/lib/auto-backup";
import { TitleBar } from "@/components/TitleBar";
import { TourOverlay, VizTip } from "@/components/TourOverlay";
import { FloatingDownloadBadge } from "@/components/FloatingDownloadBadge";
import { platformAPI, currentPlatform } from "@/lib/platform-api";
import { trackCoverUrl } from "@/lib/types";

/** Convert any cover URL (blob:, data:, http) to a data URL safe for cross-window IPC. */
async function coverToDataUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("blob:")) return url;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

const queryClient = new QueryClient();

const LS_SHORTCUTS_KEY = "settings-global-shortcuts";

const DEFAULT_SHORTCUTS: Record<string, string> = {
  playPause:  "MediaPlayPause",
  next:       "MediaNextTrack",
  prev:       "MediaPreviousTrack",
  stop:       "MediaStop",
  mute:       "Ctrl+Shift+M",
  shuffle:    "Ctrl+Shift+S",
  repeat:     "Ctrl+Shift+R",
  volumeUp:   "Ctrl+Up",
  volumeDown: "Ctrl+Down",
};

function loadShortcuts(): Record<string, string> {
  try {
    const saved = localStorage.getItem(LS_SHORTCUTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, string>;
      return { ...DEFAULT_SHORTCUTS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SHORTCUTS };
}

function TrayBridge() {
  const {
    currentTrack, isPlaying,
    togglePlay, next, prev,
    toggleMute, toggleShuffle, cycleRepeat,
    volume, setVolume, seek,
    currentTime,
  } = usePlayer();
  const api = platformAPI;

  // Keep a ref so the Discord effect can read the latest position without
  // depending on currentTime (which changes every second and would spam IPC).
  const currentTimeRef = useRef(0);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    const behavior = (localStorage.getItem("settings-close-behavior") ?? "tray") as "tray" | "close";
    api?.setCloseBehavior?.(behavior);
    checkAndRunAutoBackup();
    // Send initial Discord enabled state to main process
    const discordEnabled = localStorage.getItem("discord-rpc-enabled") !== "false";
    api?.discordRpcSetEnabled?.(discordEnabled);
    // Send initial OS media integration state to main process
    const osMediaEnabled = localStorage.getItem("os-media-enabled") !== "false";
    (api as any)?.setOsMediaEnabled?.(osMediaEnabled);
    // Initialise default Splayer folder paths.
    // Use a version key so we overwrite old paths (pre-Splayer) on first run after update.
    const FOLDERS_VERSION = "splayer-folders-v1";
    if (!localStorage.getItem(FOLDERS_VERSION)) {
      (api as any)?.getAppPaths?.().then((dirs: { downloads: string; backups: string } | undefined) => {
        if (!dirs) return;
        try {
          localStorage.setItem("settings-music-library-path", dirs.downloads);
          localStorage.setItem("settings-downloads-path",     dirs.downloads);
          localStorage.setItem("settings-videos-path",        dirs.downloads);
          localStorage.setItem("auto-backup-dir",             dirs.backups);
          localStorage.setItem(FOLDERS_VERSION, "1");
        } catch {}
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    api?.registerGlobalShortcuts?.(loadShortcuts());
  }, []);

  useEffect(() => {
    api?.updateTrayState?.({
      title:     currentTrack?.title  ?? "Nothing playing",
      artist:    currentTrack?.artist ?? "",
      isPlaying,
      volume:    Math.round(volume * 100),
    });
  }, [currentTrack, isPlaying, volume]);

  // Discord Rich Presence — fires only on meaningful changes (track / pause),
  // not every second. currentTime is read from the ref to get a fresh value
  // without adding it to the dependency array.
  useEffect(() => {
    api?.discordRpcUpdate?.({
      title:    currentTrack?.title  ?? "",
      artist:   currentTrack?.artist ?? "",
      isPlaying,
      duration: currentTrack?.duration ?? 0,
      position: currentTimeRef.current,
    });
  }, [currentTrack, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mini widget state + OS media integration — both need cover converted to data URL.
  // currentTime read from ref to avoid per-second re-fires.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const coverUrl = await coverToDataUrl(currentTrack ? trackCoverUrl(currentTrack) : undefined);
      if (cancelled) return;
      api?.updateWidgetState?.({
        title:    currentTrack?.title  ?? "",
        artist:   currentTrack?.artist ?? "",
        coverUrl: coverUrl ?? null,
        isPlaying,
        duration: currentTrack?.duration ?? 0,
        position: currentTimeRef.current,
        sentAt:   Date.now(),
      });
      // Push to MPRIS (Linux) / SMTC (Windows)
      (api as any)?.updateOsMedia?.({
        title:        currentTrack?.title  ?? "",
        artist:       currentTrack?.artist ?? "",
        album:        currentTrack?.album  ?? "",
        isPlaying,
        durationSecs: currentTrack?.duration ?? 0,
        positionSecs: currentTimeRef.current,
        coverDataUrl: coverUrl ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [currentTrack, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cleanup = api?.onTrayAction?.((action: unknown) => {
      console.log("[TrayBridge] onTrayAction received:", action);
      if (action === "play-pause") {
        console.log("[TrayBridge] → togglePlay()");
        togglePlay();
      } else if (action === "play") {
        if (!isPlaying) togglePlay();
      } else if (action === "pause") {
        if (isPlaying) togglePlay();
      } else if (action === "stop") {
        if (isPlaying) togglePlay();
      } else if (action === "next") {
        console.log("[TrayBridge] → next()");
        next();
      } else if (action === "prev" || action === "previous") {
        console.log("[TrayBridge] → prev()");
        prev();
      } else if (action === "mute") {
        toggleMute();
      } else if (action === "shuffle") {
        toggleShuffle();
      } else if (action === "repeat") {
        cycleRepeat();
      } else if (
        action !== null &&
        typeof action === "object" &&
        (action as Record<string, unknown>).type === "set-volume"
      ) {
        const vol = (action as Record<string, unknown>).volume as number;
        setVolume(Math.max(0, Math.min(1, vol / 100)));
      } else if (
        action !== null &&
        typeof action === "object" &&
        (action as Record<string, unknown>).type === "seek"
      ) {
        const pos = (action as Record<string, unknown>).position as number;
        seek(pos);
      }
    });
    return cleanup ?? undefined;
  }, [togglePlay, next, prev, toggleMute, toggleShuffle, cycleRepeat, setVolume, seek]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PlayerProvider>
          {/* Show on all Electron desktop platforms — main.cjs sets frame:false
              for every platform, so the custom titlebar is always needed. */}
          {platformAPI && currentPlatform !== "android" && <TitleBar />}
          {platformAPI && currentPlatform !== "android" && <TourOverlay />}
          {platformAPI && currentPlatform !== "android" && <VizTip />}
          <TrayBridge />
          <Player />
          <FloatingDownloadBadge />
          <Toaster />
        </PlayerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
