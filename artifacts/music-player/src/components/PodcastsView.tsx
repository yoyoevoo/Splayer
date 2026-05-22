import { useState } from "react";
import { Loader2, Mic2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePodcasts } from "@/lib/use-podcasts";
import type { Podcast } from "@/lib/types";
import { PodcastDetailView } from "./PodcastDetailView";
import { AddPodcastDialog } from "./AddPodcastDialog";
import { cn } from "@/lib/utils";

export function PodcastsView() {
  const { podcasts, loading, subscribe, unsubscribe } = usePodcasts();
  const [selected, setSelected]     = useState<Podcast | null>(null);
  const [addOpen,  setAddOpen]       = useState(false);
  const [deleting, setDeleting]      = useState<string | null>(null);

  if (selected) {
    return <PodcastDetailView podcast={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Podcasts
        </span>
        <Button
          size="sm" variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : podcasts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <Mic2 className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No podcasts yet</p>
            <p className="text-xs text-muted-foreground/70">
              Add an RSS feed or YouTube playlist to get started
            </p>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add podcast
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {podcasts.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left",
                  "hover:bg-muted/60 transition-colors group",
                )}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg shrink-0 object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Mic2 className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  {p.description && (
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  )}
                </div>
                <Button
                  size="icon" variant="ghost"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  disabled={deleting === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(p.id);
                    unsubscribe(p.id).finally(() => setDeleting(null));
                  }}
                  title="Unsubscribe"
                >
                  {deleting === p.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </button>
            ))}
          </div>
        )}
      </div>

      <AddPodcastDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={subscribe}
      />
    </div>
  );
}
