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

export const EQ_BANDS = [
  { freq: 60,    label: "60Hz",  type: "lowshelf"  as BiquadFilterType },
  { freq: 250,   label: "250Hz", type: "peaking"   as BiquadFilterType },
  { freq: 1000,  label: "1kHz",  type: "peaking"   as BiquadFilterType },
  { freq: 4000,  label: "4kHz",  type: "peaking"   as BiquadFilterType },
  { freq: 16000, label: "16kHz", type: "highshelf" as BiquadFilterType },
];

export const EQ_PRESETS: Record<string, number[]> = {
  Flat:        [0,  0,  0,  0,  0],
  "Bass Boost":[9,  5,  0,  0,  0],
  Vocal:       [-3, 0,  6,  4,  0],
  "Treble Boost":[0,0,  0,  6,  9],
  "Lo-Fi":     [4,  2,  0,  0, -8],
};

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
  crossfadeEnabled: boolean;
  crossfadeSecs: number;
  // Equalizer
  eqGains: number[];
  eqPreset: string;
  setEqGain: (bandIndex: number, gain: number) => void;
  applyEqPreset: (name: string) => void;
  // Visualizer
  analyserRef: { current: AnalyserNode | null };
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
  toggleCrossfade: () => void;
  setCrossfadeSecs: (s: number) => void;
  removeTrack: (id: string) => void;
  setCustomCover: (id: string, file: File) => Promise<void>;
  clearCustomCover: (id: string) => Promise<void>;
  updateTrackInfo: (
    id: string,
    info: { title?: string; artist?: string; album?: string; year?: string; genre?: string },
  ) => Promise<void>;
  toggleLike: (id: string) => Promise<void>;
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

  const [crossfadeEnabled, setCrossfadeEnabledState] = useState(true);
  const [crossfadeSecs, setCrossfadeSecsState] = useState(3);

  // Equalizer state (persisted in localStorage)
  const [eqGains, setEqGainsState] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("eq-gains") ?? "null") ?? EQ_PRESETS.Flat; }
    catch { return EQ_PRESETS.Flat; }
  });
  const [eqPreset, setEqPresetState] = useState<string>(
    () => localStorage.getItem("eq-preset") ?? "Flat",
  );

  // Web Audio pipeline refs (lazy-init on first play)
  const waCtxRef = useRef<AudioContext | null>(null);
  const waAnalyserRef = useRef<AnalyserNode | null>(null);
  const waFiltersRef = useRef<BiquadFilterNode[]>([]);
  const waConnectedRef = useRef<Set<HTMLAudioElement>>(new Set());
  const eqGainsRef = useRef(eqGains);
  eqGainsRef.current = eqGains;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;
  const playlistsRef = useRef<Playlist[]>([]);
  playlistsRef.current = playlists;
  const queueIdsRef = useRef<string[] | null>(null);
  queueIdsRef.current = currentQueueIds;
  const currentTrackIdRef = useRef<string | null>(null);
  currentTrackIdRef.current = currentTrackId;
  const countedTrackIdRef = useRef<string | null>(null);

  // Crossfade refs
  const crossfadeEnabledRef = useRef(true);
  const crossfadeSecsRef = useRef(3);
  const volumeRef = useRef(0.85);
  const mutedRef = useRef(false);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("off");

  crossfadeEnabledRef.current = crossfadeEnabled;
  crossfadeSecsRef.current = crossfadeSecs;
  volumeRef.current = volume;
  mutedRef.current = muted;
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;

  // Two audio elements for true crossfade (simultaneous playback)
  if (!audioRef.current && typeof window !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";
  }
  const xfAudioRef = useRef<HTMLAudioElement | null>(null);
  if (!xfAudioRef.current && typeof window !== "undefined") {
    xfAudioRef.current = new Audio();
    xfAudioRef.current.preload = "auto";
  }

  // Crossfade ramp state
  const xfTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);   // for manual fade-in
  const xfFadeOutRef = useRef<ReturnType<typeof setInterval> | null>(null); // for auto crossfade
  const xfFadeInRef = useRef<ReturnType<typeof setInterval> | null>(null);  // for auto crossfade
  const xfActiveRef = useRef(false); // true while two-element crossfade is running

  // Cancel ALL active fade timers + stop xfAudio (called on manual track change)
  const cancelXf = useCallback(() => {
    if (xfTimerRef.current)  { clearInterval(xfTimerRef.current);  xfTimerRef.current  = null; }
    if (xfFadeOutRef.current) { clearInterval(xfFadeOutRef.current); xfFadeOutRef.current = null; }
    if (xfFadeInRef.current)  { clearInterval(xfFadeInRef.current);  xfFadeInRef.current  = null; }
    xfActiveRef.current = false;
    const xfAudio = xfAudioRef.current;
    if (xfAudio) { xfAudio.pause(); xfAudio.volume = 0; xfAudio.removeAttribute("src"); }
  }, []);

  // Ramp a single audio element's volume (for manual track-change fade-in)
  const rampVolume = useCallback((
    audio: HTMLAudioElement,
    fromVol: number,
    toVol: number,
    durationMs: number,
  ) => {
    if (xfTimerRef.current) { clearInterval(xfTimerRef.current); xfTimerRef.current = null; }
    audio.volume = Math.max(0, Math.min(1, fromVol));
    if (durationMs <= 0) { audio.volume = toVol; return; }
    const steps = Math.max(1, Math.round(durationMs / 50));
    const delta = (toVol - fromVol) / steps;
    let step = 0;
    const timerId = setInterval(() => {
      step++;
      audio.volume = Math.max(0, Math.min(1, fromVol + delta * step));
      if (step >= steps) {
        audio.volume = Math.max(0, Math.min(1, toVol));
        clearInterval(timerId);
        if (xfTimerRef.current === timerId) xfTimerRef.current = null;
      }
    }, 50);
    xfTimerRef.current = timerId;
  }, []);

  // ── Web Audio Pipeline ──────────────────────────────────────────────────────
  // Lazily initialise AudioContext + EQ + Analyser, then connect audio element.
  const ensureWA = useCallback((el: HTMLAudioElement) => {
    // Create context on first call (must happen from a user gesture)
    if (!waCtxRef.current) {
      const ctx = new AudioContext();
      waCtxRef.current = ctx;

      const gains = eqGainsRef.current;
      const filters = EQ_BANDS.map(({ freq, type }, i) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = 1;
        f.gain.value = gains[i] ?? 0;
        return f;
      });
      waFiltersRef.current = filters;

      // Chain filters: filter[0] → filter[1] → ... → analyser → destination
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      waAnalyserRef.current = analyser;
      filters[filters.length - 1].connect(analyser);
      analyser.connect(ctx.destination);
    }

    // Connect this audio element once
    if (!waConnectedRef.current.has(el)) {
      const src = waCtxRef.current.createMediaElementSource(el);
      src.connect(waFiltersRef.current[0] ?? waCtxRef.current.destination);
      waConnectedRef.current.add(el);
    }

    // Resume if browser suspended the context
    if (waCtxRef.current.state === "suspended") {
      waCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const setEqGain = useCallback((bandIndex: number, gain: number) => {
    const clamped = Math.max(-12, Math.min(12, gain));
    setEqGainsState((prev) => {
      const next = [...prev];
      next[bandIndex] = clamped;
      localStorage.setItem("eq-gains", JSON.stringify(next));
      return next;
    });
    const f = waFiltersRef.current[bandIndex];
    if (f) {
      const t = waCtxRef.current?.currentTime ?? 0;
      f.gain.setTargetAtTime(clamped, t, 0.02);
    }
  }, []);

  const applyEqPreset = useCallback((name: string) => {
    const gains = EQ_PRESETS[name] ?? EQ_PRESETS.Flat;
    setEqGainsState(gains);
    setEqPresetState(name);
    localStorage.setItem("eq-gains", JSON.stringify(gains));
    localStorage.setItem("eq-preset", name);
    const ctx = waCtxRef.current;
    waFiltersRef.current.forEach((f, i) => {
      const t = ctx?.currentTime ?? 0;
      f.gain.setTargetAtTime(gains[i], t, 0.02);
    });
  }, []);

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
    // Cancel any active crossfade
    cancelXf();
    const isNewSrc = audio.src !== track.url;
    if (isNewSrc) {
      audio.src = track.url;
      countedTrackIdRef.current = null;
    }
    setCurrentTrackId(trackId);
    // Initialise Web Audio pipeline (requires user gesture, so call here)
    ensureWA(audio);
    const effVol = mutedRef.current ? 0 : volumeRef.current;
    if (isNewSrc && crossfadeEnabledRef.current && !mutedRef.current) {
      audio.volume = 0;
      audio.play().catch(() => {});
      rampVolume(audio, 0, effVol, crossfadeSecsRef.current * 1000);
    } else {
      audio.volume = effVol;
      audio.play().catch(() => {});
    }
  }, [cancelXf, rampVolume, ensureWA]);

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
      ensureWA(audio); // resume AudioContext if suspended
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [currentTrackId, playTrackById, ensureWA]);

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

  // Audio event listeners — re-attaches when handleEnded changes (i.e. track changes)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => {
      setIsPlaying(true);
      const id = currentTrackIdRef.current;
      if (!id) return;
      if (audio.currentTime > 2) return;
      if (countedTrackIdRef.current === id) return;
      countedTrackIdRef.current = id;
      const now = Date.now();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, playCount: (t.playCount ?? 0) + 1, lastPlayedAt: now }
            : t,
        ),
      );
      saveStoredTrack(id, {
        playCount:
          (tracksRef.current.find((t) => t.id === id)?.playCount ?? 0) + 1,
        lastPlayedAt: now,
      }).catch((e) => console.warn("Failed to save play count", e));
    };
    const onPause = () => setIsPlaying(false);
    // Skip ended when crossfade already handled the transition
    const onEnded = () => { if (!xfActiveRef.current) handleEnded(); };

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

  // True crossfade — runs once, polls via refs only (no stale closures)
  useEffect(() => {
    const stopFades = () => {
      if (xfFadeOutRef.current) { clearInterval(xfFadeOutRef.current); xfFadeOutRef.current = null; }
      if (xfFadeInRef.current)  { clearInterval(xfFadeInRef.current);  xfFadeInRef.current  = null; }
    };

    const poll = setInterval(() => {
      const audio = audioRef.current;
      const xfAudio = xfAudioRef.current;
      if (
        !audio || !xfAudio ||
        xfActiveRef.current ||
        !crossfadeEnabledRef.current ||
        mutedRef.current ||
        audio.paused ||
        !isFinite(audio.duration) ||
        audio.duration <= 0
      ) return;

      const remaining = audio.duration - audio.currentTime;
      const xfSecs = crossfadeSecsRef.current;
      if (remaining <= 0 || remaining > xfSecs) return;

      // Determine next track (same logic as next())
      const list = queueRef.current;
      const currentId = currentTrackIdRef.current;
      if (!currentId) return;
      const idx = list.findIndex((t) => t.id === currentId);
      if (idx < 0) return;

      let nextIdx: number;
      if (shuffleRef.current) {
        if (list.length <= 1) return;
        do { nextIdx = Math.floor(Math.random() * list.length); } while (nextIdx === idx);
      } else {
        nextIdx = idx + 1;
        if (nextIdx >= list.length) {
          if (repeatRef.current === "all") nextIdx = 0;
          else return;
        }
      }
      if (nextIdx === idx) return;

      const nextTrack = list[nextIdx];
      xfActiveRef.current = true;
      stopFades();

      const durationMs = Math.max(100, remaining * 1000);
      const steps = Math.max(1, Math.round(durationMs / 50));
      const primaryStartVol = audio.volume;
      const targetVol = volumeRef.current;

      // Start next track on secondary element, silent
      xfAudio.src = nextTrack.url;
      xfAudio.volume = 0;
      ensureWA(xfAudio);
      xfAudio.play().catch(() => {});

      // Fade OUT primary
      let step1 = 0;
      xfFadeOutRef.current = setInterval(() => {
        step1++;
        audio.volume = Math.max(0, primaryStartVol * (1 - step1 / steps));
        if (step1 >= steps) {
          audio.volume = 0;
          clearInterval(xfFadeOutRef.current!); xfFadeOutRef.current = null;
        }
      }, 50);

      // Fade IN secondary — on completion, swap elements & update React state
      let step2 = 0;
      xfFadeInRef.current = setInterval(() => {
        step2++;
        xfAudio.volume = Math.min(targetVol, targetVol * (step2 / steps));
        if (step2 >= steps) {
          xfAudio.volume = targetVol;
          clearInterval(xfFadeInRef.current!); xfFadeInRef.current = null;

          // Swap: xfAudio becomes the new primary
          // The audio event useEffect uses a local `audio` var captured at run time,
          // so cleanup removes from old primary; next run adds to new primary.
          const oldPrimary = audioRef.current!;
          audioRef.current = xfAudio;
          xfAudioRef.current = oldPrimary;
          oldPrimary.pause();
          oldPrimary.volume = targetVol;

          xfActiveRef.current = false;
          countedTrackIdRef.current = null;
          setCurrentTrackId(nextTrack.id);
        }
      }, 50);
    }, 200);

    return () => {
      clearInterval(poll);
      stopFades();
    };
  }, [ensureWA]); // ensureWA is stable (useCallback [])

  // Volume / mute sync — skip while crossfade is ramping
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!xfActiveRef.current) {
      audio.volume = muted ? 0 : volume;
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
  const toggleCrossfade = useCallback(
    () => setCrossfadeEnabledState((e) => !e),
    [],
  );
  const setCrossfadeSecs = useCallback((s: number) => {
    setCrossfadeSecsState(Math.max(1, Math.min(10, s)));
  }, []);

  const toggleLike = useCallback(async (id: string) => {
    let newLiked = false;
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        newLiked = !t.liked;
        return { ...t, liked: newLiked };
      }),
    );
    await saveStoredTrack(id, { liked: newLiked });
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setLoadingFiles(true);
    try {
      const existing = new Set(tracksRef.current.map((t) => t.id));
      const newTracks: Track[] = [];
      for (const file of files) {
        if (
          !file.type.startsWith("audio/") &&
          !file.type.startsWith("video/") &&
          !/\.(mp3|flac|wav|ogg|m4a|aac|opus|mp4|m4v|mov|webm|mkv)$/i.test(
            file.name,
          )
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
          const addedAt = stored?.addedAt ?? Date.now();
          const playCount = stored?.playCount ?? 0;
          const lastPlayedAt = stored?.lastPlayedAt;
          const liked = stored?.liked ?? false;
          const track: Track = {
            id,
            file,
            url: URL.createObjectURL(file),
            title: stored?.customTitle ?? meta.title,
            artist: stored?.customArtist ?? meta.artist,
            album: stored?.customAlbum ?? meta.album,
            year: stored?.customYear ?? meta.year,
            genre: stored?.customGenre ?? meta.genre,
            duration: meta.duration ?? 0,
            embeddedCoverUrl: meta.coverUrl,
            customCoverUrl,
            addedAt,
            playCount,
            lastPlayedAt,
            liked,
          };
          newTracks.push(track);

          try {
            await saveStoredTrack(id, {
              fileBlob: file,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              addedAt,
              metaTitle: meta.title,
              metaArtist: meta.artist,
              metaAlbum: meta.album,
              metaYear: meta.year,
              metaGenre: meta.genre,
              metaDuration: meta.duration,
              embeddedCover: meta.coverBlob,
              playCount,
              lastPlayedAt,
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
              year: s.customYear ?? s.metaYear,
              genre: s.customGenre ?? s.metaGenre,
              duration: s.metaDuration ?? 0,
              embeddedCoverUrl,
              customCoverUrl,
              addedAt: s.addedAt ?? Date.now(),
              playCount: s.playCount ?? 0,
              lastPlayedAt: s.lastPlayedAt,
              liked: s.liked ?? false,
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
      info: { title?: string; artist?: string; album?: string; year?: string; genre?: string },
    ) => {
      await saveTrackMetadata(id, {
        customTitle:  info.title,
        customArtist: info.artist,
        customAlbum:  info.album,
        customYear:   info.year,
        customGenre:  info.genre,
      });
      setTracks((prev) =>
        prev.map((t) =>
          t.id !== id
            ? t
            : {
                ...t,
                title:  info.title  ?? t.title,
                artist: info.artist ?? t.artist,
                album:  info.album  ?? t.album,
                year:   info.year   ?? t.year,
                genre:  info.genre  ?? t.genre,
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
      crossfadeEnabled,
      crossfadeSecs,
      eqGains,
      eqPreset,
      setEqGain,
      applyEqPreset,
      analyserRef: waAnalyserRef,
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
      toggleCrossfade,
      setCrossfadeSecs,
      removeTrack,
      setCustomCover,
      clearCustomCover,
      updateTrackInfo,
      toggleLike,
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
      crossfadeEnabled,
      crossfadeSecs,
      eqGains,
      eqPreset,
      setEqGain,
      applyEqPreset,
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
      toggleCrossfade,
      setCrossfadeSecs,
      removeTrack,
      setCustomCover,
      clearCustomCover,
      updateTrackInfo,
      toggleLike,
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
