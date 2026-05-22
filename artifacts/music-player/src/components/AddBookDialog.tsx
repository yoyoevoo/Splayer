import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Loader2, Upload, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

type AddTab = "url" | "file";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAddUrl:  (url:  string) => Promise<{ error?: string }>;
  onAddFile: (file: File)   => Promise<{ error?: string }>;
}

export function AddBookDialog({ open, onOpenChange, onAddUrl, onAddFile }: Props) {
  const [tab,     setTab]     = useState<AddTab>("url");
  const [url,     setUrl]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setUrl("");
    setError(null);
    setFileName(null);
    fileRef.current = null;
  };

  const handleAddUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    const res = await onAddUrl(url.trim());
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    reset();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    fileRef.current = f;
    setFileName(f.name);
    setError(null);
    e.target.value = "";
  };

  const handleAddFile = async () => {
    if (!fileRef.current) return;
    setLoading(true);
    setError(null);
    const res = await onAddFile(fileRef.current);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    reset();
    onOpenChange(false);
  };

  const isYt = /youtube\.com|youtu\.be/i.test(url);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Add Audiobook
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted/40 rounded-md">
          {(["url", "file"] as AddTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(null); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 text-xs h-7 rounded transition-colors",
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "url"
                ? <><Youtube className="w-3.5 h-3.5 text-red-500" /> YouTube URL</>
                : <><Upload className="w-3.5 h-3.5" /> Upload File</>}
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-1">
          {tab === "url" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Paste a YouTube playlist or single video URL.
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {isYt
                    ? <Youtube className="w-4 h-4 text-red-500" />
                    : <BookOpen className="w-4 h-4" />}
                </span>
                <Input
                  className="pl-9"
                  placeholder="https://youtube.com/playlist?list=..."
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Supports MP3, M4A, M4B, OGG. Chapters and cover art are read automatically.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center gap-2",
                  "hover:border-primary/50 hover:bg-muted/20 transition-colors",
                  "text-muted-foreground",
                  fileName && "border-primary/40 bg-primary/5",
                )}
              >
                <Upload className="w-6 h-6" />
                {fileName
                  ? <span className="text-sm text-foreground font-medium truncate max-w-full px-4">{fileName}</span>
                  : <><span className="text-sm font-medium">Click to choose a file</span>
                     <span className="text-xs">mp3 · m4a · m4b · ogg</span></>}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".mp3,.m4a,.m4b,.ogg,audio/mpeg,audio/mp4,audio/ogg"
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              onClick={tab === "url" ? handleAddUrl : handleAddFile}
              disabled={loading || (tab === "url" ? !url.trim() : !fileRef.current)}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? "Loading…" : "Add Book"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
