export interface DownloadRecord {
  id:           string;
  trackId:      string;
  title:        string;
  artist:       string;
  ext:          string;
  fileSize:     number;
  filePath:     string | null;
  downloadedAt: number;
  type:         "audio" | "video";
}

const LS_KEY = "yt-downloads-history";

export function readDownloadHistory(): DownloadRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addDownloadRecord(record: DownloadRecord): void {
  const history  = readDownloadHistory();
  const filtered = history.filter((r) => r.id !== record.id);
  localStorage.setItem(LS_KEY, JSON.stringify([record, ...filtered].slice(0, 500)));
}

export function removeDownloadRecord(id: string): void {
  const history = readDownloadHistory();
  localStorage.setItem(LS_KEY, JSON.stringify(history.filter((r) => r.id !== id)));
}

export function clearAllDownloadRecords(): void {
  localStorage.setItem(LS_KEY, JSON.stringify([]));
}
