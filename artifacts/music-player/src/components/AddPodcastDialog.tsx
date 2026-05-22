import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Rss, Youtube } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (url: string) => Promise<{ error?: string }>;
}

export function AddPodcastDialog({ open, onOpenChange, onAdd }: Props) {
  const [url,     setUrl]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const isYt = /youtube\.com|youtu\.be/i.test(url);

  const handleAdd = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    const res = await onAdd(url.trim());
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Podcast</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Paste an RSS feed URL or a YouTube playlist / channel URL.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {isYt
                    ? <Youtube className="w-4 h-4 text-red-500" />
                    : <Rss className="w-4 h-4" />}
                </span>
                <Input
                  className="pl-9"
                  placeholder="https://feeds.example.com/podcast.xml"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  autoFocus
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!url.trim() || loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? "Fetching…" : "Subscribe"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
