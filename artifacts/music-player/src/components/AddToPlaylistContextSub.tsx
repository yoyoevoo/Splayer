import { Check, ListMusic, Plus } from "lucide-react";
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import type { Playlist } from "@/lib/types";

interface Props {
  trackId:             string;
  playlists:           Playlist[];
  addTracksToPlaylist: (id: string, trackIds: string[]) => Promise<void>;
  onCreateNew:         () => void;
}

export function AddToPlaylistContextSub({
  trackId,
  playlists,
  addTracksToPlaylist,
  onCreateNew,
}: Props) {
  const { toast } = useToast();

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <ListMusic className="w-4 h-4 mr-2" />
        Add to Playlist
      </ContextMenuSubTrigger>

      <ContextMenuSubContent className="w-56 p-1">
        {/* New Playlist button */}
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors cursor-pointer text-left"
          onClick={() => onCreateNew()}
        >
          <Plus className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium">New Playlist…</span>
        </button>

        {playlists.length > 0 && (
          <div className="my-1 h-px bg-border mx-1" />
        )}

        {playlists.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-2 italic">
            No playlists yet
          </p>
        )}

        {/* Scrollable playlist list */}
        <div className="max-h-52 overflow-y-auto space-y-px">
          {playlists.map((p) => {
            const alreadyIn = p.trackIds.includes(trackId);
            return (
              <button
                key={p.id}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors cursor-pointer text-left"
                onClick={async () => {
                  if (alreadyIn) {
                    toast({ description: `Already in "${p.name}"` });
                  } else {
                    await addTracksToPlaylist(p.id, [trackId]);
                    toast({ description: `✅ Added to "${p.name}"` });
                  }
                }}
              >
                {/* Cover thumbnail */}
                <div className="w-6 h-6 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center">
                  {p.customCoverUrl ? (
                    <img
                      src={p.customCoverUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ListMusic className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>

                {/* Playlist name */}
                <span className="flex-1 truncate">{p.name}</span>

                {/* Track count */}
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {p.trackIds.length}
                </span>

                {/* Checkmark if already in playlist */}
                {alreadyIn && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
