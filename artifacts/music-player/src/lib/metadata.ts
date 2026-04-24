// We use the dist version because the main package might have node dependencies
import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year?: string;
  coverUrl?: string;
  duration?: number; // in seconds
}

export function generateTrackId(file: File): string {
  return `${file.name}-${file.size}`;
}

export function extractMetadata(file: File): Promise<TrackMetadata> {
  return new Promise((resolve) => {
    // Also try to get duration via a temporary audio element
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    
    let duration = 0;
    
    audio.addEventListener('loadedmetadata', () => {
      duration = audio.duration;
      
      jsmediatags.read(file, {
        onSuccess: function (tag: any) {
          const tags = tag.tags;
          let coverUrl = undefined;

          if (tags.picture) {
            const data = tags.picture.data;
            const format = tags.picture.format;
            const uint8Array = new Uint8Array(data);
            const blob = new Blob([uint8Array], { type: format });
            coverUrl = URL.createObjectURL(blob);
          }

          resolve({
            title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
            artist: tags.artist || "Unknown Artist",
            album: tags.album || "Unknown Album",
            year: tags.year,
            coverUrl,
            duration,
          });
        },
        onError: function (error: any) {
          console.warn('Error reading tags', error, file.name);
          resolve({
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: "Unknown Artist",
            album: "Unknown Album",
            duration,
          });
        }
      });
    });

    audio.addEventListener('error', () => {
      // Fallback if we can't load metadata
      resolve({
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Unknown Artist",
        album: "Unknown Album",
        duration: 0,
      });
    });

    audio.src = objectUrl;
  });
}
