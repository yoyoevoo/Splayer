"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Open an OS folder-picker dialog. Returns the chosen path or null if cancelled. */
  showFolderDialog: () => ipcRenderer.invoke("show-folder-dialog"),

  /** Write bytes to an absolute file path on disk. */
  writeFile: (filePath, bytes) =>
    ipcRenderer.invoke("write-file", { filePath, bytes }),
});
