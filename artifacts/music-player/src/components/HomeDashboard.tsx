/**
 * HomeDashboard — shown in the main area when Mini Player is active.
 *
 * Sections (all data derived from player-context, no extra storage):
 *   1. Mixes          — user playlists + smart playlists + artist mixes
 *   2. Recent Listens — lastPlayedAt desc
 *   3. Top Recents    — most played within a selectable day range
 *   4. Recently Added — addedAt desc
 *   5. Recent Albums  — grouped by album, lastPlayedAt desc
 *   6. Recent Artists — grouped by artist, lastPlayedAt desc
 */
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Clock,
  Disc3,
  Library,
  ListMusic,
  Music,
  Star,
  User,
  Zap,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlayer } from "@/lib/player-context";
import {
  SMART_PLAYLISTS,
  playlistTracks,
  smartPlaylistTracks,
  trackCoverUrl,
} from "@/lib/types";
import { formatTime, gradientFor } from "@/lib/format";
import { AlbumCover } from "./AlbumCover";
import { cn } from "@/lib/utils";
import type { Track, Playlist } from "@/lib/types";

// ── time helpers ──────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

function daysAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

// ── data shapes ───────────────────────────────────────────────────────────────

interface AlbumGroup {
  key: string;
  album: string;
  artist: string;
  tracks: Track[];
  lastPlayedAt: number;
}

interface ArtistGroup {
  artist: string;
  tracks: Track[];
  lastPlayedAt: number;
}

interface Mix {
  id: string;
  name: string;
  tracks: Track[];
}

// ── small primitives ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
    </div>
  );
}

function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {children}
    </div>
  );
}

// ── MixCard ───────────────────────────────────────────────────────────────────

function MixCard({ mix, onClick }: { mix: Mix; onClick: () => void }) {
  const covers = mix.tracks
    .map((t) => trackCoverUrl(t))
    .filter((u): u is string => !!u)
    .slice(0, 4);

  const seed = mix.name;

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-32 text-left group focus:outline-none"
    >
      {/* Mosaic / single / gradient */}
      <div className="w-32 h-32 rounded-xl overflow-hidden mb-2 shadow-md group-hover:shadow-xl group-hover:scale-[1.03] transition-all duration-200">
        {covers.length >= 4 ? (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2">
            {covers.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full h-full object-cover" />
            ))}
          </div>
        ) : covers.length === 1 ? (
          <img src={covers[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: gradientFor(seed) }}
          >
            <ListMusic className="w-10 h-10 text-white/50" />
          </div>
        )}
      </div>
      <p className="text-xs font-medium truncate text-foreground leading-tight">{mix.name}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {mix.tracks.length} {mix.tracks.length === 1 ? "track" : "tracks"}
      </p>
    </button>
  );
}

// ── TrackCard ─────────────────────────────────────────────────────────────────

function TrackCard({
  track,
  sub,
  onClick,
}: {
  track: Track;
  sub: string;
  onClick: () => void;
}) {
  const cover = trackCoverUrl(track);
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-[118px] text-left group focus:outline-none"
    >
      <div className="w-[118px] h-[118px] rounded-xl overflow-hidden mb-2 shadow-md group-hover:shadow-xl group-hover:scale-[1.03] transition-all duration-200">
        <AlbumCover
          src={cover}
          seed={track.title + track.artist}
          size="xl"
          rounded={false}
        />
      </div>
      <p className="text-xs font-medium truncate text-foreground leading-tight">{track.title}</p>
      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{track.artist || "Unknown"}</p>
      <p className="text-[10px] text-primary/80 mt-0.5">{sub}</p>
    </button>
  );
}

// ── AlbumCard ─────────────────────────────────────────────────────────────────

function AlbumCard({
  group,
  onClick,
}: {
  group: AlbumGroup;
  onClick: () => void;
}) {
  const cover = group.tracks.map((t) => trackCoverUrl(t)).find(Boolean);
  const totalDur = group.tracks.reduce((s, t) => s + (t.duration || 0), 0);

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-32 text-left group focus:outline-none"
    >
      <div className="w-32 h-32 rounded-xl overflow-hidden mb-2 shadow-md group-hover:shadow-xl group-hover:scale-[1.03] transition-all duration-200">
        <AlbumCover
          src={cover}
          seed={group.album + group.artist}
          size="xl"
          rounded={false}
        />
      </div>
      <p className="text-xs font-medium truncate text-foreground leading-tight">
        {group.album || "Unknown Album"}
      </p>
      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{group.artist}</p>
      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
        {group.tracks.length} tracks · {formatTime(totalDur)}
      </p>
    </button>
  );
}

// ── ArtistCard ────────────────────────────────────────────────────────────────

function ArtistCard({
  group,
  onClick,
}: {
  group: ArtistGroup;
  onClick: () => void;
}) {
  const cover = group.tracks.map((t) => trackCoverUrl(t)).find(Boolean);

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-24 text-center group focus:outline-none"
    >
      <div className="w-24 h-24 rounded-full overflow-hidden mb-2 shadow-md ring-2 ring-border group-hover:ring-primary/60 group-hover:scale-[1.04] transition-all duration-200">
        <AlbumCover
          src={cover}
          seed={group.artist}
          size="xl"
          rounded={false}
        />
      </div>
      <p className="text-xs font-medium truncate text-foreground leading-tight">
        {group.artist || "Unknown"}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {group.tracks.length} {group.tracks.length === 1 ? "track" : "tracks"}
      </p>
    </button>
  );
}

// ── TopRecentRow ──────────────────────────────────────────────────────────────

function TopRecentRow({
  track,
  rank,
  onClick,
}: {
  track: Track;
  rank: number;
  onClick: () => void;
}) {
  const cover = trackCoverUrl(track);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-muted/40 transition-colors text-left group focus:outline-none"
    >
      <span className="text-xs tabular-nums text-muted-foreground/50 w-4 shrink-0 text-right">
        {rank}
      </span>
      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 shadow-sm">
        <AlbumCover src={cover} seed={track.title + track.artist} size="xl" rounded={false} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate text-foreground group-hover:text-primary transition-colors">
          {track.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{track.artist || "Unknown"}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs font-bold text-primary tabular-nums">{track.playCount ?? 0}</span>
        <span className="text-[10px] text-muted-foreground">plays</span>
      </div>
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const DAY_FILTERS = [1, 3, 6, 9, 12, 15, 18] as const;

export function HomeDashboard() {
  const { tracks, playlists, playFromList } = usePlayer();
  const [topDays, setTopDays] = useState<number>(3);

  const play = (list: Track[], idx: number) =>
    playFromList(list.map((t) => t.id), idx);

  // ── derived data ────────────────────────────────────────────────────────────

  const recentListens = useMemo(
    () =>
      [...tracks]
        .filter((t) => t.lastPlayedAt)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
        .slice(0, 24),
    [tracks],
  );

  const recentlyAdded = useMemo(
    () =>
      [...tracks]
        .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
        .slice(0, 24),
    [tracks],
  );

  const topRecents = useMemo(() => {
    const cutoff = Date.now() - topDays * 86_400_000;
    return [...tracks]
      .filter(
        (t) =>
          t.lastPlayedAt &&
          t.lastPlayedAt >= cutoff &&
          (t.playCount ?? 0) > 0,
      )
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .slice(0, 10);
  }, [tracks, topDays]);

  const recentAlbums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, AlbumGroup>();
    for (const t of tracks) {
      const key = `${t.artist}|||${t.album}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          album: t.album || "Unknown Album",
          artist: t.artist || "Unknown",
          tracks: [],
          lastPlayedAt: 0,
        });
      }
      const g = map.get(key)!;
      g.tracks.push(t);
      if ((t.lastPlayedAt ?? 0) > g.lastPlayedAt) g.lastPlayedAt = t.lastPlayedAt ?? 0;
    }
    return [...map.values()]
      .filter((g) => g.lastPlayedAt > 0)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 24);
  }, [tracks]);

  const recentArtists = useMemo<ArtistGroup[]>(() => {
    const map = new Map<string, ArtistGroup>();
    for (const t of tracks) {
      const key = t.artist || "Unknown";
      if (!map.has(key)) map.set(key, { artist: key, tracks: [], lastPlayedAt: 0 });
      const g = map.get(key)!;
      g.tracks.push(t);
      if ((t.lastPlayedAt ?? 0) > g.lastPlayedAt) g.lastPlayedAt = t.lastPlayedAt ?? 0;
    }
    return [...map.values()]
      .filter((g) => g.lastPlayedAt > 0)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 24);
  }, [tracks]);

  const mixes = useMemo<Mix[]>(() => {
    const out: Mix[] = [];

    // user playlists
    for (const pl of playlists) {
      const pts = playlistTracks(pl, tracks);
      if (pts.length > 0) out.push({ id: `pl:${pl.id}`, name: pl.name, tracks: pts });
    }

    // smart playlists
    for (const sp of SMART_PLAYLISTS) {
      const pts = smartPlaylistTracks(sp.kind, tracks).slice(0, 50);
      if (pts.length > 0) out.push({ id: `sm:${sp.kind}`, name: sp.name, tracks: pts });
    }

    // artist mixes (artists with 3+ tracks)
    const artistMap = new Map<string, Track[]>();
    for (const t of tracks) {
      const key = t.artist || "Unknown";
      if (!artistMap.has(key)) artistMap.set(key, []);
      artistMap.get(key)!.push(t);
    }
    for (const [artist, ts] of artistMap) {
      if (ts.length >= 3) {
        out.push({ id: `ar:${artist}`, name: `${artist} Mix`, tracks: ts });
      }
    }

    return out.slice(0, 24);
  }, [tracks, playlists]);

  // ── empty state ─────────────────────────────────────────────────────────────

  if (tracks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-8">
        <div className="space-y-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Music className="w-6 h-6 text-primary/60" />
          </div>
          <p className="text-sm text-muted-foreground">
            Add some music to see your dashboard
          </p>
        </div>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollArea className="flex-1 w-full">
      <div className="px-6 py-5 space-y-8 max-w-5xl">

        {/* ── MIXES ──────────────────────────────────────────────────────── */}
        {mixes.length > 0 && (
          <section>
            <SectionHeader icon={<Zap className="w-4 h-4" />} title="Mixes" />
            <HScroll>
              {mixes.map((mix) => (
                <MixCard key={mix.id} mix={mix} onClick={() => play(mix.tracks, 0)} />
              ))}
            </HScroll>
          </section>
        )}

        {/* ── RECENT LISTENS ─────────────────────────────────────────────── */}
        {recentListens.length > 0 && (
          <section>
            <SectionHeader icon={<Clock className="w-4 h-4" />} title="Recent Listens" />
            <HScroll>
              {recentListens.map((t, i) => (
                <TrackCard
                  key={t.id}
                  track={t}
                  sub={timeAgo(t.lastPlayedAt!)}
                  onClick={() => play(recentListens, i)}
                />
              ))}
            </HScroll>
          </section>
        )}

        {/* ── TOP RECENTS ────────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<Star className="w-4 h-4" />} title="Top Recents" />

          {/* Day-range filter pills */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {DAY_FILTERS.map((d) => (
              <button
                key={d}
                onClick={() => setTopDays(d)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  topDays === d
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {d} {d === 1 ? "Day" : "Days"}
              </button>
            ))}
          </div>

          {topRecents.length > 0 ? (
            <div className="space-y-0.5">
              {topRecents.map((t, i) => (
                <TopRecentRow
                  key={t.id}
                  track={t}
                  rank={i + 1}
                  onClick={() => play(topRecents, i)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-3 py-2">
              No plays tracked in the last {topDays} {topDays === 1 ? "day" : "days"}
            </p>
          )}
        </section>

        {/* ── RECENTLY ADDED ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<Library className="w-4 h-4" />} title="Recently Added" />
          <HScroll>
            {recentlyAdded.map((t, i) => (
              <TrackCard
                key={t.id}
                track={t}
                sub={daysAgo(t.addedAt)}
                onClick={() => play(recentlyAdded, i)}
              />
            ))}
          </HScroll>
        </section>

        {/* ── RECENT ALBUMS ──────────────────────────────────────────────── */}
        {recentAlbums.length > 0 && (
          <section>
            <SectionHeader icon={<Disc3 className="w-4 h-4" />} title="Recent Albums" />
            <HScroll>
              {recentAlbums.map((g) => (
                <AlbumCard key={g.key} group={g} onClick={() => play(g.tracks, 0)} />
              ))}
            </HScroll>
          </section>
        )}

        {/* ── RECENT ARTISTS ─────────────────────────────────────────────── */}
        {recentArtists.length > 0 && (
          <section>
            <SectionHeader icon={<User className="w-4 h-4" />} title="Recent Artists" />
            <HScroll>
              {recentArtists.map((g) => (
                <ArtistCard key={g.artist} group={g} onClick={() => play(g.tracks, 0)} />
              ))}
            </HScroll>
          </section>
        )}

      </div>
    </ScrollArea>
  );
}
