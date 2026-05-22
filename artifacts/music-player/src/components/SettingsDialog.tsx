import { useState, useRef, useEffect } from "react";
import { platformAPI } from "@/lib/platform-api";
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
import {
  AB,
  abEnabled,
  abFreqDays,
  abLastLabel,
  runAutoBackup,
} from "@/lib/auto-backup";

// ── localStorage keys ────────────────────────────────────────────────────────

const LS = {
  musicLibrary:  "settings-music-library-path",
  downloads:     "settings-downloads-path",
  videos:        "settings-videos-path",
  backup:        "settings-backup-path",
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

  const isElectron = !!platformAPI?.showFolderDialog;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function flash() {
    if (timer.current) clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), 2000);
  }

  async function handlePick() {
    const picked = await platformAPI!.showFolderDialog();
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
    platformAPI?.setCloseBehavior?.(v);
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

      {!platformAPI && (
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

  // ── Auto-backup state ──────────────────────────────────────────────────────
  const [autoEnabled, setAutoEnabled]   = useState(() => abEnabled());
  const [autoFreq, setAutoFreq]         = useState(() => abFreqDays());
  const [autoLast, setAutoLast]         = useState(() => abLastLabel());
  const [autoStatus, setAutoStatus]     = useState<string | null>(null);
  const [autoRunning, setAutoRunning]   = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noFolder = !(localStorage.getItem(LS.backup)?.trim());

  function flashAuto(msg: string) {
    setAutoStatus(msg);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => setAutoStatus(null), 4000);
  }

  function toggleAuto() {
    const next = !autoEnabled;
    setAutoEnabled(next);
    localStorage.setItem(AB.enabled, String(next));
  }

  function changeFreq(days: number) {
    setAutoFreq(days);
    localStorage.setItem(AB.freqDays, String(days));
  }

  async function testAutoBackup() {
    setAutoRunning(true);
    const result = await runAutoBackup();
    if (result === "ok") {
      setAutoLast(abLastLabel());
      flashAuto("✅ Backup saved to Downloads");
    } else if (result === "no-folder") {
      flashAuto("❌ Set your Downloads folder first (Folders tab)");
    } else {
      flashAuto("❌ Backup failed — check console");
    }
    setAutoRunning(false);
  }

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

      <hr className="border-card-border" />

      {/* ── Auto Backup ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto Backup</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically save backups to your Downloads folder on a schedule.
            </p>
          </div>
          {/* Toggle switch */}
          <button
            onClick={toggleAuto}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
              autoEnabled ? "bg-primary" : "bg-muted",
            )}
            role="switch"
            aria-checked={autoEnabled}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200",
                autoEnabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>

        {autoEnabled && (
          <div className="space-y-3 pl-1">
            {/* Frequency selector */}
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground whitespace-nowrap">Frequency:</p>
              <div className="flex gap-1.5">
                {([3, 7, 14] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => changeFreq(d)}
                    className={cn(
                      "px-3 py-1 text-xs rounded-md border transition-colors",
                      autoFreq === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-card-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                    )}
                  >
                    {d === 3 ? "Every 3 days" : d === 7 ? "Every 7 days" : "Every 14 days"}
                  </button>
                ))}
              </div>
            </div>

            {/* Last backup timestamp */}
            <p className="text-xs text-muted-foreground">
              Last backup:{" "}
              <span className={cn("font-medium", autoLast === "Never" ? "text-muted-foreground/60" : "text-foreground")}>
                {autoLast}
              </span>
            </p>

            {/* Warning if no Downloads folder set */}
            {noFolder && (
              <p className="text-xs text-amber-500/90">
                ⚠️ Set your Downloads folder in the Folders tab for auto backup to work.
              </p>
            )}

            {/* Test button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-7"
              onClick={testAutoBackup}
              disabled={autoRunning || noFolder}
            >
              <Archive className="w-3.5 h-3.5" />
              {autoRunning ? "Saving…" : "Back up now"}
            </Button>

            {autoStatus && (
              <p className="text-xs text-green-500">{autoStatus}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StartOnBootSection ────────────────────────────────────────────────────────

function StartOnBootSection() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("start-on-boot") === "true",
  );
  const [loading, setLoading] = useState(true);

  // Sync with the real OS state on mount so the toggle always reflects reality.
  useEffect(() => {
    (platformAPI as any)?.getLoginItemSettings?.()
      .then(({ openAtLogin }: { openAtLogin: boolean }) => {
        setEnabled(openAtLogin);
        try { localStorage.setItem("start-on-boot", openAtLogin ? "true" : "false"); } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem("start-on-boot", next ? "true" : "false"); } catch {}
    await (platformAPI as any)?.setLoginItemSettings?.(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Start on boot</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatically launch Splayer when you log in.
          </p>
        </div>
        <button
          onClick={loading ? undefined : toggle}
          disabled={!platformAPI}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
            enabled ? "bg-primary" : "bg-muted",
            loading ? "opacity-60 cursor-wait" : "cursor-pointer",
            !platformAPI && "opacity-40 cursor-not-allowed",
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
      {!platformAPI && (
        <p className="text-xs text-muted-foreground/60 italic">
          Start on boot only works in the desktop app.
        </p>
      )}
    </div>
  );
}

// ── OsMediaSection ────────────────────────────────────────────────────────────

function OsMediaSection() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("os-media-enabled") !== "false",
  );

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem("os-media-enabled", next ? "true" : "false"); } catch {}
    (platformAPI as any)?.setOsMediaEnabled?.(next);
  }

  const platform = (platformAPI as any)?.platform as string | undefined;
  const isLinux  = platform === "linux";
  const isWin    = platform === "win32";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">OS Media Integration</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLinux && "Show current track in GNOME / KDE media widget (MPRIS). Responds to media keys from the OS."}
            {isWin  && "Show current track in the Windows media popup (SMTC). Responds to volume-key media controls."}
            {!isLinux && !isWin && "Shows track info and responds to OS media keys (MPRIS on Linux, SMTC on Windows)."}
          </p>
        </div>
        <button
          onClick={toggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
            enabled ? "bg-primary" : "bg-muted",
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
      {!platformAPI && (
        <p className="text-xs text-muted-foreground/60 italic">
          OS media integration only works in the desktop app.
        </p>
      )}
    </div>
  );
}

// ── DiscordSection ────────────────────────────────────────────────────────────

function DiscordSection() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("discord-rpc-enabled") !== "false",
  );

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem("discord-rpc-enabled", next ? "true" : "false"); } catch {}
    (platformAPI as any)?.discordRpcSetEnabled?.(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Discord Rich Presence</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Show the currently playing song on your Discord profile.
            Requires Discord to be open and a configured application ID in{" "}
            <span className="font-mono">electron/main.cjs</span>.
          </p>
        </div>
        <button
          onClick={toggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
            enabled ? "bg-primary" : "bg-muted",
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
      {!platformAPI && (
        <p className="text-xs text-muted-foreground/60 italic">
          Discord Rich Presence only works in the desktop app.
        </p>
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
  const [folderKey, setFolderKey] = useState(0);

  function resetToDefaults() {
    (platformAPI as any)?.getAppPaths?.().then((dirs: { downloads: string; backups: string } | undefined) => {
      if (!dirs) return;
      try {
        localStorage.setItem(LS.musicLibrary, dirs.downloads);
        localStorage.setItem(LS.downloads,    dirs.downloads);
        localStorage.setItem(LS.videos,       dirs.downloads);
        localStorage.setItem(LS.backup,       dirs.backups);
        localStorage.setItem("splayer-folders-v1", "1");
        setFolderKey((k) => k + 1); // remount FolderRows to read updated values
      } catch {}
    }).catch(() => {});
  }

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
              key={`music-${folderKey}`}
              label="Music Library Folder"
              description="The folder where your local music files live."
              lsKey={LS.musicLibrary}
            />

            <hr className="border-card-border" />

            <FolderRow
              key={`downloads-${folderKey}`}
              label="Downloads Folder"
              description="Where downloaded YouTube audio files are saved to disk."
              lsKey={LS.downloads}
            />

            <hr className="border-card-border" />

            <FolderRow
              key={`videos-${folderKey}`}
              label="Videos Folder"
              description="Where downloaded YouTube video files (MP4) are saved to disk."
              lsKey={LS.videos}
            />

            <hr className="border-card-border" />

            <FolderRow
              key={`backup-${folderKey}`}
              label="Backup Folder"
              description="Where automatic and manual backups are saved."
              lsKey={LS.backup}
            />

            <hr className="border-card-border" />

            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={resetToDefaults}>
                Reset to defaults (~/Music/Splayer/)
              </Button>
            </div>
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
          <div className="py-1 space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                App Behavior
              </p>
              <div className="space-y-5">
                <StartOnBootSection />
                <hr className="border-card-border" />
                <CloseBehaviorSection />
              </div>
            </div>
            <hr className="border-card-border" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                OS Media
              </p>
              <OsMediaSection />
            </div>
            <hr className="border-card-border" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Discord
              </p>
              <DiscordSection />
            </div>
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
