export {};

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

      /** Download audio + video then merge into a single MP4 via ffmpeg. */
      ytDownloadMerged: (url: string) => Promise<YtDownloadResult | { error: string }>;

      /** Returns the port of the local YouTube embed proxy server. */
      getEmbedPort: () => Promise<number>;

      /** Permanently delete a file from disk. */
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;

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
