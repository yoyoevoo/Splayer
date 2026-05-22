import fs from 'fs';
import path from 'path';
import os from 'os';

const COVER_DIR = process.env.COVER_DIR ?? (
  process.env.APPDATA
    ? path.join(process.env.APPDATA, 'splayer', 'covers')          // Windows: %APPDATA%
    : path.join(os.homedir(), '.cache', 'splayer', 'covers')       // Linux/Mac: ~/.cache
);

export async function getPersistentImage(songId: string, url: string): Promise<string> {
  if (!url) return '';

  if (!fs.existsSync(COVER_DIR)) {
    fs.mkdirSync(COVER_DIR, { recursive: true });
  }

  const fileName = `cover_${songId}.jpg`;
  const localPath = path.join(COVER_DIR, fileName);

  // If we already have it, return the local path immediately
  if (fs.existsSync(localPath)) {
    return `file://${localPath}`;
  }

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(localPath, buffer);
    
    return `file://${localPath}`;
  } catch (error) {
    console.error("image-cache error:", error);
    return url; 
  }
}
