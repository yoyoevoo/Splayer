import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Player from "@/pages/Player";
import { PlayerProvider, usePlayer } from "@/lib/player-context";
import { checkAndRunAutoBackup } from "@/lib/auto-backup";

const queryClient = new QueryClient();

const LS_SHORTCUTS_KEY = "settings-global-shortcuts";

const DEFAULT_SHORTCUTS: Record<string, string> = {
  playPause:  "MediaPlayPause",
  next:       "MediaNextTrack",
  prev:       "MediaPreviousTrack",
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
    volume, setVolume,
  } = usePlayer();
  const api = window.electronAPI;

  useEffect(() => {
    const behavior = (localStorage.getItem("settings-close-behavior") ?? "tray") as "tray" | "close";
    api?.setCloseBehavior?.(behavior);
    checkAndRunAutoBackup();
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

  useEffect(() => {
    const cleanup = api?.onTrayAction?.((action: unknown) => {
      if (action === "play-pause") {
        togglePlay();
      } else if (action === "next") {
        next();
      } else if (action === "prev") {
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
      }
    });
    return cleanup ?? undefined;
  }, [togglePlay, next, prev, toggleMute, toggleShuffle, cycleRepeat, setVolume]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PlayerProvider>
          <TrayBridge />
          <Player />
          <Toaster />
        </PlayerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
