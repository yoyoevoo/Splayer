import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
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
import { trackCoverUrl } from "@/lib/types";
import type { Track } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { EditTrackDialog } from "./EditTrackDialog";

export function Playlist() {
  const {
    tracks,
    currentTrack,
    isPlaying,
    playIndex,
    addFiles,
    removeTrack,
    setCustomCover,
  } = usePlayer();
  const [query, setQuery] = useState("");
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTrackIdRef = useRef<string | null>(null);

  const filtered = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    });

  const onAddClick = () => fileInputRef.current?.click();
  const onAddChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = "";
  };

  const onPickCover = (id: string) => {
    coverTrackIdRef.current = id;
    coverInputRef.current?.click();
  };
  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = coverTrackIdRef.current;
    if (file && id) await setCustomCover(id, file);
    coverTrackIdRef.current = null;
    e.target.value = "";
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 flex flex-col border-l border-card-border bg-sidebar/40 backdrop-blur">
      <div className="p-4 space-y-3 border-b border-card-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-foreground/80 uppercase">
            Library
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={onAddClick}
            className="gap-1.5"
            data-testid="button-add-music"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tracks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
          {query && filtered.length !== tracks.length
            ? ` · ${filtered.length} shown`
            : ""}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <ul className="p-2 space-y-1">
          <AnimatePresence initial={false}>
            {filtered.map(({ t, i }, listIdx) => {
              const isActive = currentTrack?.id === t.id;
              return (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25, delay: listIdx * 0.015 }}
                >
                  <div
                    className={cn(
                      "group relative flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate active-elevate-2",
                      isActive && "bg-accent",
                    )}
                    onClick={() => playIndex(i)}
                    data-testid={`track-${t.id}`}
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
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatTime(t.duration)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`menu-${t.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onPickCover(t.id);
                          }}
                        >
                          <ImagePlus className="w-4 h-4 mr-2" />
                          Change cover
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTrack(t);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTrack(t.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {tracks.length > 0 && filtered.length === 0 && (
            <li className="text-center text-sm text-muted-foreground p-6">
              No matches
            </li>
          )}
        </ul>
      </ScrollArea>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={onAddChange}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onCoverChange}
      />
      {editTrack && (
        <EditTrackDialog
          open={!!editTrack}
          onOpenChange={(o) => !o && setEditTrack(null)}
          track={editTrack}
        />
      )}
    </aside>
  );
}

function EqualizerBars() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] bg-primary rounded-sm origin-bottom"
          style={{
            animation: `eq 1s ${i * 0.15}s ease-in-out infinite`,
            height: "100%",
          }}
        />
      ))}
      <style>{`
        @keyframes eq {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
