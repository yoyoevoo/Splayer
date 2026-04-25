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
}

interface StoredPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  customCover?: Blob;
  createdAt: number;
  updatedAt: number;
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
}

let dbPromise: Promise<IDBPDatabase<MusicPlayerDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MusicPlayerDB>('music-player-db', 4, {
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

export type { StoredTrack, StoredPlaylist };
