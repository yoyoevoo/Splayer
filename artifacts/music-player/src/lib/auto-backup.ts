import { getAllStoredTracks, getAllStoredPlaylists } from "./idb";
import { platformAPI } from "./platform-api";

// ── localStorage keys ─────────────────────────────────────────────────────────
export const AB = {
  enabled:  "auto-backup-enabled",
  freqDays: "auto-backup-freq-days",
  lastTs:   "auto-backup-last-ts",
  history:  "auto-backup-history",
} as const;

export interface BackupEntry { path: string; ts: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
export function abEnabled():  boolean { return localStorage.getItem(AB.enabled)  === "true"; }
export function abFreqDays(): number  { return parseInt(localStorage.getItem(AB.freqDays) ?? "7", 10); }
export function abLastTs():   number  { return parseInt(localStorage.getItem(AB.lastTs)   ?? "0",  10); }
export function abHistory():  BackupEntry[] {
  try { return JSON.parse(localStorage.getItem(AB.history) ?? "[]"); } catch { return []; }
}

export function abLastLabel(): string {
  const ts = abLastTs();
  if (!ts) return "Never";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Build backup payload (shared between manual + auto) ───────────────────────
async function buildBackupJson(): Promise<string> {
  const lsData: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) lsData[key] = localStorage.getItem(key) ?? "";
  }
  const [storedTracks, storedPlaylists] = await Promise.all([
    getAllStoredTracks(),
    getAllStoredPlaylists(),
  ]);
  const tracksMeta = storedTracks.map(
    ({ fileBlob: _fb, embeddedCover: _ec, customCover: _cc, ...rest }) => rest,
  );
  return JSON.stringify(
    {
      version:     1,
      app:         "Splayer",
      exportedAt:  Date.now(),
      localStorage: lsData,
      tracksMeta,
      playlists:   storedPlaylists.map(({ customCover: _cc, ...rest }) => rest),
    },
    null,
    2,
  );
}

// ── Trigger one auto-backup ───────────────────────────────────────────────────
export async function runAutoBackup(): Promise<"ok" | "no-folder" | "error"> {
  const downloadsDir = (
    localStorage.getItem("settings-backup-path") ||
    localStorage.getItem("settings-downloads-path")
  )?.trim();
  if (!downloadsDir) return "no-folder";
  if (!platformAPI?.writeFile || !platformAPI?.deleteFile) return "error";

  try {
    const json  = await buildBackupJson();
    const bytes = new TextEncoder().encode(json);
    const date  = new Date().toISOString().slice(0, 10);
    const fname = `Splayer_auto_backup_${date}.json`;
    const fpath = `${downloadsDir}/${fname}`;

    const result = await platformAPI.writeFile(fpath, bytes);
    if (!result.success) return "error";

    const now     = Date.now();
    const history = abHistory();
    const next    = [{ path: fpath, ts: now }, ...history].slice(0, 3);
    const toDelete = history.slice(2);   // entries that no longer fit in the 3-file cap

    for (const entry of toDelete) {
      try { await platformAPI.deleteFile(entry.path); } catch {}
    }

    localStorage.setItem(AB.history, JSON.stringify(next));
    localStorage.setItem(AB.lastTs,  String(now));
    return "ok";
  } catch {
    return "error";
  }
}

// ── Check on startup whether a backup is due ──────────────────────────────────
export function checkAndRunAutoBackup(): void {
  if (!abEnabled()) return;
  const freqMs = abFreqDays() * 24 * 60 * 60 * 1000;
  if (Date.now() - abLastTs() >= freqMs) {
    runAutoBackup().catch(console.error);
  }
}
