// We use the dist version because the main package might have node dependencies
import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year?: string;
  genre?: string;
  coverBlob?: Blob;
  coverUrl?: string;
  duration?: number; // in seconds
}

export function generateTrackId(file: { name: string; size: number }): string {
  return `${file.name}-${file.size}`;
}

export function extractMetadata(file: File): Promise<TrackMetadata> {
  return new Promise((resolve) => {
    // Also try to get duration via a temporary audio element
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();

    let duration = 0;

    const finish = (extra: Partial<TrackMetadata>) => {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      resolve({
        title: extra.title ?? file.name.replace(/\.[^/.]+$/, ""),
        artist: extra.artist ?? "Unknown Artist",
        album: extra.album ?? "Unknown Album",
        year: extra.year,
        coverBlob: extra.coverBlob,
        coverUrl: extra.coverUrl,
        duration: extra.duration ?? duration ?? 0,
      });
    };

    audio.addEventListener('loadedmetadata', () => {
      duration = audio.duration;

      jsmediatags.read(file, {
        onSuccess: function (tag: any) {
          const tags = tag.tags;
          let coverBlob: Blob | undefined;
          let coverUrl: string | undefined;

          if (tags.picture) {
            const data = tags.picture.data;
            const format = tags.picture.format;
            const uint8Array = new Uint8Array(data);
            coverBlob = new Blob([uint8Array], { type: format });
            coverUrl = URL.createObjectURL(coverBlob);
          }

          finish({
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            year: tags.year,
            genre: tags.genre,
            coverBlob,
            coverUrl,
            duration,
          });
        },
        onError: function (error: any) {
          console.warn('Error reading tags', error, file.name);
          finish({ duration });
        }
      });
    });

    audio.addEventListener('error', () => {
      finish({});
    });

    audio.src = objectUrl;
  });
}
