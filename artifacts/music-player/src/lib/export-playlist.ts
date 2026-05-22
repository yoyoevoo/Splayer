import { platformAPI } from "./platform-api";
import { getTrackMetadata } from "./idb";
import { toast } from "@/hooks/use-toast";
import type { Track, Playlist } from "./types";

function normalisePath(raw: string): string {
  let p = raw.trim();
  if (p.startsWith("file://")) {
    p = p.startsWith("file:///") ? p.slice(8) : p.slice(7);
    if (!p.startsWith("/") && !p.match(/^[A-Za-z]:/)) p = "/" + p;
  }
  try { p = decodeURIComponent(p); } catch { /* keep as-is */ }
  return p;
}

async function resolveTrackPath(track: Track): Promise<string | null> {
  // Tier 1: Electron File.path
  const filePath = (track.file as { path?: string } | undefined)?.path;
  if (filePath) return normalisePath(filePath);

  // Tier 2: track.path (Android URIs / scan-backfilled paths)
  if (track.path) return normalisePath(track.path);

  // Tier 3: IDB stored filePath
  try {
    const meta = await getTrackMetadata(track.id);
    if (meta?.filePath) return normalisePath(meta.filePath);
  } catch { /* ignore */ }

  return null;
}

export async function exportPlaylistAsM3U(
  playlist: Playlist,
  tracks: Track[],
): Promise<void> {
  const api = platformAPI as typeof window.electronAPI;
  if (!api?.showSaveDialog || !api?.writeFile) return;

  const savePath = await api.showSaveDialog({
    defaultName: `${playlist.name}.m3u`,
    filters: [
      { name: "M3U Playlist", extensions: ["m3u"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!savePath) return;

  const plTracks = playlist.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));

  const lines: string[] = ["#EXTM3U"];
  for (const track of plTracks) {
    const path = await resolveTrackPath(track);
    if (!path) continue;
    const duration = Math.floor(track.duration ?? -1);
    const artist = track.artist || "Unknown Artist";
    const title = track.title || "Unknown Title";
    lines.push(`#EXTINF:${duration},${artist} - ${title}`);
    lines.push(path);
  }

  const content = lines.join("\n") + "\n";
  const bytes = new TextEncoder().encode(content);

  const result = await api.writeFile(savePath, bytes);
  if (result.success) {
    const filename = savePath.split(/[\\/]/).pop() ?? savePath;
    toast({ title: `Playlist exported to ${filename}`, duration: 4000 });
  } else {
    toast({
      title: "Export failed",
      description: result.error ?? "Could not write file",
      variant: "destructive",
      duration: 5000,
    });
  }
}
