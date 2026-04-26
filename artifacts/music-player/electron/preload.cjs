"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Open an OS folder-picker dialog. Returns the chosen path or null if cancelled. */
  showFolderDialog: () => ipcRenderer.invoke("show-folder-dialog"),

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

  /** Returns the port of the local YouTube embed proxy server. */
  getEmbedPort: () => ipcRenderer.invoke("get-embed-port"),

  /** Set whether closing the window minimizes to tray or quits the app. */
  setCloseBehavior: (behavior) =>
    ipcRenderer.invoke("set-close-behavior", behavior),

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

  /** Fetch all tracks from a Spotify playlist URL using the given credentials. */
  spotifyFetchPlaylist: ({ playlistUrl, clientId, clientSecret }) =>
    ipcRenderer.invoke("spotify-fetch-playlist", { playlistUrl, clientId, clientSecret }),

  /** Scan default music locations and return audio file info. */
  scanLibrary: () => ipcRenderer.invoke("scan-library"),

  /** Read a file from disk by absolute path. Returns bytes + name + size. */
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),

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
});
