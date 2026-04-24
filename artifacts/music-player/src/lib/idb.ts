import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface MusicPlayerDB extends DBSchema {
  tracks: {
    key: string;
    value: {
      id: string;
      customCover?: Blob;
      customTitle?: string;
      customArtist?: string;
      customAlbum?: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<MusicPlayerDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MusicPlayerDB>('music-player-db', 1, {
      upgrade(db) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function getTrackMetadata(id: string) {
  const db = await getDB();
  return db.get('tracks', id);
}

export async function saveTrackMetadata(
  id: string,
  data: {
    customCover?: Blob;
    customTitle?: string;
    customArtist?: string;
    customAlbum?: string;
  }
) {
  const db = await getDB();
  const existing = await db.get('tracks', id);
  await db.put('tracks', {
    id,
    ...existing,
    ...data,
  });
}
