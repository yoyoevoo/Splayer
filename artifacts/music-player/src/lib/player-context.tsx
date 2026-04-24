import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { extractMetadata, generateTrackId } from "./metadata";
import {
  deleteStoredPlaylist,
  deleteStoredTrack,
  getAllStoredPlaylists,
  getAllStoredTracks,
  getTrackMetadata,
  saveStoredPlaylist,
  saveStoredTrack,
  saveTrackMetadata,
} from "./idb";
import type { Playlist, RepeatMode, Track } from "./types";

interface PlayerContextValue {
  tracks: Track[];
  playlists: Playlist[];
  currentIndex: number | null;
  currentTrack: Track | null;
  currentQueueIds: string[] | null;
  currentQueueLabel: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  loadingFiles: boolean;
  addFiles: (files: File[]) => Promise<void>;
  playIndex: (index: number) => void;
  playFromList: (
    trackIds: string[],
    index: number,
    label?: string,
  ) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  removeTrack: (id: string) => void;
  setCustomCover: (id: string, file: File) => Promise<void>;
  clearCustomCover: (id: string) => Promise<void>;
  updateTrackInfo: (
    id: string,
    info: { title?: string; artist?: string; album?: string },
  ) => Promise<void>;
  // playlists
  createPlaylist: (name: string) => Promise<Playlist>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  setPlaylistCover: (id: string, file: File) => Promise<void>;
  clearPlaylistCover: (id: string) => Promise<void>;
  addTracksToPlaylist: (id: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (id: string, trackId: string) => Promise<void>;
  reorderPlaylist: (id: string, trackIds: string[]) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentQueueIds, setCurrentQueueIds] = useState<string[] | null>(null);
  const [currentQueueLabel, setCurrentQueueLabel] = useState<string>("Library");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [loadingFiles, setLoadingFiles] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;
  const playlistsRef = useRef<Playlist[]>([]);
  playlistsRef.current = playlists;
  const queueIdsRef = useRef<string[] | null>(null);
  queueIdsRef.current = currentQueueIds;
  const currentTrackIdRef = useRef<string | null>(null);
  currentTrackIdRef.current = currentTrackId;

  if (!audioRef.current && typeof window !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata";
  }

  // Resolve effective queue (queue ids if set, else all tracks).
  const effectiveQueue: Track[] = useMemo(() => {
    if (currentQueueIds === null) return tracks;
    const map = new Map(tracks.map((t) => [t.id, t]));
    const list: Track[] = [];
    for (const id of currentQueueIds) {
      const t = map.get(id);
      if (t) list.push(t);
    }
    return list;
  }, [currentQueueIds, tracks]);

  const currentIndex =
    currentTrackId === null
      ? null
      : (() => {
          const i = effectiveQueue.findIndex((t) => t.id === currentTrackId);
          return i === -1 ? null : i;
        })();

  const currentTrack =
    currentTrackId === null
      ? null
      : tracks.find((t) => t.id === currentTrackId) ?? null;

  const queueRef = useRef<Track[]>([]);
  queueRef.current = effectiveQueue;

  const playTrackById = useCallback((trackId: string) => {
    const audio = audioRef.current;
    const track = tracksRef.current.find((t) => t.id === trackId);
    if (!audio || !track) return;
    if (audio.src !== track.url) {
      audio.src = track.url;
    }
    setCurrentTrackId(trackId);
    audio.play().catch(() => {});
  }, []);

  const playIndex = useCallback(
    (index: number) => {
      const list = queueRef.current;
      if (index < 0 || index >= list.length) return;
      playTrackById(list[index].id);
    },
    [playTrackById],
  );

  const playFromList = useCallback(
    (trackIds: string[], index: number, label?: string) => {
      if (trackIds.length === 0 || index < 0 || index >= trackIds.length) return;
      setCurrentQueueIds(trackIds);
      if (label !== undefined) setCurrentQueueLabel(label);
      // Wait a tick so queue is set, then play.
      const id = trackIds[index];
      Promise.resolve().then(() => playTrackById(id));
    },
    [playTrackById],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrackId === null) {
      const q = queueRef.current;
      if (q.length > 0) playTrackById(q[0].id);
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [currentTrackId, playTrackById]);

  const next = useCallback(() => {
    const list = queueRef.current;
    if (list.length === 0) return;
    if (currentTrackId === null) {
      playTrackById(list[0].id);
      return;
    }
    const idx = list.findIndex((t) => t.id === currentTrackId);
    if (idx < 0) {
      playTrackById(list[0].id);
      return;
    }
    if (shuffle) {
      if (list.length === 1) {
        playTrackById(list[0].id);
        return;
      }
      let n = idx;
      while (n === idx) {
        n = Math.floor(Math.random() * list.length);
      }
      playTrackById(list[n].id);
      return;
    }
    const n = (idx + 1) % list.length;
    playTrackById(list[n].id);
  }, [currentTrackId, shuffle, playTrackById]);

  const prev = useCallback(() => {
    const list = queueRef.current;
    if (list.length === 0) return;
    if (currentTrackId === null) {
      playTrackById(list[0].id);
      return;
    }
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const idx = list.findIndex((t) => t.id === currentTrackId);
    if (idx < 0) {
      playTrackById(list[0].id);
      return;
    }
    const p = (idx - 1 + list.length) % list.length;
    playTrackById(list[p].id);
  }, [currentTrackId, playTrackById]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    const list = queueRef.current;
    if (currentTrackId === null) return;
    const idx = list.findIndex((t) => t.id === currentTrackId);
    if (shuffle) {
      next();
      return;
    }
    if (idx === list.length - 1) {
      if (repeat === "all") {
        if (list.length > 0) playTrackById(list[0].id);
      } else {
        setIsPlaying(false);
      }
      return;
    }
    next();
  }, [repeat, shuffle, currentTrackId, next, playTrackById]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => handleEnded();

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [handleEnded]);

  // Volume / mute sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Document title
  useEffect(() => {
    if (currentTrack && isPlaying) {
      document.title = `${currentTrack.title} — ${currentTrack.artist}`;
    } else {
      document.title = "Music Player";
    }
  }, [currentTrack, isPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      if (v > 0 && muted) setMuted(false);
    },
    [muted],
  );

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(
    () =>
      setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
    [],
  );

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setLoadingFiles(true);
    try {
      const existing = new Set(tracksRef.current.map((t) => t.id));
      const newTracks: Track[] = [];
      for (const file of files) {
        if (
          !file.type.startsWith("audio/") &&
          !/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i.test(file.name)
        ) {
          continue;
        }
        const id = generateTrackId(file);
        if (existing.has(id)) continue;
        existing.add(id);
        try {
          const meta = await extractMetadata(file);
          const stored = await getTrackMetadata(id);
          let customCoverUrl: string | undefined;
          if (stored?.customCover) {
            customCoverUrl = URL.createObjectURL(stored.customCover);
          }
          const track: Track = {
            id,
            file,
            url: URL.createObjectURL(file),
            title: stored?.customTitle ?? meta.title,
            artist: stored?.customArtist ?? meta.artist,
            album: stored?.customAlbum ?? meta.album,
            year: meta.year,
            duration: meta.duration ?? 0,
            embeddedCoverUrl: meta.coverUrl,
            customCoverUrl,
          };
          newTracks.push(track);

          try {
            await saveStoredTrack(id, {
              fileBlob: file,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              addedAt: stored?.addedAt ?? Date.now(),
              metaTitle: meta.title,
              metaArtist: meta.artist,
              metaAlbum: meta.album,
              metaYear: meta.year,
              metaDuration: meta.duration,
              embeddedCover: meta.coverBlob,
            });
          } catch (storageErr) {
            console.warn("Failed to persist track", file.name, storageErr);
          }
        } catch (e) {
          console.warn("Failed to add track", file.name, e);
        }
      }
      if (newTracks.length > 0) {
        setTracks((prev) => [...prev, ...newTracks]);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  // Restore previously-saved tracks and playlists on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stored, storedPlaylists] = await Promise.all([
          getAllStoredTracks(),
          getAllStoredPlaylists(),
        ]);
        if (cancelled) return;

        if (stored.length > 0) {
          stored.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
          const restored: Track[] = [];
          for (const s of stored) {
            if (!s.fileBlob) continue;
            const file = new File(
              [s.fileBlob],
              s.fileName ?? "track",
              { type: s.fileType || s.fileBlob.type || "audio/mpeg" },
            );
            const embeddedCoverUrl = s.embeddedCover
              ? URL.createObjectURL(s.embeddedCover)
              : undefined;
            const customCoverUrl = s.customCover
              ? URL.createObjectURL(s.customCover)
              : undefined;
            restored.push({
              id: s.id,
              file,
              url: URL.createObjectURL(file),
              title:
                s.customTitle ??
                s.metaTitle ??
                (s.fileName ?? "Unknown").replace(/\.[^/.]+$/, ""),
              artist: s.customArtist ?? s.metaArtist ?? "Unknown Artist",
              album: s.customAlbum ?? s.metaAlbum ?? "Unknown Album",
              year: s.metaYear,
              duration: s.metaDuration ?? 0,
              embeddedCoverUrl,
              customCoverUrl,
            });
          }
          if (restored.length > 0) {
            setTracks((prev) => {
              const have = new Set(prev.map((t) => t.id));
              return [...prev, ...restored.filter((t) => !have.has(t.id))];
            });
          }
        }

        if (storedPlaylists.length > 0) {
          storedPlaylists.sort((a, b) => a.createdAt - b.createdAt);
          const restoredPls: Playlist[] = storedPlaylists.map((p) => ({
            id: p.id,
            name: p.name,
            trackIds: p.trackIds,
            customCoverUrl: p.customCover
              ? URL.createObjectURL(p.customCover)
              : undefined,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }));
          setPlaylists(restoredPls);
        }
      } catch (e) {
        console.warn("Failed to restore saved data", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const removeTrack = useCallback((id: string) => {
    deleteStoredTrack(id).catch((e) =>
      console.warn("Failed to delete stored track", id, e),
    );
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const removed = prev[idx];
      try {
        URL.revokeObjectURL(removed.url);
        if (removed.embeddedCoverUrl)
          URL.revokeObjectURL(removed.embeddedCoverUrl);
        if (removed.customCoverUrl)
          URL.revokeObjectURL(removed.customCoverUrl);
      } catch {}
      return prev.filter((t) => t.id !== id);
    });
    if (currentTrackIdRef.current === id) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      setCurrentTrackId(null);
    }
    // Remove from all playlists too.
    setPlaylists((prev) => {
      const updated: Playlist[] = [];
      for (const p of prev) {
        if (p.trackIds.includes(id)) {
          const next = {
            ...p,
            trackIds: p.trackIds.filter((tid) => tid !== id),
            updatedAt: Date.now(),
          };
          updated.push(next);
          saveStoredPlaylist({
            id: next.id,
            name: next.name,
            trackIds: next.trackIds,
            createdAt: next.createdAt,
            updatedAt: next.updatedAt,
            customCover: undefined,
          }).catch(() => {});
        } else {
          updated.push(p);
        }
      }
      return updated;
    });
  }, []);

  const setCustomCover = useCallback(async (id: string, file: File) => {
    const blob = file;
    await saveTrackMetadata(id, { customCover: blob });
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.customCoverUrl) {
          try {
            URL.revokeObjectURL(t.customCoverUrl);
          } catch {}
        }
        return { ...t, customCoverUrl: URL.createObjectURL(blob) };
      }),
    );
  }, []);

  const clearCustomCover = useCallback(async (id: string) => {
    await saveTrackMetadata(id, { customCover: undefined });
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.customCoverUrl) {
          try {
            URL.revokeObjectURL(t.customCoverUrl);
          } catch {}
        }
        return { ...t, customCoverUrl: undefined };
      }),
    );
  }, []);

  const updateTrackInfo = useCallback(
    async (
      id: string,
      info: { title?: string; artist?: string; album?: string },
    ) => {
      await saveTrackMetadata(id, {
        customTitle: info.title,
        customArtist: info.artist,
        customAlbum: info.album,
      });
      setTracks((prev) =>
        prev.map((t) =>
          t.id !== id
            ? t
            : {
                ...t,
                title: info.title ?? t.title,
                artist: info.artist ?? t.artist,
                album: info.album ?? t.album,
              },
        ),
      );
    },
    [],
  );

  // ----- playlist actions -----

  const persistPlaylist = useCallback(
    async (
      p: Playlist,
      coverBlob?: Blob | null, // null = clear, undefined = unchanged
    ) => {
      await saveStoredPlaylist({
        id: p.id,
        name: p.name,
        trackIds: p.trackIds,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        customCover:
          coverBlob === undefined
            ? undefined // unchanged value handled at storage level via existing... but our store is full PUT.
            : coverBlob ?? undefined,
      });
    },
    [],
  );

  const createPlaylist = useCallback(async (name: string) => {
    const now = Date.now();
    const playlist: Playlist = {
      id: makeId("pl"),
      name: name.trim() || "New Playlist",
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveStoredPlaylist({
      id: playlist.id,
      name: playlist.name,
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    });
    setPlaylists((prev) => [...prev, playlist]);
    return playlist;
  }, []);

  const renamePlaylist = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim() || "Untitled";
      const current = playlistsRef.current.find((p) => p.id === id);
      if (!current) return;
      const updated: Playlist = {
        ...current,
        name: trimmed,
        updatedAt: Date.now(),
      };
      setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
      const existing = (await getAllStoredPlaylists()).find((x) => x.id === id);
      await saveStoredPlaylist({
        id: updated.id,
        name: updated.name,
        trackIds: updated.trackIds,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        customCover: existing?.customCover,
      });
    },
    [],
  );

  const deletePlaylist = useCallback(async (id: string) => {
    await deleteStoredPlaylist(id);
    setPlaylists((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.customCoverUrl) {
        try {
          URL.revokeObjectURL(target.customCoverUrl);
        } catch {}
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const setPlaylistCover = useCallback(async (id: string, file: File) => {
    const current = playlistsRef.current.find((p) => p.id === id);
    if (!current) return;
    if (current.customCoverUrl) {
      try {
        URL.revokeObjectURL(current.customCoverUrl);
      } catch {}
    }
    const updated: Playlist = {
      ...current,
      customCoverUrl: URL.createObjectURL(file),
      updatedAt: Date.now(),
    };
    setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
    await saveStoredPlaylist({
      id: updated.id,
      name: updated.name,
      trackIds: updated.trackIds,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      customCover: file,
    });
  }, []);

  const clearPlaylistCover = useCallback(async (id: string) => {
    const current = playlistsRef.current.find((p) => p.id === id);
    if (!current) return;
    if (current.customCoverUrl) {
      try {
        URL.revokeObjectURL(current.customCoverUrl);
      } catch {}
    }
    const updated: Playlist = {
      ...current,
      customCoverUrl: undefined,
      updatedAt: Date.now(),
    };
    setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
    await saveStoredPlaylist({
      id: updated.id,
      name: updated.name,
      trackIds: updated.trackIds,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      customCover: undefined,
    });
  }, []);

  const addTracksToPlaylist = useCallback(
    async (id: string, trackIds: string[]) => {
      const current = playlistsRef.current.find((p) => p.id === id);
      if (!current) return;
      const have = new Set(current.trackIds);
      const additions = trackIds.filter((tid) => !have.has(tid));
      if (additions.length === 0) return;
      const updated: Playlist = {
        ...current,
        trackIds: [...current.trackIds, ...additions],
        updatedAt: Date.now(),
      };
      setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
      const existing = (await getAllStoredPlaylists()).find((x) => x.id === id);
      await saveStoredPlaylist({
        id: updated.id,
        name: updated.name,
        trackIds: updated.trackIds,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        customCover: existing?.customCover,
      });
    },
    [],
  );

  const removeTrackFromPlaylist = useCallback(
    async (id: string, trackId: string) => {
      const current = playlistsRef.current.find((p) => p.id === id);
      if (!current || !current.trackIds.includes(trackId)) return;
      const updated: Playlist = {
        ...current,
        trackIds: current.trackIds.filter((tid) => tid !== trackId),
        updatedAt: Date.now(),
      };
      setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
      const existing = (await getAllStoredPlaylists()).find((x) => x.id === id);
      await saveStoredPlaylist({
        id: updated.id,
        name: updated.name,
        trackIds: updated.trackIds,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        customCover: existing?.customCover,
      });
    },
    [],
  );

  const reorderPlaylist = useCallback(
    async (id: string, trackIds: string[]) => {
      const current = playlistsRef.current.find((p) => p.id === id);
      if (!current) return;
      const valid = new Set(current.trackIds);
      const cleaned = trackIds.filter((t) => valid.has(t));
      const updated: Playlist = {
        ...current,
        trackIds: cleaned,
        updatedAt: Date.now(),
      };
      setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
      const existing = (await getAllStoredPlaylists()).find((x) => x.id === id);
      await saveStoredPlaylist({
        id: updated.id,
        name: updated.name,
        trackIds: updated.trackIds,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        customCover: existing?.customCover,
      });
    },
    [],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      tracks,
      playlists,
      currentIndex,
      currentTrack,
      currentQueueIds,
      currentQueueLabel,
      isPlaying,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      loadingFiles,
      addFiles,
      playIndex,
      playFromList,
      togglePlay,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      removeTrack,
      setCustomCover,
      clearCustomCover,
      updateTrackInfo,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      setPlaylistCover,
      clearPlaylistCover,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylist,
    }),
    [
      tracks,
      playlists,
      currentIndex,
      currentTrack,
      currentQueueIds,
      currentQueueLabel,
      isPlaying,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      loadingFiles,
      addFiles,
      playIndex,
      playFromList,
      togglePlay,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      removeTrack,
      setCustomCover,
      clearCustomCover,
      updateTrackInfo,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      setPlaylistCover,
      clearPlaylistCover,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylist,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
