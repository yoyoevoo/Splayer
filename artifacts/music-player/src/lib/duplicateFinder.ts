/**
 * duplicateFinder.ts
 *
 * Two detection strategies:
 *  1. Metadata match  — same title + artist (case/space-normalised)
 *  2. FileSize+Duration — identical file.size AND duration within ±1 s
 *     (only for tracks not already caught by strategy 1)
 */
import type { Track } from "./types";

export type DuplicateMethod = "metadata" | "filesize-duration";

export interface DuplicateGroup {
  id: string;
  method: DuplicateMethod;
  tracks: Track[];
  /** ID of the track we recommend keeping (largest file size). */
  keepId: string;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findDuplicates(tracks: Track[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const alreadyGrouped = new Set<string>();

  // ── Strategy 1: same title + artist ────────────────────────────────────
  const metaMap = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = `${norm(t.title)}|||${norm(t.artist)}`;
    const bucket = metaMap.get(key) ?? [];
    bucket.push(t);
    metaMap.set(key, bucket);
  }

  for (const [, bucket] of metaMap) {
    if (bucket.length < 2) continue;
    const keepId = bucket.reduce(
      (best, t) => (t.file.size > best.file.size ? t : best),
      bucket[0],
    ).id;
    groups.push({
      id: `meta-${bucket[0].id}`,
      method: "metadata",
      tracks: bucket,
      keepId,
    });
    bucket.forEach((t) => alreadyGrouped.add(t.id));
  }

  // ── Strategy 2: identical file size + duration (±1 s) ──────────────────
  const remaining = tracks.filter((t) => !alreadyGrouped.has(t.id));
  const sizeMap = new Map<number, Track[]>();
  for (const t of remaining) {
    const bucket = sizeMap.get(t.file.size) ?? [];
    bucket.push(t);
    sizeMap.set(t.file.size, bucket);
  }

  for (const [, bucket] of sizeMap) {
    if (bucket.length < 2) continue;
    // sub-group by rounded duration (±1 s tolerance)
    const durBuckets = new Map<number, Track[]>();
    for (const t of bucket) {
      const dk = Math.round(t.duration);
      const sub = durBuckets.get(dk) ?? [];
      sub.push(t);
      durBuckets.set(dk, sub);
    }
    for (const [, sub] of durBuckets) {
      if (sub.length < 2) continue;
      const keepId = sub.reduce(
        (best, t) => (t.file.size >= best.file.size ? t : best),
        sub[0],
      ).id;
      groups.push({
        id: `sizedur-${sub[0].id}`,
        method: "filesize-duration",
        tracks: sub,
        keepId,
      });
    }
  }

  return groups;
}

// ── Utility formatters ─────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
