import { useState, useRef, useEffect } from "react";
import { Download, FolderOpen, Monitor, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DownloadsView } from "@/components/DownloadsView";
import { cn } from "@/lib/utils";

// ── localStorage keys ────────────────────────────────────────────────────────

const LS = {
  musicLibrary:  "settings-music-library-path",
  downloads:     "settings-downloads-path",
  videos:        "settings-videos-path",
  closeBehavior: "settings-close-behavior",
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

// ── CloseBehaviorSection ──────────────────────────────────────────────────────

type CloseBehavior = "tray" | "close";

const BEHAVIOR_OPTS: { value: CloseBehavior; label: string; desc: string }[] = [
  {
    value: "tray",
    label: "Minimize to system tray",
    desc:  "The app keeps running in the background and music keeps playing. Click the tray icon to reopen.",
  },
  {
    value: "close",
    label: "Close fully",
    desc:  "The app shuts down completely and music stops.",
  },
];

function CloseBehaviorSection() {
  const [behavior, setBehavior] = useState<CloseBehavior>(() => {
    try { return (localStorage.getItem(LS.closeBehavior) ?? "tray") as CloseBehavior; }
    catch { return "tray"; }
  });

  function select(v: CloseBehavior) {
    setBehavior(v);
    try { localStorage.setItem(LS.closeBehavior, v); } catch {}
    window.electronAPI?.setCloseBehavior?.(v);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">When you click the ✕ button</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose what happens when you close the app window.
        </p>
      </div>

      <div className="space-y-2">
        {BEHAVIOR_OPTS.map((opt) => {
          const active = behavior === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => select(opt.value)}
              className={cn(
                "w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-colors",
                  active
                    ? "border-primary bg-primary"
                    : "border-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", active ? "text-primary" : "text-foreground")}>
                  {opt.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {!window.electronAPI && (
        <p className="text-xs text-muted-foreground/60 italic">
          This setting only applies in the desktop app.
        </p>
      )}
    </div>
  );
}

// ── SettingsDialog ────────────────────────────────────────────────────────────

type Tab = "folders" | "downloads" | "behavior";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<Tab>("folders");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Settings
          </DialogTitle>
        </DialogHeader>

        {/* ── Tab switcher ── */}
        <div className="flex rounded-lg border border-card-border overflow-hidden text-sm -mt-1">
          <button
            onClick={() => setTab("folders")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 font-medium transition-colors",
              tab === "folders"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Folders
          </button>
          <button
            onClick={() => setTab("downloads")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 font-medium transition-colors",
              tab === "downloads"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Downloads
          </button>
          <button
            onClick={() => setTab("behavior")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 font-medium transition-colors",
              tab === "behavior"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Monitor className="w-3.5 h-3.5" />
            Behavior
          </button>
        </div>

        {/* ── Folders tab ── */}
        {tab === "folders" && (
          <div className="space-y-5 py-1">
            <FolderRow
              label="Music Library Folder"
              description="The folder where your local music files live."
              lsKey={LS.musicLibrary}
            />

            <hr className="border-card-border" />

            <FolderRow
              label="Downloads Folder"
              description="Where downloaded YouTube audio files are saved to disk."
              lsKey={LS.downloads}
            />

            <hr className="border-card-border" />

            <FolderRow
              label="Videos Folder"
              description="Where downloaded YouTube video files (MP4) are saved to disk."
              lsKey={LS.videos}
            />
          </div>
        )}

        {/* ── Downloads tab ── */}
        {tab === "downloads" && (
          <div className="py-1 overflow-x-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Download History
            </p>
            <DownloadsView />
          </div>
        )}

        {/* ── Behavior tab ── */}
        {tab === "behavior" && (
          <div className="py-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              App Behavior
            </p>
            <CloseBehaviorSection />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
