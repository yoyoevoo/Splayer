export interface ParsedChapter {
  title: string;
  startSecs: number;
}

// Parse Nero-style 'chpl' atom embedded in M4B/M4A/MP4 containers.
// Format: fourcc 'chpl' + version(1) + flags(3) + reserved(4) + count(1) + entries
// Each entry: start_100ns(8 big-endian) + title_len(1) + title(utf-8)
function parseM4BChapters(buffer: ArrayBuffer): ParsedChapter[] {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);
  const len   = bytes.length;

  for (let i = 0; i < len - 20; i++) {
    // Look for 'chpl' fourcc (0x6368706c)
    if (bytes[i] !== 0x63 || bytes[i+1] !== 0x68 || bytes[i+2] !== 0x70 || bytes[i+3] !== 0x6c) continue;
    try {
      let pos = i + 4; // skip 'chpl'
      pos++;           // version
      pos += 3;        // flags
      pos += 4;        // reserved
      const count = bytes[pos++];
      if (count === 0 || count > 500) continue;

      const chapters: ParsedChapter[] = [];
      for (let c = 0; c < count; c++) {
        if (pos + 9 > len) break;
        const hi = view.getUint32(pos, false);
        const lo = view.getUint32(pos + 4, false);
        const start100ns = hi * 4294967296 + lo;
        pos += 8;
        const titleLen = bytes[pos++];
        if (pos + titleLen > len) break;
        const title = new TextDecoder("utf-8").decode(bytes.subarray(pos, pos + titleLen));
        pos += titleLen;
        chapters.push({ title: title.trim() || `Chapter ${c + 1}`, startSecs: start100ns / 10_000_000 });
      }
      if (chapters.length > 1) return chapters;
    } catch { /* malformed atom — try next occurrence */ }
  }
  return [];
}

// Parse ID3v2 CHAP frames from an MP3 file.
// CHAP layout: element_id\0 + start_ms(4) + end_ms(4) + start_off(4) + end_off(4) + [sub-frames]
// Sub-frame TIT2 carries the chapter title.
function parseMP3Chapters(buffer: ArrayBuffer): ParsedChapter[] {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);

  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return []; // 'ID3'

  const tagSize = ((bytes[6] & 0x7F) << 21) | ((bytes[7] & 0x7F) << 14) |
                  ((bytes[8] & 0x7F) << 7)  |  (bytes[9] & 0x7F);

  const chapters: ParsedChapter[] = [];
  let pos = 10;
  const end = Math.min(10 + tagSize, bytes.length);

  while (pos + 10 < end) {
    const frameId = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
    if (frameId === "\0\0\0\0") break;
    const frameSize = view.getUint32(pos + 4, false);
    if (frameSize === 0) { pos += 10; continue; }
    const frameDataStart = pos + 10;

    if (frameId === "CHAP" && frameSize > 16) {
      // Find null terminator for element_id
      let eidEnd = frameDataStart;
      while (eidEnd < frameDataStart + frameSize && bytes[eidEnd] !== 0) eidEnd++;
      const startMs = view.getUint32(eidEnd + 1, false);

      // Scan sub-frames for TIT2 (chapter title)
      let subPos = eidEnd + 17; // 1 (null) + 16 (4 x uint32)
      let chapterTitle = `Chapter ${chapters.length + 1}`;
      while (subPos + 10 < frameDataStart + frameSize) {
        const subId   = String.fromCharCode(bytes[subPos], bytes[subPos+1], bytes[subPos+2], bytes[subPos+3]);
        const subSize = view.getUint32(subPos + 4, false);
        if (subSize === 0) break;
        if (subId === "TIT2" && subSize > 1) {
          const enc = bytes[subPos + 10];
          const raw = bytes.subarray(subPos + 11, subPos + 10 + subSize);
          try {
            const decoded = enc === 1 || enc === 2
              ? new TextDecoder("utf-16le").decode(raw)
              : new TextDecoder("utf-8").decode(raw);
            chapterTitle = decoded.replace(/\0/g, "").trim();
          } catch { /* keep default */ }
          break;
        }
        subPos += 10 + subSize;
      }
      chapters.push({ title: chapterTitle, startSecs: startMs / 1000 });
    }

    pos += 10 + frameSize;
  }
  return chapters.sort((a, b) => a.startSecs - b.startSecs);
}

export async function parseChapters(file: File): Promise<ParsedChapter[]> {
  try {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const readSize = Math.min(file.size, 20 * 1024 * 1024); // scan up to 20 MB
    const buffer = await file.slice(0, readSize).arrayBuffer();

    if (ext === "mp3") return parseMP3Chapters(buffer);
    if (ext === "m4b" || ext === "m4a" || ext === "mp4") return parseM4BChapters(buffer);

    // Unknown extension: try both
    const m4b = parseM4BChapters(buffer);
    return m4b.length > 1 ? m4b : parseMP3Chapters(buffer);
  } catch {
    return [];
  }
}
