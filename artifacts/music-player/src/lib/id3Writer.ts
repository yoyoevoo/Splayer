/**
 * id3Writer.ts
 * Encodes ID3v2.3 tags into an MP3 file using browser-id3-writer (renderer-side),
 * then saves the result via Electron IPC (main-process fs.writeFile).
 */
import type { Track } from "./types";
import { platformAPI } from "./platform-api";
// browser-id3-writer is a CJS module — import the namespace and cast
import * as ID3WriterModule from "browser-id3-writer";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ID3Writer: any = (ID3WriterModule as any).default ?? ID3WriterModule;

export interface TagUpdate {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
}

/**
 * Writes updated ID3 tags to `outputPath` on disk.
 * For each field, uses `update` value if provided, else keeps `track`'s current value.
 */
export async function writeID3ToFile(
  track: Track,
  update: TagUpdate,
  outputPath: string,
): Promise<{ success: boolean; error?: string }> {
  if (!platformAPI) {
    return { success: false, error: "Electron API not available" };
  }

  try {
    const buffer = await track.file.arrayBuffer();
    const writer = new ID3Writer(buffer);

    const title  = update.title  ?? track.title;
    const artist = update.artist ?? track.artist;
    const album  = update.album  ?? track.album;
    const year   = update.year   ?? track.year   ?? "";
    const genre  = update.genre  ?? track.genre  ?? "";

    writer.setFrame("TIT2", title)
          .setFrame("TPE1", [artist])
          .setFrame("TALB", album);

    if (year)  writer.setFrame("TYER", year as unknown as number);
    if (genre) writer.setFrame("TCON", [genre]);

    writer.addTag();

    const blob = writer.getBlob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    return platformAPI.writeFile(outputPath, bytes);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** True if the track's MIME type is MP3 (the only format ID3v2 applies to). */
export function isMP3(track: Track): boolean {
  return (
    track.file.type === "audio/mpeg" ||
    track.file.name.toLowerCase().endsWith(".mp3")
  );
}
