import { useState, useRef, useEffect } from "react";
import { Archive, Download, FolderOpen, Monitor, Settings, Upload } from "lucide-react";
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
import {
  getAllStoredTracks,
  getAllStoredPlaylists,
  saveStoredTrack,
  saveStoredPlaylist,
} from "@/lib/idb";

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

// ── BackupSection ─────────────────────────────────────────────────────────────

function BackupSection() {
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string) {
    setStatus(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(null), 4000);
  }

  async function handleExport() {
    setExporting(true);
    try {
      // Collect all localStorage entries
      const lsData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) lsData[key] = localStorage.getItem(key) ?? "";
      }
      // Collect IDB data (metadata only, no audio blobs)
      const [storedTracks, storedPlaylists] = await Promise.all([
        getAllStoredTracks(),
        getAllStoredPlaylists(),
      ]);
      const tracksMeta = storedTracks.map(({ fileBlob: _fb, embeddedCover: _ec, customCover: _cc, ...rest }) => rest);

      const backup = {
        version: 1,
        app: "Splayer",
        exportedAt: Date.now(),
        localStorage: lsData,
        tracksMeta,
        playlists: storedPlaylists.map(({ customCover: _cc, ...rest }) => rest),
      };

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `Splayer_backup_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flash("✅ Backup exported");
    } catch (e) {
      flash("❌ Export failed");
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!window.confirm("This will replace all current data with the backup. Are you sure?")) return;
    setImporting(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup?.version || backup?.app !== "Splayer") {
        flash("❌ Invalid backup file");
        return;
      }
      // Restore localStorage
      if (backup.localStorage) {
        for (const [k, v] of Object.entries(backup.localStorage)) {
          try { localStorage.setItem(k, v as string); } catch (_) {}
        }
      }
      // Restore track metadata (without blobs — auto-scan will restore audio)
      if (Array.isArray(backup.tracksMeta)) {
        for (const t of backup.tracksMeta) {
          if (t?.id) await saveStoredTrack(t.id, t);
        }
      }
      // Restore playlists
      if (Array.isArray(backup.playlists)) {
        for (const p of backup.playlists) {
          if (p?.id) await saveStoredPlaylist(p);
        }
      }
      flash("✅ Backup restored — reloading…");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      flash("❌ Import failed — invalid file");
      console.error(e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4 py-1">
      <div>
        <p className="text-sm font-medium text-foreground">Export Backup</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Save all your playlists, settings, themes, and preferences as a single
          JSON file you can restore later.
        </p>
        <Button
          className="mt-3 gap-2"
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
        >
          <Upload className="w-4 h-4" />
          {exporting ? "Exporting…" : "📤 Export Backup"}
        </Button>
      </div>

      <hr className="border-card-border" />

      <div>
        <p className="text-sm font-medium text-foreground">Import Backup</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Restore from a previously exported Splayer backup file. Your current
          data will be replaced.
        </p>
        <Button
          className="mt-3 gap-2"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          <Download className="w-4 h-4" />
          {importing ? "Importing…" : "📥 Import Backup"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      {status && (
        <p className="text-xs text-green-500 mt-2">{status}</p>
      )}
    </div>
  );
}

// ── SettingsDialog ────────────────────────────────────────────────────────────

type Tab = "folders" | "downloads" | "behavior" | "backup";

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
          <button
            onClick={() => setTab("backup")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 font-medium transition-colors",
              tab === "backup"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Archive className="w-3.5 h-3.5" />
            Backup
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

        {/* ── Backup tab ── */}
        {tab === "backup" && (
          <div className="py-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Backup &amp; Restore
            </p>
            <BackupSection />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
