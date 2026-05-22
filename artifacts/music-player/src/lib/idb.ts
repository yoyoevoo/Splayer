import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface StoredTrack {
  id: string;
  fileBlob?: Blob;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  addedAt?: number;
  metaTitle?: string;
  metaArtist?: string;
  metaAlbum?: string;
  metaYear?: string;
  metaGenre?: string;
  metaDuration?: number;
  embeddedCover?: Blob;
  customCover?: Blob;
  customTitle?: string;
  customArtist?: string;
  customAlbum?: string;
  customYear?: string;
  customGenre?: string;
  playCount?: number;
  lastPlayedAt?: number;
  liked?: boolean;
  fetchedCover?: Blob;
  filePath?: string;
  hasVideo?: boolean;
  videoPath?: string;
}

interface StoredPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  customCover?: Blob;
  createdAt: number;
  updatedAt: number;
}

interface StoredSetting {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

interface StoredPodcast {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  feedUrl: string;
  addedAt: number;
}

interface StoredEpisode {
  id: string;
  podcastId: string;
  title: string;
  description?: string;
  pubDate?: number;
  duration?: number;
  audioUrl: string;
  guid: string;
  played: boolean;
  progress: number;
  thumbnail?: string;
}

interface StoredBook {
  id: string;
  title: string;
  author: string;
  narrator?: string;
  description?: string;
  coverBlob?: Blob;
  source: "local" | "youtube";
  feedUrl?: string;
  addedAt: number;
  duration?: number;
  progress?: number;
  audioBlob?: Blob;
  audioType?: string;
}

interface StoredBookChapter {
  id: string;
  bookId: string;
  title: string;
  index: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  audioUrl?: string;
  progress: number;
  played: boolean;
}

interface StoredBookBookmark {
  id: string;
  bookId: string;
  time: number;
  note: string;
  createdAt: number;
}

interface MusicPlayerDB extends DBSchema {
  tracks: {
    key: string;
    value: StoredTrack;
  };
  playlists: {
    key: string;
    value: StoredPlaylist;
  };
  settings: {
    key: string;
    value: StoredSetting;
  };
  podcasts: {
    key: string;
    value: StoredPodcast;
  };
  episodes: {
    key: string;
    value: StoredEpisode;
    indexes: { 'by-podcast': string };
  };
  books: {
    key: string;
    value: StoredBook;
  };
  book_chapters: {
    key: string;
    value: StoredBookChapter;
    indexes: { 'by-book': string };
  };
  book_bookmarks: {
    key: string;
    value: StoredBookBookmark;
    indexes: { 'by-book': string };
  };
}

let dbPromise: Promise<IDBPDatabase<MusicPlayerDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MusicPlayerDB>('music-player-db', 7, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('tracks', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('playlists')) {
            db.createObjectStore('playlists', { keyPath: 'id' });
          }
        }
        // v4: added liked field — no schema change needed, just bumped version
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'id' });
          }
        }
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains('podcasts')) {
            db.createObjectStore('podcasts', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('episodes')) {
            const epStore = db.createObjectStore('episodes', { keyPath: 'id' });
            epStore.createIndex('by-podcast', 'podcastId');
          }
        }
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('books')) {
            db.createObjectStore('books', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('book_chapters')) {
            const chapStore = db.createObjectStore('book_chapters', { keyPath: 'id' });
            chapStore.createIndex('by-book', 'bookId');
          }
          if (!db.objectStoreNames.contains('book_bookmarks')) {
            const bmkStore = db.createObjectStore('book_bookmarks', { keyPath: 'id' });
            bmkStore.createIndex('by-book', 'bookId');
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function getTrackMetadata(id: string) {
  const db = await getDB();
  return db.get('tracks', id);
}

export async function getAllStoredTracks(): Promise<StoredTrack[]> {
  const db = await getDB();
  return db.getAll('tracks');
}

export async function saveStoredTrack(
  id: string,
  data: Partial<StoredTrack>,
) {
  const db = await getDB();
  const existing = await db.get('tracks', id);
  await db.put('tracks', {
    ...(existing ?? { id }),
    ...data,
    id,
  });
}

export async function deleteStoredTrack(id: string) {
  const db = await getDB();
  await db.delete('tracks', id);
}

export async function saveTrackMetadata(
  id: string,
  data: {
    customCover?: Blob;
    customTitle?: string;
    customArtist?: string;
    customAlbum?: string;
    customYear?: string;
    customGenre?: string;
  },
) {
  await saveStoredTrack(id, data);
}

// ----- playlists -----

export async function getAllStoredPlaylists(): Promise<StoredPlaylist[]> {
  const db = await getDB();
  return db.getAll('playlists');
}

export async function saveStoredPlaylist(p: StoredPlaylist) {
  const db = await getDB();
  await db.put('playlists', p);
}

export async function deleteStoredPlaylist(id: string) {
  const db = await getDB();
  await db.delete('playlists', id);
}

// ----- watched folders (which folders to scan for music) -----

export async function getWatchedFolders(): Promise<string[]> {
  const db = await getDB();
  const entry = await db.get('settings', 'watched-folders');
  return Array.isArray(entry?.value) ? (entry.value as string[]) : [];
}

export async function saveWatchedFolders(folders: string[]): Promise<void> {
  const db = await getDB();
  await db.put('settings', { id: 'watched-folders', value: folders });
}

export type { StoredTrack, StoredPlaylist, StoredPodcast, StoredEpisode, StoredBook, StoredBookChapter, StoredBookBookmark };

// ── Podcasts ──────────────────────────────────────────────────────────────────

export async function getAllPodcasts(): Promise<StoredPodcast[]> {
  const db = await getDB();
  return db.getAll('podcasts');
}

export async function savePodcast(p: StoredPodcast): Promise<void> {
  const db = await getDB();
  await db.put('podcasts', p);
}

export async function deletePodcast(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('podcasts', id);
}

export async function getEpisodesByPodcast(podcastId: string): Promise<StoredEpisode[]> {
  const db = await getDB();
  return db.getAllFromIndex('episodes', 'by-podcast', podcastId);
}

export async function saveEpisodes(eps: StoredEpisode[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('episodes', 'readwrite');
  await Promise.all(eps.map((e) => tx.store.put(e)));
  await tx.done;
}

export async function updateEpisode(id: string, patch: Partial<StoredEpisode>): Promise<void> {
  const db = await getDB();
  const ep = await db.get('episodes', id);
  if (!ep) return;
  await db.put('episodes', { ...ep, ...patch });
}

export async function deleteEpisodesByPodcast(podcastId: string): Promise<void> {
  const db = await getDB();
  const eps = await db.getAllFromIndex('episodes', 'by-podcast', podcastId);
  const tx = db.transaction('episodes', 'readwrite');
  await Promise.all(eps.map((e) => tx.store.delete(e.id)));
  await tx.done;
}

// ── Books ─────────────────────────────────────────────────────────────────────

export async function getAllBooks(): Promise<StoredBook[]> {
  const db = await getDB();
  return db.getAll('books');
}

export async function getBookById(id: string): Promise<StoredBook | undefined> {
  const db = await getDB();
  return db.get('books', id);
}

export async function saveBook(b: StoredBook): Promise<void> {
  const db = await getDB();
  await db.put('books', b);
}

export async function updateBook(id: string, patch: Partial<StoredBook>): Promise<void> {
  const db = await getDB();
  const book = await db.get('books', id);
  if (!book) return;
  await db.put('books', { ...book, ...patch });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('books', id);
}

export async function getChaptersByBook(bookId: string): Promise<StoredBookChapter[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('book_chapters', 'by-book', bookId);
  return rows.sort((a, b) => a.index - b.index);
}

export async function saveChapters(chapters: StoredBookChapter[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('book_chapters', 'readwrite');
  await Promise.all(chapters.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function updateChapter(id: string, patch: Partial<StoredBookChapter>): Promise<void> {
  const db = await getDB();
  const ch = await db.get('book_chapters', id);
  if (!ch) return;
  await db.put('book_chapters', { ...ch, ...patch });
}

export async function deleteChaptersByBook(bookId: string): Promise<void> {
  const db = await getDB();
  const chs = await db.getAllFromIndex('book_chapters', 'by-book', bookId);
  const tx = db.transaction('book_chapters', 'readwrite');
  await Promise.all(chs.map((c) => tx.store.delete(c.id)));
  await tx.done;
}

export async function getBookmarksByBook(bookId: string): Promise<StoredBookBookmark[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('book_bookmarks', 'by-book', bookId);
  return rows.sort((a, b) => a.time - b.time);
}

export async function saveBookmark(bm: StoredBookBookmark): Promise<void> {
  const db = await getDB();
  await db.put('book_bookmarks', bm);
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('book_bookmarks', id);
}

export async function deleteBookmarksByBook(bookId: string): Promise<void> {
  const db = await getDB();
  const bms = await db.getAllFromIndex('book_bookmarks', 'by-book', bookId);
  const tx = db.transaction('book_bookmarks', 'readwrite');
  await Promise.all(bms.map((b) => tx.store.delete(b.id)));
  await tx.done;
}
