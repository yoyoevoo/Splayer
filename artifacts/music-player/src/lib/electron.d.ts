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

      /** Opens an OS save-file dialog. Returns the chosen path or null. */
      showSaveDialog: (options?: {
        defaultName?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<string | null>;

      /** Toggle the always-on-top mini player widget window. */
      toggleMiniWidget: () => void;

      /** Push current playback state to the mini widget. */
      updateWidgetState: (state: {
        title: string;
        artist: string;
        coverUrl: string | null;
        isPlaying: boolean;
        duration: number;
        position: number;
        sentAt: number;
      }) => void;

      /** Subscribe to widget visibility changes. Returns unsubscribe fn. */
      onMiniWidgetVisibility: (cb: (data: { visible: boolean }) => void) => () => void;

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

      /** Fetch raw RSS XML for a podcast feed URL. */
      podcastFetchRss: (url: string) => Promise<{ xml: string } | { error: string }>;

      /** Get the direct CDN audio URL for a YouTube video ID (for podcast playback). */
      ytGetAudioUrl: (videoId: string) => Promise<{ url: string } | { error: string }>;

      /** Fetch a YouTube playlist as podcast episodes. */
      ytGetPlaylist: (url: string) => Promise<{
        title: string; description: string; thumbnail: string | null;
        entries: { id: string; title: string; duration: number | null; thumbnail: string | null; url: string }[];
      } | { error: string }>;

      /** Permanently delete a file from disk. */
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;

      /** Open the system file manager at the folder containing the file. */
      showInFolder: (filePath: string) => Promise<{ success: boolean }>;

      /** Returns the app's default directory paths. */
      getAppPaths: () => Promise<{ root: string; downloads: string; backups: string }>;

      findTrackPath: (filename: string, extraDirs?: string[]) => Promise<{ found: boolean; path?: string }>;
      copyFile: (src: string, dst: string) => Promise<{ success: boolean; error?: string }>;

      /** Set whether closing the window minimizes to tray ("tray") or quits ("close"). */
      setCloseBehavior: (behavior: "tray" | "close") => Promise<void>;

      /** Read the real OS login-item state. */
      getLoginItemSettings: () => Promise<{ openAtLogin: boolean }>;

      /** Enable or disable opening the app at login (start on boot). */
      setLoginItemSettings: (openAtLogin: boolean) => Promise<{ success: boolean; error?: string }>;

      /** Register (or replace) all global keyboard shortcuts. */
      registerGlobalShortcuts: (shortcuts: Record<string, string>) => Promise<void>;

      /** Open a URL in the system default browser. */
      openExternal: (url: string) => void;

      /** Push playback state to the main process so the tray stays in sync. */
      updateTrayState: (state: { title: string; artist: string; isPlaying: boolean; volume: number }) => void;

      /** Push current playback state to Discord Rich Presence. */
      discordRpcUpdate: (state: {
        title: string; artist: string; isPlaying: boolean;
        duration: number; position: number;
      }) => void;

      /** Enable or disable Discord Rich Presence (called from settings). */
      discordRpcSetEnabled: (enabled: boolean) => void;

      /** Push current track + playback state to OS media integrations (MPRIS / SMTC). */
      updateOsMedia: (state: {
        title: string; artist: string; album: string;
        isPlaying: boolean; durationSecs: number; positionSecs: number;
        coverDataUrl: string | null;
      }) => void;

      /** Enable or disable OS media integration (MPRIS on Linux, SMTC on Windows). */
      setOsMediaEnabled: (enabled: boolean) => void;

      spotifyLogin:      () => Promise<{ success: true } | { error: string }>;
      spotifyLogout:     () => Promise<{ success: true }>;
      spotifyIsLoggedIn: () => Promise<{ loggedIn: boolean }>;
      spotifyFetchPlaylist: (params: { playlistUrl: string }) => Promise<SpotifyPlaylistResult | { error: string }>;
      spotifyFetchTrack:    (params: { trackUrl: string })    => Promise<{
        id: string; name: string; artists: string; durationMs: number;
        albumName: string; albumArt: string;
      } | { error: string }>;

      /** Scan the given folders (or ~/Music if omitted) for audio files. */
      scanLibrary: (folders?: string[]) => Promise<{
        path: string; name: string; size: number;
        title?: string; artist?: string; album?: string; durationSecs?: number;
      }[]>;

      /** Abort the current in-progress scan. */
      cancelScan?: () => void;

      /** Subscribe to real-time scan progress events. Returns unsubscribe fn. */
      onScanProgress?: (cb: (data: { found: number; done: boolean }) => void) => () => void;

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

      /** Export an edited AudioBuffer (supplied as WAV bytes) via ffmpeg. */
      editorExport: (params: {
        wavBytes: Uint8Array;
        format: "mp3" | "wav" | "flac" | "ogg";
        quality: "128" | "192" | "320";
        fileName: string;
        fadeIn?: number;
        fadeOut?: number;
      }) => Promise<{ success: true; outputPath: string } | { error: string }>;

      /** Subscribe to editor export progress events (percent 0–100). Returns unsubscribe fn. */
      onEditorExportProgress: (cb: (data: { percent: number }) => void) => () => void;

      /** Add an exported file path to the Splayer library. */
      editorAddToLibrary: (params: { filePath: string }) => Promise<{
        success: true;
        file: { path: string; name: string; size: number };
      } | { error: string }>;

      /** Check whether a YouTube cookies file is saved on disk. */
      youtubeHasCookies: () => Promise<{ exists: boolean }>;

      /** Delete the saved YouTube cookies file. */
      youtubeClearCookies: () => Promise<{ success: true }>;

      /** Open a YouTube sign-in BrowserWindow; exports cookies on close. */
      youtubeLogin: () => Promise<{ success: true; count: number } | { error: string }>;
    };
  }
}
