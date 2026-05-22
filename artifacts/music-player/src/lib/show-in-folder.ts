import { platformAPI } from "./platform-api";
import { getTrackMetadata, saveStoredTrack } from "./idb";
import { toast } from "@/hooks/use-toast";

/** Normalise any path-like string to a real disk path. */
function normalisePath(raw: string): string {
  let p = raw.trim();
  if (p.startsWith("file://")) {
    p = p.startsWith("file:///")
      ? p.slice("file:///".length)
      : p.slice("file://".length);
    if (!p.startsWith("/") && !p.match(/^[A-Za-z]:/)) p = "/" + p;
  }
  try { p = decodeURIComponent(p); } catch { /* keep as-is */ }
  return p;
}

/**
 * Resolve the real disk path for a track using four tiers + a filename
 * fallback scan. Opens the file manager, or shows a toast on failure.
 */
export async function showTrackInFolder(
  track: { id: string; file?: File | null; path?: string; url?: string },
): Promise<void> {
  // Tier 1: Electron File.path (picker-added files)
  let raw: string | undefined = (track.file as any)?.path as string | undefined;
  if (raw) console.log("[showInFolder] source=file.path", raw);

  // Tier 2: track.path (Android URIs or backfilled by scan)
  if (!raw && track.path) {
    raw = track.path;
    console.log("[showInFolder] source=track.path", raw);
  }

  // Tier 3: IDB stored filePath (scanned/downloaded tracks)
  if (!raw) {
    try {
      const meta = await getTrackMetadata(track.id);
      if (meta?.filePath) {
        raw = meta.filePath;
        console.log("[showInFolder] source=IDB filePath", raw);
      }
    } catch (e) { console.warn("[showInFolder] IDB lookup error", e); }
  }

  // Tier 4: track.url when it's a file:// URL (not blob:)
  if (!raw && track.url?.startsWith("file://")) {
    raw = track.url;
    console.log("[showInFolder] source=track.url (file://)", raw);
  }

  // Tier 5: filename-based search in common directories
  if (!raw && track.file?.name) {
    console.log("[showInFolder] tier-5: searching by filename", track.file.name);
    const extraDirs: string[] = [];
    const dlDir = localStorage.getItem("settings-downloads-path");
    if (dlDir) extraDirs.push(dlDir);
    try {
      const result = await (platformAPI as any)?.findTrackPath?.(
        track.file.name,
        extraDirs,
      ) as { found: boolean; path?: string } | undefined;
      if (result?.found && result.path) {
        raw = result.path;
        console.log("[showInFolder] source=filename scan", raw);
        saveStoredTrack(track.id, { filePath: raw }).catch(() => {});
      }
    } catch (e) { console.warn("[showInFolder] filename scan error", e); }
  }

  // Tier 6: blob recovery — extract IDB blob, write to disk, clear blob from IDB
  if (!raw) {
    try {
      const meta = await getTrackMetadata(track.id);
      const blob = meta?.fileBlob as Blob | undefined;
      if (blob && blob.size > 0 && (platformAPI as any)?.writeFile && (platformAPI as any)?.getAppPaths) {
        const dirs = await (platformAPI as any).getAppPaths() as { downloads: string } | undefined;
        if (dirs?.downloads) {
          // Sanitise filename: remove [NA] prefix and forbidden characters
          const baseName = track.file?.name ?? meta?.fileName ?? "recovered_track";
          const sanitised = baseName
            .replace(/^\[NA\]\s*/i, "")
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
            .trim() || "recovered_track";
          const ext = sanitised.includes(".") ? "" : (meta?.fileType?.split("/")[1] ?? "mp3");
          const filename = sanitised + (ext ? `.${ext}` : "");
          const destPath = `${dirs.downloads}/${filename}`;

          console.log("[showInFolder] tier-6 blob recovery →", destPath);
          const toastId = toast({
            title: "Recovering file to Downloads…",
            description: filename,
            duration: 30000,
          });

          const bytes = new Uint8Array(await blob.arrayBuffer());
          const result = await (platformAPI as any).writeFile(destPath, bytes) as { success: boolean };

          if (result.success) {
            raw = destPath;
            // Persist the new path and clear the blob (file now lives on disk)
            await saveStoredTrack(track.id, {
              filePath: destPath,
              fileBlob: undefined as any,
            });
            console.log("[showInFolder] blob recovered to disk, IDB blob cleared");
            toast({
              title: "File recovered!",
              description: `Saved to ${dirs.downloads}`,
              duration: 5000,
            });
          } else {
            console.warn("[showInFolder] writeFile failed for blob recovery");
          }
        }
      }
    } catch (e) { console.warn("[showInFolder] blob recovery error", e); }
  }

  // All tiers exhausted — log full track for debugging
  if (!raw) {
    console.warn("[showInFolder] FAILED — full track object:",
      JSON.stringify({
        id:      track.id,
        path:    track.path,
        url:     track.url,
        name:    track.file?.name,
        size:    track.file?.size,
        filePath: (track.file as any)?.path,
      })
    );
    const isBlobOnly = track.url?.startsWith("blob:");
    toast({
      title: isBlobOnly ? "This track was added from memory only." : "File not found on disk",
      description: isBlobOnly
        ? "Use Add Music to re-add it from your disk."
        : "The file may have been moved or deleted.",
      variant: "destructive",
      duration: 6000,
    });
    return;
  }

  const resolved = normalisePath(raw);
  console.log("[showInFolder] resolved path →", resolved);
  (platformAPI as any)?.showInFolder?.(resolved);
}
