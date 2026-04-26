export {};

interface SpotifyTrack {
  id: string;
  name: string;
  artists: string;
  durationMs: number;
}

interface SpotifyPlaylistResult {
  playlistName: string;
  total: number;
  tracks: SpotifyTrack[];
}

interface YtSearchResult {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  durationSecs: number;
  durationText: string;
  thumbnail: string;
}

interface YtVideoInfo {
  title: string;
  author: string;
  durationSecs: number;
  thumbnailUrl: string | null;
}

interface YtDownloadResult extends YtVideoInfo {
  bytes: Uint8Array;
  mimeType: string;
  ext: string;
}

interface YtVideoQuality {
  height:      number;
  label:       string;
  formatId:    string | null;
  fileSizeMB:  number | null;
  available:   boolean;
  recommended: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      /** Opens an OS folder-picker. Returns the chosen path or null. */
      showFolderDialog: () => Promise<string | null>;

      /** Writes bytes to an absolute file path. */
      writeFile: (
        filePath: string,
        bytes: Uint8Array,
      ) => Promise<{ success: boolean; error?: string }>;

      /** Search YouTube for videos matching a query. */
      ytSearch: (query: string) => Promise<YtSearchResult[] | { error: string }>;

      /** Fetch YouTube video metadata without downloading. */
      ytGetInfo: (url: string) => Promise<YtVideoInfo | { error: string }>;

      /** Download audio from a YouTube URL. */
      ytDownload: (url: string) => Promise<YtDownloadResult | { error: string }>;

      /** Download video (MP4) from a YouTube URL. */
      ytDownloadVideo: (url: string) => Promise<YtDownloadResult | { error: string }>;

      /** Fetch available video quality options for a YouTube URL. */
      ytGetQualities: (url: string) => Promise<YtVideoQuality[] | { error: string }>;

      /** Download audio + video then merge into a single MP4 via ffmpeg. */
      ytDownloadMerged: (params: { url: string; videoFormatId?: string | null }) => Promise<YtDownloadResult | { error: string }>;

      /** Returns the port of the local YouTube embed proxy server. */
      getEmbedPort: () => Promise<number>;

      /** Permanently delete a file from disk. */
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;

      /** Set whether closing the window minimizes to tray ("tray") or quits ("close"). */
      setCloseBehavior: (behavior: "tray" | "close") => Promise<void>;

      /** Register (or replace) all global keyboard shortcuts. */
      registerGlobalShortcuts: (shortcuts: Record<string, string>) => Promise<void>;

      /** Push playback state to the main process so the tray stays in sync. */
      updateTrayState: (state: { title: string; artist: string; isPlaying: boolean; volume: number }) => void;

      /** Fetch all tracks from a Spotify playlist URL using the given credentials. */
      spotifyFetchPlaylist: (params: {
        playlistUrl: string;
        clientId: string;
        clientSecret: string;
      }) => Promise<SpotifyPlaylistResult | { error: string }>;

      /** Scan ~/Music, ~/Downloads, ~/Desktop and USB drives for audio files. */
      scanLibrary: () => Promise<{ path: string; name: string; size: number }[]>;

      /** Read a file from disk by absolute path. */
      readFile: (filePath: string) => Promise<{ bytes: Uint8Array; name: string; size: number }>;

      /** Bring the hidden window back to the foreground. */
      showWindow: () => Promise<void>;

      /** The OS platform string ("win32" | "linux" | "darwin"). */
      platform?: string;

      /** Minimize the window (used by custom Windows titlebar). */
      minimizeWindow?: () => void;

      /** Toggle maximize / restore (used by custom Windows titlebar). */
      maximizeWindow?: () => void;

      /** Close the window — respects the tray-vs-quit behaviour setting. */
      closeWindow?: () => void;

      /**
       * Subscribe to tray / global-shortcut events.
       * Returns an unsubscribe function.
       */
      onTrayAction: (cb: (action: unknown) => void) => () => void;

      /**
       * Subscribe to audio download-progress events.
       * Returns an unsubscribe function.
       */
      onYtProgress: (
        cb: (data: { downloaded: number; total: number; percent: number }) => void,
      ) => () => void;

      /**
       * Subscribe to video download-progress events.
       * Returns an unsubscribe function.
       */
      onYtProgressVideo: (
        cb: (data: { downloaded: number; total: number; percent: number }) => void,
      ) => () => void;

      /**
       * Subscribe to ffmpeg merge-progress events.
       * Returns an unsubscribe function.
       */
      onYtProgressMerge: (
        cb: (data: { percent: number }) => void,
      ) => () => void;
    };
  }
}
