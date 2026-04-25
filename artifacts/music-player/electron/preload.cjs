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

  /**
   * Subscribe to download progress events.
   * Returns an unsubscribe function — call it when done.
   */
  onYtProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("yt-progress", handler);
    return () => ipcRenderer.removeListener("yt-progress", handler);
  },
});
