/**
 * platform-api.ts
 * Drop-in replacement for `window.electronAPI` that works on Electron,
 * Capacitor/Android, and plain web.  Import `platformAPI` everywhere instead
 * of accessing `window.electronAPI` directly.
 */

import { registerPlugin, Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

// ── Native Android plugin interface ───────────────────────────────────────────

interface SplayerPlugin {
  scan(): Promise<{
    files: Array<{
      uri: string; name: string; size: number;
      title: string; artist: string; album: string; durationMs: number;
    }>;
  }>;
  readFile(options: { uri: string }): Promise<{
    base64: string;
    name: string;
    size: number;
  }>;
  deleteFile(options: { uri: string }): Promise<{ success: boolean }>;
  getAlbumArt(options: { uri: string }): Promise<{ base64: string }>;
  openEqualizer(): Promise<void>;
}

// registerPlugin is a no-op in browser/Electron; safe to call unconditionally.
const SplayerNative = registerPlugin<SplayerPlugin>("Splayer");

// ── Native YtDownload plugin interface ────────────────────────────────────────

interface YtDownloadPlugin {
  ytSearch(opts: { query: string }): Promise<{ results: string }>;
  ytGetInfo(opts: { videoId: string }): Promise<{ info: string }>;
  ytDownload(opts: { videoId: string; format?: string; quality?: string }): Promise<{
    base64: string; ext: string; mimeType: string; title: string; author: string;
  }>;
  addListener(
    event: string,
    handler: (data: { percent: number }) => void,
  ): Promise<{ remove(): void }>;
}

const YtDownloadNative = registerPlugin<YtDownloadPlugin>("YtDownload");

// ── Native MediaSession plugin interface ──────────────────────────────────────

interface MediaSessionNativePlugin {
  updatePlaybackState(opts: {
    title: string;
    artist: string;
    album: string;
    artBase64: string;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
  }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: "mediaButton",
    handler: (data: { action: string }) => void,
  ): Promise<{ remove(): void }>;
}

const MediaSessionNative = registerPlugin<MediaSessionNativePlugin>("MediaSession");

// ── Module-level media button dispatcher ─────────────────────────────────────
// Register the DOM listener IMMEDIATELY at module load time so it is guaranteed
// to exist before any notification button can ever be tapped.
// Java fires: webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('splayerMediaButton', ...))")
// This callback collects handlers registered later via onTrayAction().

const _mediaButtonHandlers: Array<(action: string) => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener("splayerMediaButton", (e: Event) => {
    const action = (e as CustomEvent).detail?.action as string | undefined;
    console.log("[platform-api] splayerMediaButton fired, action=" + action);
    if (action) _mediaButtonHandlers.forEach((h) => h(action));
  });
  console.log("[platform-api] splayerMediaButton listener registered at module load");
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Platform detection ────────────────────────────────────────────────────────

function getCapacitor() {
  return typeof window !== "undefined"
    ? (window as unknown as { Capacitor?: { isNativePlatform?(): boolean; getPlatform?(): string } }).Capacitor
    : undefined;
}

export type PlatformName = "electron" | "android" | "web";

export const currentPlatform: PlatformName = (() => {
  if (typeof window === "undefined") return "web";
  if (window.electronAPI) return "electron";
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) return "android";
  return "web";
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const noop = () => {};
const noopCleanup = () => noop;


// ── Android implementation of the full electronAPI surface ───────────────────

function buildAndroidAPI() {
  // Typed as the full electronAPI shape via cast so call-sites need no changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: NonNullable<Window["electronAPI"]> = {
    platform: "android",

    async scanLibrary() {
      const { files } = await SplayerNative.scan();
      return files.map((f) => ({
        path: f.uri,
        name: f.name,
        size: f.size,
        title: f.title || undefined,
        artist: f.artist || undefined,
        album: f.album || undefined,
        durationSecs: f.durationMs > 0 ? f.durationMs / 1000 : undefined,
      }));
    },

    async readFile(uri: string) {
      const r = await SplayerNative.readFile({ uri });
      return { bytes: b64ToUint8Array(r.base64), name: r.name, size: r.size };
    },

    async writeFile(filePath: string, bytes: Uint8Array) {
      try {
        const filename = filePath.split("/").pop() ?? "download";
        const b64 = btoa(String.fromCharCode(...bytes));
        await Filesystem.writeFile({
          path: `Splayer Downloads/${filename}`,
          data: b64,
          directory: Directory.External,
        });
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: String((e as { message?: string })?.message ?? e) };
      }
    },

    async deleteFile(uri: string) {
      const r = await SplayerNative.deleteFile({ uri });
      return r;
    },

    async showFolderDialog() {
      return null;
    },

    // YouTube — search via yt-dlp on-device (same binary used for downloads)
    async ytSearch(query: string) {
      try {
        const r = await YtDownloadNative.ytSearch({ query: query || '' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return JSON.parse(r.results) as any[];
      } catch (e: unknown) {
        return { error: String((e as { message?: string })?.message ?? e) };
      }
    },

    async ytGetInfo(url: string) {
      const videoId = extractVideoId(url);
      if (!videoId) return { error: "Invalid YouTube URL" };
      try {
        const r = await YtDownloadNative.ytGetInfo({ videoId: videoId || '' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return JSON.parse(r.info) as any;
      } catch (e: unknown) {
        return { error: String((e as { message?: string })?.message ?? e) };
      }
    },

    async ytDownload(url: string) {
      const videoId = extractVideoId(url);
      if (!videoId) return { error: "Could not extract video ID from URL" } as { error: string };
      try {
        const r = await YtDownloadNative.ytDownload({ videoId: videoId || '' });
        const rAny = r as any;
        // File streamed directly to disk — return path for Capacitor.convertFileSrc
        if (!r.base64 && rAny.filePath) {
          return {
            bytes:    new Uint8Array(0),
            filePath: rAny.filePath as string,
            fileSize: (rAny.fileSize as number) ?? 0,
            ext: r.ext, mimeType: r.mimeType, title: r.title, author: r.author,
            durationSecs: 0, thumbnailUrl: null,
          } as never;
        }
        return {
          bytes: b64ToUint8Array(r.base64) as unknown as Uint8Array,
          ext: r.ext, mimeType: r.mimeType, title: r.title, author: r.author,
          durationSecs: 0, thumbnailUrl: null,
        } as never;
      } catch (e: unknown) {
        return { error: String((e as { message?: string })?.message ?? e) } as { error: string };
      }
    },

    async ytGetQualities(_url: string) {
      return [
        { height: 1080, label: "1080p", formatId: "1080", fileSizeMB: null, available: true,  recommended: false },
        { height:  720, label:  "720p", formatId:  "720", fileSizeMB: null, available: true,  recommended: true  },
        { height:  480, label:  "480p", formatId:  "480", fileSizeMB: null, available: true,  recommended: false },
        { height:  360, label:  "360p", formatId:  "360", fileSizeMB: null, available: true,  recommended: false },
      ] as never;
    },

    async ytDownloadVideo(url: string) {
      const videoId = extractVideoId(url);
      if (!videoId) return { error: "Could not extract video ID from URL" };
      try {
        const r = await YtDownloadNative.ytDownload({ videoId: videoId || '' });
        return {
          bytes: b64ToUint8Array(r.base64) as unknown as Uint8Array,
          ext: r.ext, mimeType: r.mimeType, title: r.title, author: r.author,
          durationSecs: 0, thumbnailUrl: null,
        } as never;
      } catch (e: unknown) {
        return { error: String((e as { message?: string })?.message ?? e) };
      }
    },

    async ytDownloadMerged({ url, videoFormatId }: { url: string; videoFormatId?: string | null }) {
      const videoId = extractVideoId(url);
      if (!videoId) return { error: "Could not extract video ID from URL" };
      try {
        const quality = videoFormatId ?? "720";
        const r = await YtDownloadNative.ytDownload({ videoId, format: "mp4", quality });
        // Large video: Java saved the file directly to disk and returned a path
        // instead of a base64 string to avoid OOM on devices with limited RAM.
        const rAny = r as any;
        if (!r.base64 && rAny.filePath) {
          return {
            bytes:    new Uint8Array(0),
            filePath: rAny.filePath as string,
            fileSize: (rAny.fileSize as number) ?? 0,
            ext: r.ext, mimeType: r.mimeType, title: r.title, author: r.author,
            durationSecs: 0, thumbnailUrl: null,
          } as never;
        }
        return {
          bytes: b64ToUint8Array(r.base64) as unknown as Uint8Array,
          ext: r.ext, mimeType: r.mimeType, title: r.title, author: r.author,
          durationSecs: 0, thumbnailUrl: null,
        } as never;
      } catch (e: unknown) {
        return { error: String((e as { message?: string })?.message ?? e) };
      }
    },

    onYtProgress(handler) {
      let h1: { remove(): void } | null = null;

      YtDownloadNative.addListener("ytProgress", handler as (d: { percent: number }) => void)
        .then((h) => { h1 = h; }).catch(noop);

      return () => { h1?.remove(); };
    },

    async getEmbedPort() {
      return 0;
    },

    async ytGetAudioUrl(_videoId: string) {
      return { error: "Not available on Android" };
    },

    setCloseBehavior: noop as never,
    registerGlobalShortcuts: noop as never,
    updateTrayState: noop,

    // Loads embedded album art for a MediaStore track by content URI.
    // Returns a data URL ("data:image/jpeg;base64,...") or "" if no art found.
    async getTrackArt(uri: string): Promise<string> {
      try {
        const r = await SplayerNative.getAlbumArt({ uri });
        return r.base64 ? `data:image/jpeg;base64,${r.base64}` : "";
      } catch {
        return "";
      }
    },

    // Android-specific: update the MediaSession notification
    updateMediaSession: async (opts: Record<string, unknown>) => {
      console.log("[MediaSession] updatePlaybackState → title=" + opts.title
        + " playing=" + opts.isPlaying);
      try {
        await MediaSessionNative.updatePlaybackState(
          opts as Parameters<MediaSessionNativePlugin["updatePlaybackState"]>[0]);
        console.log("[MediaSession] updatePlaybackState done");
      } catch (e) {
        console.error("[MediaSession] updatePlaybackState ERROR: " + e);
      }
    },

    stopMediaSession: async () => {
      try { await MediaSessionNative.stop(); } catch { /* ignore */ }
    },

    openSystemEqualizer: async () => {
      try { await SplayerNative.openEqualizer(); } catch { /* ignore */ }
    },

    onTrayAction: (handler: (action: unknown) => void) => {
      // Add to the module-level handler list that the already-registered
      // window.addEventListener("splayerMediaButton") will call.
      const wrapped = (action: string) => {
        console.log("[TrayAction] dispatching action=" + action);
        handler(action);
      };
      _mediaButtonHandlers.push(wrapped);
      console.log("[TrayAction] handler registered, total=" + _mediaButtonHandlers.length);
      return () => {
        const i = _mediaButtonHandlers.indexOf(wrapped);
        if (i >= 0) _mediaButtonHandlers.splice(i, 1);
      };
    },

    async showWindow() {},

    minimizeWindow: noop,
    maximizeWindow: noop,
    closeWindow: noop,

    // Event subscriptions — no-ops; return an unsubscribe function.
    onYtProgressVideo: noopCleanup,
    onYtProgressMerge: noopCleanup,
  };
  return api;
}

// ── Exported unified API ──────────────────────────────────────────────────────
// Has the same type as `window.electronAPI` — use it as a drop-in replacement.

export const platformAPI: Window["electronAPI"] = (() => {
  if (typeof window === "undefined") return undefined;
  if (window.electronAPI) return window.electronAPI;
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) return buildAndroidAPI();
  return undefined;
})();

// Convert a device URI (content:// on Android) to a URL the WebView can load.
// On non-Android platforms Capacitor.convertFileSrc is a pass-through.
export function convertFileUri(uri: string): string {
  return Capacitor.convertFileSrc(uri);
}
