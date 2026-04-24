import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/lib/player-context";
import {
  trackCoverUrl,
  playlistDuration,
  playlistTracks,
} from "@/lib/types";
import type { Playlist } from "@/lib/types";
import { formatLongDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { MosaicCover } from "./MosaicCover";
import { EditPlaylistDialog } from "./EditPlaylistDialog";
import { AddTracksDialog } from "./AddTracksDialog";

interface PlaylistDetailViewProps {
  playlistId: string;
  onBack: () => void;
}

export function PlaylistDetailView({
  playlistId,
  onBack,
}: PlaylistDetailViewProps) {
  const {
    tracks,
    playlists,
    currentTrack,
    isPlaying,
    playFromList,
    deletePlaylist,
    setPlaylistCover,
    removeTrackFromPlaylist,
  } = usePlayer();

  const playlist = playlists.find((p) => p.id === playlistId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);

  const plTracks = useMemo(
    () => (playlist ? playlistTracks(playlist, tracks) : []),
    [playlist, tracks],
  );

  const filtered = useMemo(() => {
    if (!query) return plTracks.map((t, i) => ({ t, i }));
    const q = query.toLowerCase();
    return plTracks
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q),
      );
  }, [plTracks, query]);

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="text-sm text-muted-foreground">
          Playlist not found
        </div>
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
      </div>
    );
  }

  const trackCovers = plTracks.map((t) => trackCoverUrl(t));
  const totalSec = playlistDuration(playlist, tracks);

  const onPlayAll = () => {
    if (playlist.trackIds.length === 0) return;
    playFromList(playlist.trackIds, 0, playlist.name);
  };

  const onPickCover = () => coverInputRef.current?.click();
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await setPlaylistCover(playlist.id, file);
    e.target.value = "";
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                data-testid="button-playlist-menu"
                aria-label="Playlist options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPickCover}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Change cover
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (
                    confirm(
                      `Delete playlist "${playlist.name}"? Your music files stay safe.`,
                    )
                  ) {
                    deletePlaylist(playlist.id);
                    onBack();
                  }
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onPickCover}
            className="relative group rounded-lg overflow-hidden"
            data-testid="button-change-playlist-cover"
            aria-label="Change cover"
          >
            <MosaicCover
              customCoverUrl={playlist.customCoverUrl}
              trackCovers={trackCovers}
              seed={playlist.id + playlist.name}
              size="lg"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-white" />
            </div>
          </button>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setEditing(true)}
              className="block text-left max-w-full"
              data-testid="button-rename-playlist"
            >
              <div className="text-base font-serif tracking-tight truncate hover:underline">
                {playlist.name}
              </div>
            </button>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {plTracks.length}{" "}
              {plTracks.length === 1 ? "track" : "tracks"}
              {totalSec > 0 ? ` • ${formatLongDuration(totalSec)}` : ""}
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button
                size="sm"
                onClick={onPlayAll}
                disabled={plTracks.length === 0}
                className="gap-1.5 h-7"
                data-testid="button-play-playlist"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAdding(true)}
                className="gap-1.5 h-7"
                data-testid="button-add-tracks-to-playlist"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {plTracks.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search in this playlist"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-playlist-search"
            />
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {plTracks.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="text-sm text-muted-foreground mb-4">
              This playlist is empty
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              className="gap-1.5"
              data-testid="button-add-first-track"
            >
              <Plus className="w-3.5 h-3.5" />
              Add tracks
            </Button>
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            <AnimatePresence initial={false}>
              {filtered.map(({ t, i }) => {
                const isActive = currentTrack?.id === t.id;
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
                        playFromList(playlist.trackIds, i, playlist.name)
                      }
                      data-testid={`playlist-track-${t.id}`}
                    >
                      <div className="relative">
                        <AlbumCover
                          src={trackCoverUrl(t)}
                          seed={t.title + t.artist}
                          size="sm"
                        />
                        {isActive && (
                          <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                            {isPlaying ? (
                              <span className="flex items-end gap-[2px] h-3">
                                {[0, 1, 2].map((bi) => (
                                  <span
                                    key={bi}
                                    className="w-[3px] bg-primary rounded-sm"
                                    style={{
                                      animation: `eq 1s ${bi * 0.15}s ease-in-out infinite`,
                                      height: "100%",
                                    }}
                                  />
                                ))}
                              </span>
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
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(t.duration)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromPlaylist(playlist.id, t.id);
                        }}
                        data-testid={`button-remove-from-playlist-${t.id}`}
                        aria-label="Remove from playlist"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {plTracks.length > 0 && filtered.length === 0 && (
              <li className="text-center text-sm text-muted-foreground p-6">
                No matches
              </li>
            )}
          </ul>
        )}
      </ScrollArea>

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onCoverChange}
      />

      {editing && (
        <EditPlaylistDialog
          open={editing}
          onOpenChange={setEditing}
          playlist={playlist}
        />
      )}
      <AddTracksDialog
        open={adding}
        onOpenChange={setAdding}
        playlist={playlist}
      />
    </div>
  );
}
