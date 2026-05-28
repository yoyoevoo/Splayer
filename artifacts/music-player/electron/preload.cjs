"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Open an OS folder-picker dialog. Returns the chosen path or null if cancelled. */
  showFolderDialog: () => ipcRenderer.invoke("show-folder-dialog"),

  /** Open an OS save-file dialog. Returns the chosen path or null if cancelled. */
  showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options),

  /** Write bytes to an absolute file path on disk. */
  writeFile: (filePath, bytes) =>
    ipcRenderer.invoke("write-file", { filePath, bytes }),

  /** Search YouTube and return a list of video results. */
  ytSearch: (query) => ipcRenderer.invoke("yt-search", query),

  /** Fetch YouTube video metadata (title, author, duration, thumbnail). */
  ytGetInfo: (url) => ipcRenderer.invoke("yt-get-info", url),

  /** Download audio from a YouTube URL. Returns bytes + metadata. */
  ytDownload: (url) => ipcRenderer.invoke("yt-download", url),

  /** Download video (MP4) from a YouTube URL. Returns bytes + metadata. */
  ytDownloadVideo: (url) => ipcRenderer.invoke("yt-download-video", url),

  /** Fetch available video quality options for a YouTube URL. */
  ytGetQualities: (url) => ipcRenderer.invoke("yt-get-qualities", url),

  /** Download audio + video then merge into a single MP4 via ffmpeg. */
  ytDownloadMerged: ({ url, videoFormatId }) =>
    ipcRenderer.invoke("yt-download-merged", { url, videoFormatId }),

  /** Delete a file from disk by its absolute path. */
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),

  /** Open the system file manager at the folder containing the given path. */
  showInFolder: (filePath) => ipcRenderer.invoke("show-in-folder", filePath),

  /** Returns the app's default directory paths (downloads, backups, etc). */
  getAppPaths: () => ipcRenderer.invoke("get-app-paths"),

  /** Search for a track file by filename across common directories. */
  findTrackPath: (filename, extraDirs) =>
    ipcRenderer.invoke("find-track-path", { filename, extraDirs }),

  /** Copy a file from src to dst on disk. */
  copyFile: (src, dst) => ipcRenderer.invoke("copy-file", { src, dst }),

  /** Returns the port of the local YouTube embed proxy server. */
  getEmbedPort: () => ipcRenderer.invoke("get-embed-port"),

  /** Fetch raw RSS XML for a podcast feed URL. */
  podcastFetchRss: (url) => ipcRenderer.invoke("podcast-fetch-rss", url),

  /** Fetch a YouTube playlist as podcast episodes via yt-dlp. */
  ytGetPlaylist: (url) => ipcRenderer.invoke("yt-get-playlist", url),

  /** Get the direct CDN audio URL for a YouTube video ID (for podcast playback). */
  ytGetAudioUrl: (videoId) => ipcRenderer.invoke("yt-get-audio-url", videoId),

  /** Set whether closing the window minimizes to tray or quits the app. */
  setCloseBehavior: (behavior) =>
    ipcRenderer.invoke("set-close-behavior", behavior),

  /** Read the real OS login-item state (openAtLogin). */
  getLoginItemSettings: () =>
    ipcRenderer.invoke("get-login-item-settings"),

  /** Enable or disable opening the app at login (start on boot). */
  setLoginItemSettings: (openAtLogin) =>
    ipcRenderer.invoke("set-login-item-settings", { openAtLogin }),

  /**
   * Register (or update) all global shortcuts.
   * Completely replaces any previously registered shortcuts.
   */
  registerGlobalShortcuts: (shortcuts) =>
    ipcRenderer.invoke("register-global-shortcuts", shortcuts),

  /**
   * Push current playback state to the main process so the tray menu
   * and tooltip stay up-to-date (fire-and-forget).
   */
  updateTrayState: (state) =>
    ipcRenderer.send("update-tray-state", state),

  /** Check if Spotify web session is active. */
  spotifyCheck:  () => ipcRenderer.invoke("spotify-check"),
  /** Open Spotify login popup (email/password). */
  spotifyLogin:        () => ipcRenderer.invoke("spotify-login"),
  /** Extract sp_dc cookie from Chrome/Firefox (for Google-linked accounts). */
  spotifyImportBrowser:() => ipcRenderer.invoke("spotify-import-browser"),
  /** Save sp_dc cookie manually (paste fallback). */
  spotifySetCookie:    ({ spDc }) => ipcRenderer.invoke("spotify-set-cookie", { spDc }),
  /** Clear Spotify session. */
  spotifyLogout:       () => ipcRenderer.invoke("spotify-logout"),
  /** Fetch track list from any Spotify URL. */
  spotifyFetch:  ({ url }) => ipcRenderer.invoke("spotify-fetch", { url }),
  /** Check if spotDL is installed. */
  spotdlCheck: () => ipcRenderer.invoke("spotdl-check"),
  /** Download Spotify track URLs in parallel with spotDL. */
  spotdlDownloadBatch: ({ tracks, outputDir, format }) =>
    ipcRenderer.invoke("spotdl-download-batch", { tracks, outputDir, format }),
  /** Fires when spotDL finishes a track. */
  onSpotdlTrackDone: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("spotdl-track-done", h);
    return () => ipcRenderer.removeListener("spotdl-track-done", h);
  },

  /** Scan music locations and return audio file info.
   *  Pass an array of folder paths to restrict the scan to those folders.
   *  Pass nothing (or an empty array) to fall back to built-in defaults. */
  scanLibrary: (folders) => ipcRenderer.invoke("scan-library", folders),

  /** Abort the current in-progress scan immediately. */
  cancelScan: () => ipcRenderer.send("cancel-scan"),

  /** Subscribe to real-time scan progress. Returns an unsubscribe function. */
  onScanProgress: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("scan-progress", h);
    return () => ipcRenderer.removeListener("scan-progress", h);
  },

  /** Read a file from disk by absolute path. Returns bytes + name + size. */
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),

  /** Toggle the always-on-top mini player widget window. */
  toggleMiniWidget: () => ipcRenderer.send("toggle-mini-widget"),

  /** Push current playback state to the mini widget. */
  updateWidgetState: (state) => ipcRenderer.send("update-widget-state", state),

  /** Send a control action from the widget (play-pause / prev / next / seek). */
  widgetAction: (action) => ipcRenderer.send("widget-action", action),

  /** Hide the widget window (widget close button). */
  widgetHide: () => ipcRenderer.send("widget-hide"),

  /** Restore the widget's saved position (sent from widget localStorage). */
  widgetInitPosition: (pos) => ipcRenderer.send("widget-init-position", pos),

  /** Receive track state updates in the widget window. */
  onWidgetState: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("widget-state", h);
    return () => ipcRenderer.removeListener("widget-state", h);
  },

  /** Receive position-moved events in the widget window (for localStorage save). */
  onWidgetMoved: (cb) => {
    const h = (_e, pos) => cb(pos);
    ipcRenderer.on("widget-moved", h);
    return () => ipcRenderer.removeListener("widget-moved", h);
  },

  /** Subscribe to widget visibility changes in the main app. */
  onMiniWidgetVisibility: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("mini-widget-visibility", h);
    return () => ipcRenderer.removeListener("mini-widget-visibility", h);
  },

  /** Open a URL in the user's default browser. */
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  /** Push Discord Rich Presence state from the renderer. */
  discordRpcUpdate: (state) => ipcRenderer.send("discord-rpc-update", state),

  /** Enable or disable Discord Rich Presence from the settings toggle. */
  discordRpcSetEnabled: (enabled) => ipcRenderer.send("discord-rpc-set-enabled", enabled),

  /** Push current track + playback state to OS media integrations (MPRIS / SMTC). */
  updateOsMedia: (state) => ipcRenderer.send("update-os-media", state),

  /** Enable or disable OS media integration (MPRIS / SMTC) from the settings toggle. */
  setOsMediaEnabled: (enabled) => ipcRenderer.send("set-os-media-enabled", enabled),

  /** Bring the hidden window back to the foreground. */
  showWindow: () => ipcRenderer.invoke("show-window"),

  /** Returns the current OS platform string ("win32", "linux", "darwin"). */
  platform: process.platform,

  /** Minimize the Electron window (Windows custom titlebar). */
  minimizeWindow: () => ipcRenderer.send("window-minimize"),

  /** Toggle maximize / restore the Electron window. */
  maximizeWindow: () => ipcRenderer.send("window-maximize"),

  /** Close the Electron window (respects tray behaviour). */
  closeWindow: () => ipcRenderer.send("window-close"),

  /**
   * Subscribe to tray control events (play-pause / next / prev).
   * Returns an unsubscribe function — call it in cleanup.
   */
  onTrayAction: (cb) => {
    const handler = (_e, action) => cb(action);
    ipcRenderer.on("tray-action", handler);
    return () => ipcRenderer.removeListener("tray-action", handler);
  },

  /**
   * Subscribe to audio download progress events.
   * Returns an unsubscribe function — call it when done.
   */
  onYtProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("yt-progress", handler);
    return () => ipcRenderer.removeListener("yt-progress", handler);
  },

  /**
   * Subscribe to video download progress events.
   * Returns an unsubscribe function — call it when done.
   */
  onYtProgressVideo: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("yt-progress-video", handler);
    return () => ipcRenderer.removeListener("yt-progress-video", handler);
  },

  /**
   * Subscribe to ffmpeg merge progress events.
   * Returns an unsubscribe function — call it when done.
   */
  onYtProgressMerge: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("yt-progress-merge", handler);
    return () => ipcRenderer.removeListener("yt-progress-merge", handler);
  },

  /** Export an edited audio track via ffmpeg. wavBytes is a Uint8Array of a WAV file. */
  editorExport: ({ wavBytes, format, quality, fileName, fadeIn, fadeOut }) =>
    ipcRenderer.invoke("editor:export", { wavBytes, format, quality, fileName, fadeIn, fadeOut }),

  /** Subscribe to editor export progress events (0–100). Returns unsubscribe fn. */
  onEditorExportProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("editor:export-progress", handler);
    return () => ipcRenderer.removeListener("editor:export-progress", handler);
  },

  /** Add an exported file to the Splayer library. */
  editorAddToLibrary: ({ filePath }) =>
    ipcRenderer.invoke("editor:add-to-library", { filePath }),

  /** Check whether a YouTube cookies file is saved. */
  youtubeHasCookies: () => ipcRenderer.invoke("youtube:has-cookies"),

  /** Delete the saved YouTube cookies file. */
  youtubeClearCookies: () => ipcRenderer.invoke("youtube:clear-cookies"),

  /** Open a YouTube login window; exports cookies to file on close. */
  youtubeLogin: () => ipcRenderer.invoke("youtube:login"),
});
