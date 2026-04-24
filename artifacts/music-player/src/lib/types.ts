export type RepeatMode = "off" | "all" | "one";

export interface Track {
  id: string;
  file: File;
  url: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  duration: number;
  embeddedCoverUrl?: string;
  customCoverUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  customCoverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export function trackCoverUrl(t: Track): string | undefined {
  return t.customCoverUrl ?? t.embeddedCoverUrl;
}

export function playlistTracks(playlist: Playlist, allTracks: Track[]): Track[] {
  const map = new Map(allTracks.map((t) => [t.id, t]));
  const out: Track[] = [];
  for (const id of playlist.trackIds) {
    const t = map.get(id);
    if (t) out.push(t);
  }
  return out;
}

export function playlistDuration(playlist: Playlist, allTracks: Track[]): number {
  return playlistTracks(playlist, allTracks).reduce(
    (sum, t) => sum + (t.duration || 0),
    0,
  );
}
