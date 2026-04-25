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
  addedAt: number;
  playCount: number;
  lastPlayedAt?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  customCoverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type SmartPlaylistKind =
  | "most-played"
  | "recently-added"
  | "never-played";

export interface SmartPlaylist {
  kind: SmartPlaylistKind;
  name: string;
  description: string;
}

export const SMART_PLAYLISTS: SmartPlaylist[] = [
  {
    kind: "most-played",
    name: "Most Played",
    description: "Your top 50 tracks by play count",
  },
  {
    kind: "recently-added",
    name: "Recently Added",
    description: "Latest additions to your library",
  },
  {
    kind: "never-played",
    name: "Never Played",
    description: "Tracks you haven't listened to yet",
  },
];

export function smartPlaylistTracks(
  kind: SmartPlaylistKind,
  allTracks: Track[],
): Track[] {
  switch (kind) {
    case "most-played":
      return [...allTracks]
        .filter((t) => (t.playCount ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.playCount ?? 0) - (a.playCount ?? 0) ||
            (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
        )
        .slice(0, 50);
    case "recently-added":
      return [...allTracks]
        .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
        .slice(0, 50);
    case "never-played":
      return [...allTracks]
        .filter((t) => (t.playCount ?? 0) === 0)
        .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  }
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
