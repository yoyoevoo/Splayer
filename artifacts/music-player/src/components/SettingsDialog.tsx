import { useState, useRef, useEffect } from "react";
import { FolderOpen, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── localStorage keys ────────────────────────────────────────────────────────

const LS = {
  musicLibrary: "settings-music-library-path",
  downloads:    "settings-downloads-path",
  videos:       "settings-videos-path",
} as const;

function readPath(key: string): string {
  try { return localStorage.getItem(key) ?? ""; }
  catch { return ""; }
}

function savePath(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

// ── FolderRow ────────────────────────────────────────────────────────────────

interface FolderRowProps {
  label:       string;
  description: string;
  lsKey:       string;
}

function FolderRow({ label, description, lsKey }: FolderRowProps) {
  const [path,  setPath]  = useState(() => readPath(lsKey));
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isElectron = !!window.electronAPI?.showFolderDialog;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function flash() {
    if (timer.current) clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), 2000);
  }

  async function handlePick() {
    const picked = await window.electronAPI!.showFolderDialog();
    if (picked) {
      setPath(picked);
      savePath(lsKey, picked);
      flash();
    }
  }

  function handleType(v: string) {
    setPath(v);
    savePath(lsKey, v);
    flash();
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex gap-2 items-center">
        <Input
          value={path}
          onChange={isElectron ? undefined : (e) => handleType(e.target.value)}
          readOnly={isElectron}
          placeholder="No folder selected"
          className="flex-1 text-xs font-mono"
          spellCheck={false}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={handlePick}
          disabled={!isElectron}
          title={
            isElectron
              ? "Choose a folder"
              : "Folder picker is only available in the desktop app"
          }
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Change
        </Button>
      </div>
      <p
        className={cn(
          "text-xs text-green-500 transition-opacity duration-300",
          saved ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        ✅ Saved
      </p>
    </div>
  );
}

// ── SettingsDialog ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-1">

          {/* ── Section: File Locations ── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              File Locations
            </p>

            <div className="space-y-5">
              <FolderRow
                label="Music Library Folder"
                description="The folder where your local music files live."
                lsKey={LS.musicLibrary}
              />

              <hr className="border-card-border" />

              <FolderRow
                label="Downloads Folder"
                description="Where downloaded YouTube audio files (MP3) are saved."
                lsKey={LS.downloads}
              />

              <hr className="border-card-border" />

              <FolderRow
                label="Videos Folder"
                description="Where downloaded YouTube video files (MP4) are saved."
                lsKey={LS.videos}
              />
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
