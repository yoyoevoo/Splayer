export type RepeatMode = "off" | "all" | "one";

export interface Track {
  id: string;
  file: File;
  url: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  duration: number;
  embeddedCoverUrl?: string;
  customCoverUrl?: string;
}

export function trackCoverUrl(t: Track): string | undefined {
  return t.customCoverUrl ?? t.embeddedCoverUrl;
}
