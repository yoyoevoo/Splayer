/**
 * artFetcher.ts
 *
 * Fetches album art from:
 *  1. MusicBrainz search → Cover Art Archive (primary)
 *  2. iTunes Search API (fallback — free, no key needed)
 *
 * MusicBrainz rate-limit is 1 req/s; we add a 1.1 s delay between calls.
 */

export interface FetchedArt {
  blob: Blob;
  url: string; // object URL — caller must revoke when done
  source: "musicbrainz" | "itunes";
}

// ── helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clean(s: string) {
  return s.replace(/[^\w\s]/gi, " ").trim();
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "MusicPlayerApp/1.0" } });
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

// ── MusicBrainz + Cover Art Archive ───────────────────────────────────────

async function searchMusicBrainz(
  artist: string,
  album: string,
): Promise<string | null> {
  const q = encodeURIComponent(
    `artist:${clean(artist)} release:${clean(album)}`,
  );
  const url = `https://musicbrainz.org/ws/2/release/?query=${q}&fmt=json&limit=5`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "MusicPlayerApp/1.0 (replit)",
        Accept: "application/json",
      },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const releases: { id: string; score?: number }[] =
      data.releases ?? [];
    if (releases.length === 0) return null;
    // pick highest score
    releases.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return releases[0].id;
  } catch {
    return null;
  }
}

async function fetchCoverFromMBID(mbid: string): Promise<Blob | null> {
  const url = `https://coverartarchive.org/release/${mbid}/front`;
  // The CAA redirects to the actual image
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "MusicPlayerApp/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

// ── iTunes Search API (fallback) ──────────────────────────────────────────

async function fetchCoverFromiTunes(
  artist: string,
  album: string,
): Promise<Blob | null> {
  const term = encodeURIComponent(`${artist} ${album}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=5`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const results: { artworkUrl100?: string }[] = data.results ?? [];
    if (results.length === 0) return null;
    const artworkUrl = results[0].artworkUrl100?.replace("100x100", "600x600");
    if (!artworkUrl) return null;
    return fetchBlob(artworkUrl);
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

let _lastMBRequest = 0;

async function mbRateLimitedFetch(artist: string, album: string) {
  const now = Date.now();
  const wait = 1100 - (now - _lastMBRequest);
  if (wait > 0) await sleep(wait);
  _lastMBRequest = Date.now();
  return searchMusicBrainz(artist, album);
}

/**
 * Fetch album art for a track using artist + album metadata.
 * Returns a FetchedArt object (with an object URL) or null if nothing found.
 * The caller is responsible for calling URL.revokeObjectURL(art.url) when done.
 */
export async function fetchAlbumArt(
  artist: string,
  album: string,
): Promise<FetchedArt | null> {
  if (!artist || !album) return null;

  // 1. MusicBrainz → CAA
  const mbid = await mbRateLimitedFetch(artist, album);
  if (mbid) {
    const blob = await fetchCoverFromMBID(mbid);
    if (blob && blob.size > 1000) {
      return { blob, url: URL.createObjectURL(blob), source: "musicbrainz" };
    }
  }

  // 2. iTunes fallback
  const blob = await fetchCoverFromiTunes(artist, album);
  if (blob && blob.size > 1000) {
    return { blob, url: URL.createObjectURL(blob), source: "itunes" };
  }

  return null;
}
