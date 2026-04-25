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

  /** Download audio + video then merge into a single MP4 via ffmpeg. */
  ytDownloadMerged: (url) => ipcRenderer.invoke("yt-download-merged", url),

  /** Delete a file from disk by its absolute path. */
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),

  /** Returns the port of the local YouTube embed proxy server. */
  getEmbedPort: () => ipcRenderer.invoke("get-embed-port"),

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
