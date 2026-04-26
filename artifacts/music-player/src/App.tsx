import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Player from "@/pages/Player";
import { PlayerProvider, usePlayer } from "@/lib/player-context";

const queryClient = new QueryClient();

function TrayBridge() {
  const { currentTrack, isPlaying, togglePlay, next, prev, volume, setVolume } = usePlayer();
  const api = window.electronAPI;

  useEffect(() => {
    const behavior = (localStorage.getItem("settings-close-behavior") ?? "tray") as "tray" | "close";
    api?.setCloseBehavior?.(behavior);
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
  }, [togglePlay, next, prev, setVolume]);

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
