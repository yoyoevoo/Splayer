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
import { getTrackMetadata, saveTrackMetadata } from "./idb";
import type { RepeatMode, Track } from "./types";

interface PlayerContextValue {
  tracks: Track[];
  currentIndex: number | null;
  currentTrack: Track | null;
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
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
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

  if (!audioRef.current && typeof window !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata";
  }

  const currentTrack =
    currentIndex !== null && currentIndex >= 0 && currentIndex < tracks.length
      ? tracks[currentIndex]
      : null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, tracks, repeat, shuffle]);

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

  const playIndex = useCallback((index: number) => {
    const list = tracksRef.current;
    if (index < 0 || index >= list.length) return;
    const track = list[index];
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== track.url) {
      audio.src = track.url;
    }
    setCurrentIndex(index);
    audio.play().catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentIndex === null) {
      if (tracksRef.current.length > 0) playIndex(0);
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [currentIndex, playIndex]);

  const next = useCallback(() => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    if (currentIndex === null) {
      playIndex(0);
      return;
    }
    if (shuffle) {
      if (list.length === 1) {
        playIndex(0);
        return;
      }
      let n = currentIndex;
      while (n === currentIndex) {
        n = Math.floor(Math.random() * list.length);
      }
      playIndex(n);
      return;
    }
    const n = (currentIndex + 1) % list.length;
    playIndex(n);
  }, [currentIndex, shuffle, playIndex]);

  const prev = useCallback(() => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    if (currentIndex === null) {
      playIndex(0);
      return;
    }
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const p = (currentIndex - 1 + list.length) % list.length;
    playIndex(p);
  }, [currentIndex, playIndex]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    const list = tracksRef.current;
    if (currentIndex === null) return;
    if (shuffle) {
      next();
      return;
    }
    if (currentIndex === list.length - 1) {
      if (repeat === "all") {
        playIndex(0);
      } else {
        setIsPlaying(false);
      }
      return;
    }
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, shuffle, currentIndex, next, playIndex]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0 && muted) setMuted(false);
  }, [muted]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() =>
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
  []);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setLoadingFiles(true);
    try {
      const existing = new Set(tracksRef.current.map((t) => t.id));
      const newTracks: Track[] = [];
      for (const file of files) {
        if (!file.type.startsWith("audio/") && !/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i.test(file.name)) {
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

  const removeTrack = useCallback((id: string) => {
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const removed = prev[idx];
      try {
        URL.revokeObjectURL(removed.url);
        if (removed.embeddedCoverUrl) URL.revokeObjectURL(removed.embeddedCoverUrl);
        if (removed.customCoverUrl) URL.revokeObjectURL(removed.customCoverUrl);
      } catch {}
      const next = prev.filter((t) => t.id !== id);
      setCurrentIndex((ci) => {
        if (ci === null) return null;
        if (ci === idx) {
          const audio = audioRef.current;
          if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          }
          return null;
        }
        if (ci > idx) return ci - 1;
        return ci;
      });
      return next;
    });
  }, []);

  const setCustomCover = useCallback(async (id: string, file: File) => {
    const blob = file;
    await saveTrackMetadata(id, { customCover: blob });
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.customCoverUrl) {
          try { URL.revokeObjectURL(t.customCoverUrl); } catch {}
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
          try { URL.revokeObjectURL(t.customCoverUrl); } catch {}
        }
        return { ...t, customCoverUrl: undefined };
      }),
    );
  }, []);

  const updateTrackInfo = useCallback(async (
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
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      tracks,
      currentIndex,
      currentTrack,
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
    }),
    [
      tracks,
      currentIndex,
      currentTrack,
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
