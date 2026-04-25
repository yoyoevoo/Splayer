import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Heart,
  History,
  Play,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlayer } from "@/lib/player-context";
import {
  trackCoverUrl,
  smartPlaylistTracks,
  SMART_PLAYLISTS,
} from "@/lib/types";
import type { SmartPlaylistKind } from "@/lib/types";
import { formatLongDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { EqualizerBars } from "./EqualizerBars";

interface SmartPlaylistViewProps {
  kind: SmartPlaylistKind;
  onBack: () => void;
}

function smartIcon(kind: SmartPlaylistKind) {
  if (kind === "liked-songs") return Heart;
  if (kind === "recently-played") return History;
  if (kind === "most-played") return TrendingUp;
  if (kind === "recently-added") return Sparkles;
  return Clock;
}

function smartGradient(kind: SmartPlaylistKind): string {
  if (kind === "liked-songs")
    return "linear-gradient(135deg, hsl(340 70% 45%), hsl(320 60% 30%))";
  if (kind === "recently-played")
    return "linear-gradient(135deg, hsl(250 65% 50%), hsl(220 60% 30%))";
  if (kind === "most-played")
    return "linear-gradient(135deg, hsl(28 80% 45%), hsl(15 70% 30%))";
  if (kind === "recently-added")
    return "linear-gradient(135deg, hsl(200 70% 45%), hsl(260 60% 30%))";
  return "linear-gradient(135deg, hsl(140 50% 40%), hsl(180 55% 25%))";
}

function emptyMessage(kind: SmartPlaylistKind): string {
  switch (kind) {
    case "liked-songs":
      return "Heart a track to see it here.";
    case "recently-played":
      return "Play some music and it'll show up here.";
    case "most-played":
      return "Play some music and your top tracks will show up here.";
    case "recently-added":
      return "Add music to your library to see your latest additions.";
    case "never-played":
      return "You've listened to everything. Nice work!";
  }
}

export function SmartPlaylistView({ kind, onBack }: SmartPlaylistViewProps) {
  const { tracks, currentTrack, isPlaying, playFromList, toggleLike } =
    usePlayer();
  const [query, setQuery] = useState("");

  const meta = SMART_PLAYLISTS.find((s) => s.kind === kind);
  const Icon = smartIcon(kind);

  const computed = useMemo(
    () => smartPlaylistTracks(kind, tracks),
    [kind, tracks],
  );

  const filtered = useMemo(() => {
    if (!query) return computed.map((t, i) => ({ t, i }));
    const q = query.toLowerCase();
    return computed
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q),
      );
  }, [computed, query]);

  const totalSec = computed.reduce((sum, t) => sum + (t.duration || 0), 0);

  const onPlayAll = () => {
    if (computed.length === 0) return;
    playFromList(
      computed.map((t) => t.id),
      0,
      meta?.name ?? "Smart Playlist",
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-card-border space-y-3">
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={onBack}
            className="gap-1.5 -ml-2"
            data-testid="button-back-to-playlists"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Playlists
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center shadow-md shrink-0"
            style={{ background: smartGradient(kind) }}
          >
            <Icon className="w-7 h-7 text-white" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-serif tracking-tight truncate">
              {meta?.name}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              {computed.length}{" "}
              {computed.length === 1 ? "track" : "tracks"}
              {totalSec > 0 ? ` • ${formatLongDuration(totalSec)}` : ""}
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button
                size="sm"
                onClick={onPlayAll}
                disabled={computed.length === 0}
                className="gap-1.5 h-7"
                data-testid="button-play-smart"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play
              </Button>
            </div>
          </div>
        </div>

        {computed.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search in this playlist"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-smart-search"
            />
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {computed.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="text-sm text-muted-foreground">
              {emptyMessage(kind)}
            </div>
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            <AnimatePresence initial={false}>
              {filtered.map(({ t, i }) => {
                const isActive = currentTrack?.id === t.id;
                const liked = t.liked ?? false;
                return (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={cn(
                        "group relative flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate active-elevate-2",
                        isActive && "bg-accent",
                      )}
                      onClick={() =>
                        playFromList(
                          computed.map((tr) => tr.id),
                          i,
                          meta?.name ?? "Smart Playlist",
                        )
                      }
                      data-testid={`smart-track-${t.id}`}
                    >
                      <div className="text-[11px] text-muted-foreground tabular-nums w-5 text-right shrink-0">
                        {i + 1}
                      </div>
                      <div className="relative">
                        <AlbumCover
                          src={trackCoverUrl(t)}
                          seed={t.title + t.artist}
                          size="sm"
                        />
                        {isActive && (
                          <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                            {isPlaying ? (
                              <EqualizerBars />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-sm truncate",
                            isActive
                              ? "text-primary font-medium"
                              : "text-foreground",
                          )}
                        >
                          {t.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.artist}
                        </div>
                      </div>
                      {kind === "most-played" && (
                        <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">
                          {t.playCount}{" "}
                          {t.playCount === 1 ? "play" : "plays"}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(t.id);
                        }}
                        className={cn(
                          "h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0",
                          liked
                            ? "text-red-500 opacity-100"
                            : "text-muted-foreground",
                        )}
                        aria-label={liked ? "Unlike" : "Like"}
                      >
                        <Heart
                          className="w-3.5 h-3.5"
                          fill={liked ? "currentColor" : "none"}
                        />
                      </Button>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(t.duration)}
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {computed.length > 0 && filtered.length === 0 && (
              <li className="text-center text-sm text-muted-foreground p-6">
                No matches
              </li>
            )}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
