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
  metaDuration?: number;
  embeddedCover?: Blob;
  customCover?: Blob;
  customTitle?: string;
  customArtist?: string;
  customAlbum?: string;
}

interface MusicPlayerDB extends DBSchema {
  tracks: {
    key: string;
    value: StoredTrack;
  };
}

let dbPromise: Promise<IDBPDatabase<MusicPlayerDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MusicPlayerDB>('music-player-db', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('tracks', { keyPath: 'id' });
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
  },
) {
  await saveStoredTrack(id, data);
}

export type { StoredTrack };
