export type RepeatMode = "off" | "all" | "one";

export interface Track {
  id: string;
  file: File;
  url: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  genre?: string;
  duration: number;
  embeddedCoverUrl?: string;
  customCoverUrl?: string;
  addedAt: number;
  playCount: number;
  lastPlayedAt?: number;
  liked?: boolean;
  path?: string;
  hasVideo?: boolean;
  videoPath?: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  customCoverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Podcast {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  feedUrl: string;
  addedAt: number;
}

export interface PodcastEpisode {
  id: string;
  podcastId: string;
  title: string;
  description?: string;
  pubDate?: number;
  duration?: number;
  audioUrl: string;
  guid: string;
  played: boolean;
  progress: number;
  thumbnail?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  narrator?: string;
  description?: string;
  coverUrl?: string;
  source: "local" | "youtube";
  feedUrl?: string;
  addedAt: number;
  duration?: number;
  progress?: number;
}

export interface BookChapter {
  id: string;
  bookId: string;
  title: string;
  index: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  audioUrl?: string;
  progress: number;
  played: boolean;
}

export interface BookBookmark {
  id: string;
  bookId: string;
  time: number;
  note: string;
  createdAt: number;
}

export type SmartPlaylistKind =
  | "most-played"
  | "recently-added"
  | "never-played"
  | "recently-played"
  | "liked-songs"
  | "no-playlist";

export interface SmartPlaylist {
  kind: SmartPlaylistKind;
  name: string;
  description: string;
}

export const SMART_PLAYLISTS: SmartPlaylist[] = [
  {
    kind: "liked-songs",
    name: "Liked Songs",
    description: "Tracks you've hearted",
  },
  {
    kind: "recently-played",
    name: "Recently Played",
    description: "Your listening history",
  },
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
  {
    kind: "no-playlist",
    name: "No Playlist",
    description: "Tracks not added to any playlist",
  },
];

export function smartPlaylistTracks(
  kind: SmartPlaylistKind,
  allTracks: Track[],
  playlists?: Playlist[],
): Track[] {
  switch (kind) {
    case "liked-songs":
      return [...allTracks]
        .filter((t) => t.liked)
        .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    case "recently-played":
      return [...allTracks]
        .filter((t) => t.lastPlayedAt != null)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
        .slice(0, 100);
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
    case "no-playlist": {
      const inPlaylist = new Set(
        (playlists ?? []).flatMap((p) => p.trackIds),
      );
      return [...allTracks]
        .filter((t) => !inPlaylist.has(t.id))
        .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    }
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

export type DownloadType = "audio" | "merged";
export type DownloadStatus = "pending" | "downloading" | "done" | "error";

export interface ActiveDownload {
  id: string;
  videoUrl: string;
  title: string;
  author: string;
  thumbnailUrl: string | null;
  type: DownloadType;
  videoFormatId?: string | null;
  progressAudio: number;
  progressVideo: number;
  progressMerge: number;
  status: DownloadStatus;
  errorMsg?: string;
}
