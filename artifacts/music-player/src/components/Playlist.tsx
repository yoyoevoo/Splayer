import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  FileMusic,
  FolderOpen,
  Heart,
  ImageDown,
  ImagePlus,
  ListMusic,
  Music,
  MoreHorizontal,
  Pencil,
  Plus,
  ScanSearch,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/lib/player-context";
import { trackCoverUrl } from "@/lib/types";
import type { Playlist as PlaylistType, Track } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlbumCover } from "./AlbumCover";
import { EditTrackDialog } from "./EditTrackDialog";
import { BulkTagEditor } from "./BulkTagEditor";
import { ArtworkFetcher } from "./ArtworkFetcher";
import { DuplicateFinder } from "./DuplicateFinder";
import { PlaylistsView } from "./PlaylistsView";
import { PlaylistDetailView } from "./PlaylistDetailView";
import { SmartPlaylistView } from "./SmartPlaylistView";
import { NewPlaylistDialog } from "./NewPlaylistDialog";
import { EqualizerBars } from "./EqualizerBars";
import type { SmartPlaylistKind } from "@/lib/types";

type Tab = "library" | "playlists";
type View =
  | { kind: "library" }
  | { kind: "playlists" }
  | { kind: "playlist"; id: string }
  | { kind: "smart"; smart: SmartPlaylistKind };

export function Playlist() {
  const [view, setView] = useState<View>({ kind: "library" });

  const tab: Tab = view.kind === "library" ? "library" : "playlists";

  return (
    <aside className="w-full md:w-80 lg:w-96 flex flex-col border-l border-card-border bg-sidebar/40 backdrop-blur min-h-0">
      <div className="px-3 pt-3 pb-1 border-b border-card-border">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted/40">
          <button
            type="button"
            onClick={() => setView({ kind: "library" })}
            className={cn(
              "flex items-center justify-center gap-1.5 text-xs h-7 rounded transition-colors",
              tab === "library"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-library"
          >
            <Music className="w-3.5 h-3.5" />
            Library
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: "playlists" })}
            className={cn(
              "flex items-center justify-center gap-1.5 text-xs h-7 rounded transition-colors",
              tab === "playlists"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-playlists"
          >
            <ListMusic className="w-3.5 h-3.5" />
            Playlists
          </button>
        </div>
      </div>

      {view.kind === "library" && <LibraryView />}
      {view.kind === "playlists" && (
        <PlaylistsView
          onOpenPlaylist={(p) => setView({ kind: "playlist", id: p.id })}
          onOpenSmart={(s) => setView({ kind: "smart", smart: s })}
        />
      )}
      {view.kind === "playlist" && (
        <PlaylistDetailView
          playlistId={view.id}
          onBack={() => setView({ kind: "playlists" })}
        />
      )}
      {view.kind === "smart" && (
        <SmartPlaylistView
          kind={view.smart}
          onBack={() => setView({ kind: "playlists" })}
        />
      )}
    </aside>
  );
}

function LibraryView() {
  const {
    tracks,
    playlists,
    currentTrack,
    isPlaying,
    playFromList,
    addFiles,
    removeTrack,
    setCustomCover,
    addTracksToPlaylist,
    toggleLike,
  } = usePlayer();
  const [query, setQuery] = useState("");
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [newPlaylistFor, setNewPlaylistFor] = useState<string | null>(null);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [artFetcherOpen, setArtFetcherOpen] = useState(false);
  const [dupFinderOpen, setDupFinderOpen] = useState(false);
  const missingArtCount = tracks.filter((t) => !trackCoverUrl(t)).length;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 space-y-3 border-b border-card-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-foreground/80 uppercase">
            Library
          </h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setDupFinderOpen(true)}
              title="Find Duplicates"
              data-testid="button-find-duplicates"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              <span className="sr-only">Find Duplicates</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 relative"
              onClick={() => setArtFetcherOpen(true)}
              title="Fetch Missing Artwork"
              data-testid="button-fetch-artwork"
            >
              <ImageDown className="w-3.5 h-3.5" />
              {missingArtCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-[14px] text-center tabular-nums">
                  {missingArtCount}
                </span>
              )}
              <span className="sr-only">Fetch Missing Artwork</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setBulkEditorOpen(true)}
              title="Bulk Tag Editor"
              data-testid="button-bulk-tag-editor"
            >
              <Tags className="w-3.5 h-3.5" />
              <span className="sr-only">Bulk Tag Editor</span>
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                data-testid="button-add-music"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <FileMusic className="w-4 h-4 mr-2" />
                Add files...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                <FolderOpen className="w-4 h-4 mr-2" />
                Add folder...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
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
                    onClick={() =>
                      playFromList(
                        tracks.map((tr) => tr.id),
                        i,
                        "Library",
                      )
                    }
                    data-testid={`track-${t.id}`}
                  >
                    <div className="relative">
                      <AlbumCover
                        src={trackCoverUrl(t)}
                        seed={t.title + t.artist}
                        size="sm"
                        showFetchBadge={!trackCoverUrl(t)}
                        onFetchBadgeClick={() => setArtFetcherOpen(true)}
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
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(t.id);
                      }}
                      className={cn(
                        "h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0",
                        t.liked ? "text-red-500 opacity-100" : "text-muted-foreground",
                      )}
                      aria-label={t.liked ? "Unlike" : "Like"}
                    >
                      <Heart
                        className="w-3.5 h-3.5"
                        fill={t.liked ? "currentColor" : "none"}
                      />
                    </Button>
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
                        <AddToPlaylistSubmenu
                          playlists={playlists}
                          onAdd={(plId) =>
                            addTracksToPlaylist(plId, [t.id])
                          }
                          onCreate={() => setNewPlaylistFor(t.id)}
                        />
                        <DropdownMenuSeparator />
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
        accept="audio/*,video/mp4,video/*,.mp4,.m4a,.m4v,.mov,.mkv,.webm"
        multiple
        className="hidden"
        onChange={onAddChange}
      />
      <input
        ref={folderInputRef}
        type="file"
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
      <BulkTagEditor
        open={bulkEditorOpen}
        onOpenChange={setBulkEditorOpen}
      />
      <ArtworkFetcher
        open={artFetcherOpen}
        onOpenChange={setArtFetcherOpen}
      />
      <DuplicateFinder
        open={dupFinderOpen}
        onOpenChange={setDupFinderOpen}
      />
      <NewPlaylistDialog
        open={newPlaylistFor !== null}
        onOpenChange={(o) => {
          if (!o) setNewPlaylistFor(null);
        }}
        onCreated={(id) => {
          if (newPlaylistFor) {
            addTracksToPlaylist(id, [newPlaylistFor]);
          }
          setNewPlaylistFor(null);
        }}
      />
    </div>
  );
}

function AddToPlaylistSubmenu({
  playlists,
  onAdd,
  onCreate,
}: {
  playlists: PlaylistType[];
  onAdd: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ListMusic className="w-4 h-4 mr-2" />
        Add to playlist
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCreate();
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New playlist…
          </DropdownMenuItem>
          {playlists.length > 0 && <DropdownMenuSeparator />}
          {playlists.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(p.id);
              }}
            >
              {p.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

