export {};

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
    };
  }
}
