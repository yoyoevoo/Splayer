import { platformAPI, currentPlatform, convertFileUri } from "./platform-api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
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
import type { ActiveDownload, DownloadType, Playlist, RepeatMode, Track } from "./types";
import { trackCoverUrl } from "./types";
import { addDownloadRecord } from "./downloads-history";

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

// mix = wet fraction (0 = dry, 1 = fully wet), decay = RT60 in seconds
export const REVERB_PRESETS: Record<string, { mix: number; decay: number }> = {
  Flat:  { mix: 0,    decay: 0.5 },
  Room:  { mix: 0.25, decay: 0.8 },
  Hall:  { mix: 0.4,  decay: 2.5 },
  Cave:  { mix: 0.6,  decay: 4.0 },
};

interface PlayerContextValue {
  tracks: Track[];
  playlists: Playlist[];
  currentIndex: number | null;
  currentTrack: Track | null;
  isMono: boolean;
  toggleMono: () => void;
  currentQueueIds: string[] | null;
  currentQueueLabel: string;
  effectiveQueue: Track[];
  currentPlaylistId: string | null;
  currentPlaylistType: "library" | "regular" | "smart";
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  loadingFiles: boolean;
  isScanning: boolean;
  scanStatus: string | null;
  autoScanLibrary: (manual?: boolean) => Promise<void>;
  cancelScan: () => void;
  crossfadeEnabled: boolean;
  crossfadeSecs: number;
  // Equalizer
  eqGains: number[];
  eqPreset: string;
  setEqGain: (bandIndex: number, gain: number) => void;
  applyEqPreset: (name: string) => void;
  // Reverb
  reverbMix: number;
  reverbDecay: number;
  reverbPreset: string;
  setReverbMix: (v: number) => void;
  setReverbDecay: (v: number) => void;
  applyReverbPreset: (name: string) => void;
  // Visualizer
  analyserRef: { current: AnalyserNode | null };
  addFiles: (files: File[]) => Promise<void>;
  playIndex: (index: number) => void;
  playFromList: (
    trackIds: string[],
    index: number,
    label?: string,
    playlistId?: string | null,
    playlistType?: "library" | "regular" | "smart",
  ) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  speed: number;
  setSpeed: (v: number) => void;
  lyricsOpen: boolean;
  setLyricsOpen: (o: boolean) => void;
  toggleCrossfade: () => void;
  setCrossfadeSecs: (s: number) => void;
  removeTrack: (id: string) => void;
  deleteTrackWithFile: (id: string) => Promise<void>;
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
  reorderPlaylists: (ids: string[]) => void;
  // background downloads
  downloads: ActiveDownload[];
  startDownload: (
    videoUrl: string,
    info: { title: string; author: string; thumbnailUrl: string | null },
    type: DownloadType,
    videoFormatId?: string | null,
  ) => void;
  cancelDownload: (id: string) => void;
  miniMode: boolean;
  setMiniMode: (v: boolean) => void;
  fsVizOpen: boolean;
  setFsVizOpen: (v: boolean) => void;
  playEphemeral: (track: Track, startTime?: number) => void;
  // Jump buttons
  skipBackSecs: number;
  skipForwardSecs: number;
  setSkipBackSecs: (s: number) => void;
  setSkipForwardSecs: (s: number) => void;
  skipBack: () => void;
  skipForward: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Returns the game/title folder name if the path is inside a recognised game store, or null.
function detectGameFromPath(filePath: string): string | null {
  const p = filePath.replace(/\\/g, "/");
  const parts = p.split("/");
  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i].toLowerCase();
    if (lower === "steamapps" && parts[i + 1]?.toLowerCase() === "common" && parts[i + 2]) {
      return parts[i + 2].trim() || null;
    }
    if (lower === "gog games" && parts[i + 1]) {
      return parts[i + 1].trim() || null;
    }
    if (
      lower === "epic games" &&
      parts[i + 1] &&
      !parts[i + 1].toLowerCase().includes("launcher")
    ) {
      return parts[i + 1].trim() || null;
    }
    if (lower === "xboxgames" && parts[i + 1]) {
      return parts[i + 1].trim() || null;
    }
  }
  return null;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [ephemeralTracks, setEphemeralTracks] = useState<Track[]>([]);
  const ephemeralTracksRef = useRef<Track[]>([]);
  ephemeralTracksRef.current = ephemeralTracks;
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentQueueIds, setCurrentQueueIds] = useState<string[] | null>(null);
  const [currentQueueLabel, setCurrentQueueLabel] = useState<string>("Library");
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(null);
  const [currentPlaylistType, setCurrentPlaylistType] = useState<"library" | "regular" | "smart">("library");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState<number>(() => {
    const saved = localStorage.getItem("player-volume");
    if (saved !== null) {
      const v = parseFloat(saved);
      if (!isNaN(v)) return Math.min(1, Math.max(0, v));
    }
    return 0.85;
  });
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isScanning,   setIsScanning]   = useState(false);
  const [scanStatus,   setScanStatus]   = useState<string | null>(null);
  const scanStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [crossfadeEnabled, setCrossfadeEnabledState] = useState(true);
  const [crossfadeSecs, setCrossfadeSecsState] = useState(3);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [speed, setSpeedState] = useState<number>(() => {
    const saved = localStorage.getItem("player-speed");
    if (saved !== null) { const v = parseFloat(saved); if (!isNaN(v) && v > 0) return v; }
    return 1;
  });

  // Equalizer state (persisted in localStorage)
  const [eqGains, setEqGainsState] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("eq-gains") ?? "null") ?? EQ_PRESETS.Flat; }
    catch { return EQ_PRESETS.Flat; }
  });
  const [eqPreset, setEqPresetState] = useState<string>(
    () => localStorage.getItem("eq-preset") ?? "Flat",
  );

  // Reverb state (persisted in localStorage)
  const [reverbMix,    setReverbMixState]    = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("reverb-mix") ?? "0"); return isNaN(v) ? 0 : v;
  });
  const [reverbDecay,  setReverbDecayState]  = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("reverb-decay") ?? "0.5"); return isNaN(v) ? 0.5 : v;
  });
  const [reverbPreset, setReverbPresetState] = useState<string>(
    () => localStorage.getItem("reverb-preset") ?? "Flat",
  );
  const reverbMixRef   = useRef(reverbMix);
  reverbMixRef.current = reverbMix;
  const reverbDecayRef = useRef(reverbDecay);
  reverbDecayRef.current = reverbDecay;

  // Mono mode (persisted)
  const [isMono, setIsMono] = useState<boolean>(() => {
    try { return localStorage.getItem("mono-enabled") === "true"; } catch { return false; }
  });
  const isMonoRef = useRef(isMono);
  isMonoRef.current = isMono;

  // Web Audio pipeline refs (lazy-init on first play)
  const waCtxRef = useRef<AudioContext | null>(null);
  const waAnalyserRef = useRef<AnalyserNode | null>(null);
  const waFiltersRef = useRef<BiquadFilterNode[]>([]);
  const waMonoNodeRef = useRef<GainNode | null>(null);
  const waDryGainRef  = useRef<GainNode | null>(null);
  const waWetGainRef  = useRef<GainNode | null>(null);
  const waConvolverRef = useRef<ConvolverNode | null>(null);
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
  const currentPlaylistIdRef = useRef<string | null>(null);
  currentPlaylistIdRef.current = currentPlaylistId;
  const currentPlaylistTypeRef = useRef<"library" | "regular" | "smart">("library");
  currentPlaylistTypeRef.current = currentPlaylistType;
  const currentQueueLabelRef = useRef<string>("Library");
  currentQueueLabelRef.current = currentQueueLabel;
  const countedTrackIdRef = useRef<string | null>(null);

  // Crossfade refs
  const crossfadeEnabledRef = useRef(true);
  const crossfadeSecsRef = useRef(3);
  const volumeRef = useRef(0.85);
  const mutedRef = useRef(false);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("off");

  const speedRef = useRef(speed);

  crossfadeEnabledRef.current = crossfadeEnabled;
  crossfadeSecsRef.current = crossfadeSecs;
  speedRef.current = speed;
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
  const ensureWA = useCallback((el: HTMLAudioElement): Promise<void> => {
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

      // Chain EQ filters
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }

      // Reverb wet/dry split after the last EQ filter
      // lastFilter → dryGain → analyser  (dry path)
      // lastFilter → convolver → wetGain → analyser  (wet path)
      const dryGain = ctx.createGain();
      dryGain.gain.value = 1 - reverbMixRef.current;
      waDryGainRef.current = dryGain;

      const convolver = ctx.createConvolver();
      waConvolverRef.current = convolver;

      const wetGain = ctx.createGain();
      wetGain.gain.value = reverbMixRef.current;
      waWetGainRef.current = wetGain;

      const lastFilter = filters[filters.length - 1];
      lastFilter.connect(dryGain);
      lastFilter.connect(convolver);
      convolver.connect(wetGain);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      waAnalyserRef.current = analyser;
      dryGain.connect(analyser);
      wetGain.connect(analyser);

      // Pre-load impulse response if reverb is already active
      if (reverbMixRef.current > 0) {
        convolver.buffer = _makeImpulse(ctx, reverbDecayRef.current);
      }

      if (isMonoRef.current) {
        const mono = ctx.createGain();
        mono.channelCount = 1;
        mono.channelCountMode = "explicit";
        mono.channelInterpretation = "speakers";
        mono.gain.value = 1;
        waMonoNodeRef.current = mono;
        analyser.connect(mono);
        mono.connect(ctx.destination);
      } else {
        analyser.connect(ctx.destination);
      }
    }

    // Connect this audio element once
    if (!waConnectedRef.current.has(el)) {
      const src = waCtxRef.current.createMediaElementSource(el);
      src.connect(waFiltersRef.current[0] ?? waCtxRef.current.destination);
      waConnectedRef.current.add(el);
    }

    // Resume if browser suspended the context; return the promise so callers can
    // await it before calling audio.play() — avoids the race on Android WebView.
    if (waCtxRef.current.state === "suspended") {
      return waCtxRef.current.resume().catch(() => {});
    }
    return Promise.resolve();
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

  // ----- Reverb -----

  function _makeImpulse(ctx: AudioContext, decay: number): AudioBuffer {
    const sr  = ctx.sampleRate;
    const len = Math.max(1, Math.round(sr * Math.max(0.1, decay)));
    const D   = 6.91 / decay; // achieve –60 dB at t=decay
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-D * i / sr);
      }
    }
    return buf;
  }

  const setReverbMix = useCallback((mix: number) => {
    const v = Math.max(0, Math.min(1, mix));
    setReverbMixState(v);
    localStorage.setItem("reverb-mix", String(v));
    const ctx = waCtxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    waDryGainRef.current?.gain.setTargetAtTime(1 - v, t, 0.02);
    waWetGainRef.current?.gain.setTargetAtTime(v, t, 0.02);
    if (v > 0 && !waConvolverRef.current?.buffer) {
      const conv = waConvolverRef.current;
      if (conv) conv.buffer = _makeImpulse(ctx, reverbDecayRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setReverbDecay = useCallback((decay: number) => {
    const v = Math.max(0.1, Math.min(8, decay));
    setReverbDecayState(v);
    localStorage.setItem("reverb-decay", String(v));
    const ctx  = waCtxRef.current;
    const conv = waConvolverRef.current;
    if (ctx && conv && reverbMixRef.current > 0) {
      conv.buffer = _makeImpulse(ctx, v);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyReverbPreset = useCallback((name: string) => {
    const preset = REVERB_PRESETS[name] ?? REVERB_PRESETS.Flat;
    setReverbPresetState(name);
    localStorage.setItem("reverb-preset", name);
    setReverbMixState(preset.mix);
    setReverbDecayState(preset.decay);
    localStorage.setItem("reverb-mix",   String(preset.mix));
    localStorage.setItem("reverb-decay", String(preset.decay));
    const ctx  = waCtxRef.current;
    const conv = waConvolverRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    waDryGainRef.current?.gain.setTargetAtTime(1 - preset.mix, t, 0.02);
    waWetGainRef.current?.gain.setTargetAtTime(preset.mix,     t, 0.02);
    if (conv) {
      conv.buffer = preset.mix > 0 ? _makeImpulse(ctx, preset.decay) : null;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMono = useCallback(() => {
    const next = !isMonoRef.current;
    setIsMono(next);
    isMonoRef.current = next;
    try { localStorage.setItem("mono-enabled", String(next)); } catch {}

    const ctx      = waCtxRef.current;
    const analyser = waAnalyserRef.current;
    if (!ctx || !analyser) return; // WA not yet initialised — isMonoRef will be read by ensureWA

    if (next) {
      // Stereo → Mono: insert a 1-channel gain node that downmixes L+R
      const mono = ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = "explicit";
      mono.channelInterpretation = "speakers";
      mono.gain.value = 1;
      waMonoNodeRef.current = mono;
      try { analyser.disconnect(ctx.destination); } catch {}
      analyser.connect(mono);
      mono.connect(ctx.destination);
    } else {
      // Mono → Stereo: remove the mono node and reconnect directly
      const mono = waMonoNodeRef.current;
      if (mono) {
        try { analyser.disconnect(mono); } catch {}
        try { mono.disconnect(ctx.destination); } catch {}
        waMonoNodeRef.current = null;
      }
      analyser.connect(ctx.destination);
    }
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
      : (tracks.find((t) => t.id === currentTrackId) ?? ephemeralTracks.find((t) => t.id === currentTrackId) ?? null);

  const queueRef = useRef<Track[]>([]);
  queueRef.current = effectiveQueue;

  const playTrackById = useCallback((trackId: string) => {
    const audio = audioRef.current;
    const track = tracksRef.current.find((t) => t.id === trackId)
      ?? ephemeralTracksRef.current.find((t) => t.id === trackId);
    if (!audio || !track) return;
    // Cancel any active crossfade
    cancelXf();
    const isNewSrc = audio.src !== track.url;
    if (isNewSrc) {
      audio.src = track.url;
      countedTrackIdRef.current = null;
    }
    setCurrentTrackId(trackId);
    // Initialise Web Audio pipeline (requires user gesture, so call here).
    // Await resume so AudioContext is running before we call play() — on Android
    // WebView the context starts suspended and play() would silently produce no
    // audio if the context hasn't resumed yet.
    const effVol = mutedRef.current ? 0 : volumeRef.current;
    ensureWA(audio).then(() => {
      if (isNewSrc && crossfadeEnabledRef.current && !mutedRef.current) {
        audio.volume = 0;
        audio.play().catch(() => {});
        rampVolume(audio, 0, effVol, crossfadeSecsRef.current * 1000);
      } else {
        audio.volume = effVol;
        audio.play().catch(() => {});
      }
    });
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
    (
      trackIds: string[],
      index: number,
      label?: string,
      playlistId?: string | null,
      playlistType?: "library" | "regular" | "smart",
    ) => {
      if (trackIds.length === 0 || index < 0 || index >= trackIds.length) return;
      setCurrentQueueIds(trackIds);
      if (label !== undefined) setCurrentQueueLabel(label);
      setCurrentPlaylistId(playlistId ?? null);
      setCurrentPlaylistType(playlistType ?? (playlistId ? "regular" : "library"));
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
      ensureWA(audio).then(() => audio.play().catch(() => {}));
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

  // Stable refs so the onTrayAction handler never captures stale closures.
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const nextRef = useRef(next);
  nextRef.current = next;
  const prevRef = useRef(prev);
  prevRef.current = prev;

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
    // Ephemeral track (podcast episode) — not in the library queue.
    // Just stop; don't auto-advance to the first library track.
    if (idx < 0) {
      setIsPlaying(false);
      return;
    }
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
      // Append timestamped play event for dashboard Top Recents filter
      try {
        const LOG_KEY = "play-history";
        const cutoff = Date.now() - 18 * 86_400_000;
        const raw = localStorage.getItem(LOG_KEY);
        const log: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
        log.push({ id, ts: now });
        localStorage.setItem(LOG_KEY, JSON.stringify(log.filter((e) => e.ts >= cutoff)));
      } catch {}
    };
    // Ignore pause events fired on the old primary during a crossfade swap —
    // oldPrimary.pause() triggers this handler while xfActiveRef is still true,
    // which would incorrectly set isPlaying=false even though the new primary is playing.
    const onPause = () => { if (!xfActiveRef.current) setIsPlaying(false); };
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

      // Don't crossfade when repeating one track — let handleEnded loop it.
      if (repeatRef.current === "one") return;

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
          // Release the old decoder immediately so it doesn't compete for
          // GPU/memory with the next track's video element. The element itself
          // is kept alive for reuse as the secondary on the next crossfade —
          // a new src will be assigned then, just like cancelXf does.
          oldPrimary.removeAttribute("src");
          oldPrimary.load();
          oldPrimary.volume = targetVol;

          xfActiveRef.current = false;
          countedTrackIdRef.current = null;

          // Re-check repeat mode here — the user may have changed it while
          // the crossfade was in flight, and the crossfade trigger point
          // (line ~636) is too early to catch mid-fade changes.
          const repeatAtCompletion = repeatRef.current;

          if (repeatAtCompletion === "one") {
            // Repeat-one became (or stayed) active during this crossfade.
            // Restart the track that was fading out rather than advancing to
            // the track that was fading in.
            const currentId = currentTrackIdRef.current;
            const originalTrack = queueRef.current.find((t) => t.id === currentId);
            if (originalTrack) {
              xfAudio.src = originalTrack.url;
            }
            xfAudio.currentTime = 0;
            xfAudio.play().catch(() => {});
            setIsPlaying(true);
            setCurrentTime(0);
            setDuration(0); // updated by loadedmetadata on xfAudio
            // currentTrackId stays unchanged — we're looping the same track
          } else {
            // Push correct state immediately — the event-listener effect won't
            // re-attach to the new primary until after React re-renders, so
            // timeupdate / loadedmetadata on the new primary won't update state
            // until then. Set the values now so the UI is never stale.
            setIsPlaying(true);
            setCurrentTime(xfAudio.currentTime);
            setDuration(isFinite(xfAudio.duration) ? xfAudio.duration : 0);
            setCurrentTrackId(nextTrack.id);
          }
        }
      }, 50);
    }, 200);

    return () => {
      clearInterval(poll);
      stopFades();
    };
  }, [ensureWA]); // ensureWA is stable (useCallback [])

  // Playback speed sync — apply to both audio elements
  useEffect(() => {
    if (audioRef.current)   audioRef.current.playbackRate   = speed;
    if (xfAudioRef.current) xfAudioRef.current.playbackRate = speed;
  }, [speed]);

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

  // ── Save last session (track + position + playlist context) to localStorage ──
  useEffect(() => {
    const save = () => {
      const id = currentTrackIdRef.current;
      const audio = audioRef.current;
      if (!id || !audio) return;
      try {
        localStorage.setItem(
          "last-session",
          JSON.stringify({
            trackId: id,
            position: Math.floor(audio.currentTime),
            playlistId: currentPlaylistIdRef.current,
            playlistType: currentPlaylistTypeRef.current,
            playlistLabel: currentQueueLabelRef.current,
          }),
        );
      } catch {}
    };
    // visibilitychange fires on Android when the app goes to background
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(save, 10_000);
    return () => {
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeTime = (typeof time === "number" && isFinite(time) && time >= 0) ? time : 0;
    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, []);

  const setSpeed = useCallback((v: number) => {
    setSpeedState(v);
    localStorage.setItem("player-speed", String(v));
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      localStorage.setItem("player-volume", String(v));
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
    setCrossfadeSecsState(Math.max(0, Math.min(10, s)));
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
          const isVideo = file.name.toLowerCase().endsWith(".mp4");
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
            hasVideo: isVideo,
          };
          newTracks.push(track);

          try {
            const pickerPath = (file as any).path as string | undefined;

            // Copy picker/drag files into ~/Music/Splayer/Downloads/ so we always
            // have a permanent disk path — don't copy if already inside Splayer folder.
            let persistedFilePath = pickerPath;
            if (pickerPath && platformAPI?.getAppPaths && platformAPI?.copyFile) {
              try {
                const dirs = await platformAPI.getAppPaths();
                const splayerRoot = dirs?.root ?? "";
                if (splayerRoot && !pickerPath.startsWith(splayerRoot)) {
                  const dst = `${dirs.downloads}/${file.name}`;
                  const result = await platformAPI.copyFile(pickerPath, dst);
                  if (result.success) {
                    persistedFilePath = dst;
                    console.log("[addFiles] copied to Splayer:", dst);
                  }
                }
              } catch (copyErr) {
                console.warn("[addFiles] copy failed, using original path", copyErr);
              }
            }

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
              ...(isVideo ? { hasVideo: true } : {}),
              ...(persistedFilePath ? { filePath: persistedFilePath } : {}),
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
            if (!s.fileBlob && !s.filePath) continue;
            let file: File;
            let url: string;
            if (s.fileBlob) {
              file = new File(
                [s.fileBlob],
                s.fileName ?? "track",
                { type: s.fileType || s.fileBlob.type || "audio/mpeg" },
              );
              url = URL.createObjectURL(file);
            } else {
              // Android track: content URI stored, no blob
              const mimeType = s.fileType ?? "audio/mpeg";
              file = new File([], s.fileName ?? "track", { type: mimeType });
              url = convertFileUri(s.filePath!);
            }
            const embeddedCoverUrl = s.embeddedCover
              ? URL.createObjectURL(s.embeddedCover)
              : undefined;
            const customCoverUrl = s.customCover
              ? URL.createObjectURL(s.customCover)
              : undefined;
            restored.push({
              id: s.id,
              file,
              url,
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
              // Fall back to filename check for tracks stored before hasVideo was introduced
              hasVideo: s.hasVideo ?? file.name.toLowerCase().endsWith(".mp4"),
              videoPath: s.videoPath,
              path: s.filePath,
            });
          }
          if (restored.length > 0) {
            setTracks((prev) => {
              const have = new Set(prev.map((t) => t.id));
              return [...prev, ...restored.filter((t) => !have.has(t.id))];
            });

            // Restore last session — load track paused at saved position + playlist context
            try {
              const raw = localStorage.getItem("last-session");
              if (raw) {
                const { trackId, position, playlistId, playlistType, playlistLabel } = JSON.parse(raw) as {
                  trackId: string;
                  position: number;
                  playlistId?: string | null;
                  playlistType?: "library" | "regular" | "smart";
                  playlistLabel?: string;
                };
                const track = restored.find((t) => t.id === trackId);
                if (track && audioRef.current) {
                  const audio = audioRef.current;
                  audio.src = track.url;
                  setCurrentTrackId(trackId);
                  setCurrentTime(position);
                  audio.addEventListener(
                    "loadedmetadata",
                    () => {
                      audio.currentTime = Math.min(
                        position,
                        isFinite(audio.duration) ? audio.duration : position,
                      );
                    },
                    { once: true },
                  );
                }
                // Restore playlist context: for regular playlists, rebuild the queue
                if (playlistType === "regular" && playlistId) {
                  const pl = storedPlaylists.find((p) => p.id === playlistId);
                  if (pl) {
                    setCurrentQueueIds(pl.trackIds);
                    setCurrentQueueLabel(playlistLabel ?? pl.name);
                    setCurrentPlaylistId(playlistId);
                    setCurrentPlaylistType("regular");
                  }
                } else if (playlistLabel && playlistLabel !== "Library") {
                  // Smart or other named context — restore label and type but queue defaults to library
                  setCurrentQueueLabel(playlistLabel);
                  if (playlistType) setCurrentPlaylistType(playlistType);
                }
              }
            } catch {}
          }
        }

        if (storedPlaylists.length > 0) {
          storedPlaylists.sort((a, b) => a.createdAt - b.createdAt);
          let restoredPls: Playlist[] = storedPlaylists.map((p) => ({
            id: p.id,
            name: p.name,
            trackIds: p.trackIds,
            customCoverUrl: p.customCover
              ? URL.createObjectURL(p.customCover)
              : undefined,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }));
          try {
            const savedOrder: string[] = JSON.parse(localStorage.getItem("playlist-list-order") ?? "[]");
            if (savedOrder.length > 0) {
              const map = new Map(restoredPls.map((p) => [p.id, p]));
              const ordered = savedOrder.map((id) => map.get(id)).filter(Boolean) as typeof restoredPls;
              const rest = restoredPls.filter((p) => !savedOrder.includes(p.id));
              restoredPls = [...ordered, ...rest];
            }
          } catch {}
          setPlaylists(restoredPls);
        }
      } catch (e) {
        console.warn("Failed to restore saved data", e);
      } finally {
        // Start the background disk scan AFTER IDB tracks are in state so the
        // library is visible immediately on open. Safe to call autoScanLibrary
        // here even though it's declared later in the file — useEffect callbacks
        // only execute after the full render, so the variable is in scope.
        if (!cancelled) autoScanLibrary(false); // eslint-disable-line react-hooks/exhaustive-deps
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // If there are other tracks in the queue, advance to the next one.
      // We call next() *before* the setTracks update is committed, so the
      // deleted track is still in queueRef and idx lookup succeeds correctly.
      const queue = queueRef.current;
      if (queue.length > 1) {
        next();
      } else {
        // Last track — just stop playback
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        setCurrentTrackId(null);
      }
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
  }, [next]);

  const deleteTrackWithFile = useCallback(async (id: string) => {
    // Resolve file paths synchronously from the ref before touching state.
    const track = tracksRef.current.find((t) => t.id === id);
    if (track && platformAPI?.deleteFile) {
      // 1. Delete the primary audio file.
      // Try three sources for the real disk path, in order of reliability:
      //   a) File.path  — set by Electron for picker-added files
      //   b) track.path — set for Android content:// URIs
      //   c) IDB stored filePath — set for scanned + downloaded files
      let filePath: string | undefined =
        (track.file as any)?.path as string | undefined
        ?? track.path;

      if (!filePath) {
        try {
          const stored = await getTrackMetadata(id);
          filePath = stored?.filePath ?? undefined;
        } catch { /* non-fatal */ }
      }

      if (filePath) {
        platformAPI.deleteFile(filePath).catch((e: unknown) =>
          console.warn("[deleteTrackWithFile] failed to delete:", filePath, e),
        );
      } else {
        console.warn("[deleteTrackWithFile] no disk path found for track", id, track.file?.name);
      }

      // 2. Delete the companion MP4 saved alongside a YouTube merged download.
      if (track.videoPath) {
        platformAPI.deleteFile!(track.videoPath).catch((e: unknown) =>
          console.warn("[deleteTrackWithFile] failed to delete videoPath:", track.videoPath, e),
        );
      }
    }
    removeTrack(id);
  }, [removeTrack]);

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

  // ----- Android notification button handler -----
  // Registered once at mount; uses refs so it never needs re-registering.
  useEffect(() => {
    if (currentPlatform !== "android" || !platformAPI?.onTrayAction) return;
    const cleanup = platformAPI.onTrayAction((action: unknown) => {
      const a = action as string;
      console.log("[TrayAction] handler called, action=" + a);
      if (a === "play" || a === "pause") togglePlayRef.current();
      else if (a === "next") nextRef.current();
      else if (a === "previous" || a === "prev") prevRef.current();
    });
    console.log("[TrayAction] handler registered");
    return cleanup as () => void;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Android MediaSession sync -----

  // Cached artwork base64 so we only re-fetch when the track changes.
  const mediaArtRef   = useRef<string>("");
  const mediaArtTrack = useRef<string>("");

  // Update the Android MediaSession notification whenever track or isPlaying changes.
  useEffect(() => {
    console.log("[MediaSession] effect fired: platform=" + currentPlatform
      + " trackId=" + currentTrack?.id + " isPlaying=" + isPlaying);
    if (currentPlatform !== "android" || !platformAPI) {
      console.log("[MediaSession] skip — not android or no platformAPI");
      return;
    }
    const api = platformAPI as unknown as {
      updateMediaSession?: (o: Record<string, unknown>) => Promise<void>;
    };
    if (!api.updateMediaSession) {
      console.log("[MediaSession] skip — updateMediaSession method not found");
      return;
    }

    const t = currentTrack;

    // Build the base payload.  fileUri (the content:// URI) is passed on every
    // call so the Java side can load embedded album art via MediaMetadataRetriever
    // without any JS fetch/base64 round-trip.
    const basePayload = () => ({
      title:      t?.title  ?? "",
      artist:     t?.artist ?? "",
      album:      t?.album  ?? "",
      fileUri:    (t as { path?: string } | null)?.path ?? "",
      isPlaying,
      positionMs: Math.round(currentTime * 1000),
      durationMs: Math.round((duration || t?.duration || 0) * 1000),
    });

    if (!t) {
      api.updateMediaSession!(basePayload());
      return;
    }

    const trackId = t.id;

    if (mediaArtTrack.current === trackId) {
      // Same track — just update playback state.
      // Only include artBase64 if we have a cached custom cover.
      const payload: Record<string, unknown> = basePayload();
      if (mediaArtRef.current) payload.artBase64 = mediaArtRef.current;
      api.updateMediaSession!(payload);
      return;
    }

    // Track changed — reset cache and push state (notification side loads art via fileUri).
    mediaArtTrack.current = trackId;
    mediaArtRef.current   = "";
    api.updateMediaSession!(basePayload());

    const trackPath = (t as { path?: string }).path;
    const getTrackArt = (platformAPI as unknown as { getTrackArt?: (uri: string) => Promise<string> }).getTrackArt;

    if (trackPath && getTrackArt) {
      // Fetch embedded art natively (same source as the notification uses).
      // On success, update the in-app player by setting embeddedCoverUrl and
      // also forward the base64 to the notification service.
      getTrackArt(trackPath)
        .then((dataUrl) => {
          if (mediaArtTrack.current !== trackId) return;
          if (!dataUrl) return;
          const b64 = dataUrl.split(",")[1] ?? "";
          mediaArtRef.current = b64;
          // Update in-app player — sets embeddedCoverUrl so AlbumCover shows the art.
          setTracks((prev) => prev.map((tr) =>
            tr.id === trackId ? { ...tr, embeddedCoverUrl: dataUrl } : tr,
          ));
          // Also push the art to the notification (belt-and-suspenders alongside fileUri).
          api.updateMediaSession!({ ...basePayload(), artBase64: b64 });
        })
        .catch(() => {});
    } else if (t.customCoverUrl) {
      // No content URI (e.g. YouTube download) — fall back to fetching the custom cover.
      fetch(t.customCoverUrl)
        .then((r) => r.blob())
        .then((blob) => new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string).split(",")[1] ?? "");
          reader.onerror = () => res("");
          reader.readAsDataURL(blob);
        }))
        .then((b64) => {
          if (mediaArtTrack.current === trackId && b64) {
            mediaArtRef.current = b64;
            api.updateMediaSession!({ ...basePayload(), artBase64: b64 });
          }
        })
        .catch(() => {});
    }
  }, [currentTrack?.id, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- background download queue -----

  const [downloads, setDownloads] = useState<ActiveDownload[]>([]);
  const [miniMode,  setMiniMode]  = useState(true);
  const [fsVizOpen, setFsVizOpen] = useState(false);

  // ----- Jump buttons -----
  const [skipBackSecs,    setSkipBackSecsState]    = useState<number>(() => parseInt(localStorage.getItem("skip-back-secs")    ?? "10") || 10);
  const [skipForwardSecs, setSkipForwardSecsState] = useState<number>(() => parseInt(localStorage.getItem("skip-forward-secs") ?? "30") || 30);

  const setSkipBackSecs = useCallback((s: number) => {
    setSkipBackSecsState(s);
    localStorage.setItem("skip-back-secs", String(s));
  }, []);

  const setSkipForwardSecs = useCallback((s: number) => {
    setSkipForwardSecsState(s);
    localStorage.setItem("skip-forward-secs", String(s));
  }, []);

  const skipBack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - (skipBackSecsRef.current ?? 10));
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (skipForwardSecsRef.current ?? 30));
  }, []);

  const skipBackSecsRef    = useRef(skipBackSecs);
  skipBackSecsRef.current  = skipBackSecs;
  const skipForwardSecsRef = useRef(skipForwardSecs);
  skipForwardSecsRef.current = skipForwardSecs;

  // ----- Auto pause/resume on audio device change -----
  // Tracks whether we auto-paused so we can auto-resume when a device reconnects.
  const autoPausedRef = useRef(false);
  const isPlayingRef  = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;

    // Snapshot the active output device ids before a change fires.
    let prevDeviceIds = new Set<string>();

    async function refreshDeviceIds() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        prevDeviceIds = new Set(
          devices.filter((d) => d.kind === "audiooutput").map((d) => d.deviceId),
        );
      } catch { /* permissions not granted — skip */ }
    }

    // Prime the snapshot so the first event has something to diff against.
    refreshDeviceIds();

    const onDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const nextIds = new Set(
          devices.filter((d) => d.kind === "audiooutput").map((d) => d.deviceId),
        );

        const lost   = [...prevDeviceIds].some((id) => !nextIds.has(id));
        const gained = [...nextIds].some((id) => !prevDeviceIds.has(id));
        prevDeviceIds = nextIds;

        if (lost && isPlayingRef.current) {
          // A device disappeared while playing — pause.
          autoPausedRef.current = true;
          const audio = audioRef.current;
          if (audio) audio.pause();
          setIsPlaying(false);
          toast({ title: "Headphones disconnected — paused" });
        } else if (gained && autoPausedRef.current) {
          // A device appeared and we had auto-paused — resume.
          autoPausedRef.current = false;
          const audio = audioRef.current;
          if (audio) audio.play().catch(() => {});
          setIsPlaying(true);
          toast({ title: "Headphones reconnected — resumed" });
        }
      } catch { /* enumerateDevices failed — ignore */ }
    };

    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const playEphemeral = useCallback((track: Track, startTime = 0) => {
    setEphemeralTracks((prev) =>
      prev.find((t) => t.id === track.id) ? prev : [...prev, track],
    );
    const audio = audioRef.current;
    if (!audio) return;
    cancelXf();
    audio.src = track.url;
    audio.load();
    countedTrackIdRef.current = null;
    setCurrentTrackId(track.id);
    setCurrentQueueIds(null);
    setCurrentQueueLabel("Podcast");
    ensureWA(audio);
    audio.volume = mutedRef.current ? 0 : volumeRef.current;
    const safeStart = (typeof startTime === "number" && isFinite(startTime) && startTime > 0) ? startTime : 0;
    audio.addEventListener("canplay", () => {
      if (safeStart > 0) audio.currentTime = safeStart;
      audio.play().catch(() => {});
    }, { once: true });
  }, [cancelXf, ensureWA]);
  const downloadsRef = useRef<ActiveDownload[]>([]);
  downloadsRef.current = downloads;
  const dlProcessingRef = useRef(false);
  const runDownloadRef = useRef<() => void>(() => {});
  const toastedDlErrors = useRef<Set<string>>(new Set());

  useEffect(() => {
    downloads.forEach((dl) => {
      if (dl.status === "error" && !toastedDlErrors.current.has(dl.id)) {
        toastedDlErrors.current.add(dl.id);
        toast({
          title: `Failed to download: ${dl.errorMsg || "Unknown error"}`,
          variant: "destructive",
        });
      }
    });
  }, [downloads, toast]);

  const sanitizeDlFilename = (name: string) =>
    name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200);

  const runDownload = useCallback(async () => {
    if (dlProcessingRef.current) return;
    const dl = downloadsRef.current.find((d) => d.status === "pending");
    if (!dl) return;

    dlProcessingRef.current = true;
    const { id } = dl;
    const api = platformAPI;

    if (!api?.ytDownload) {
      setDownloads((prev) => prev.map((d) => d.id === id
        ? { ...d, status: "error" as const, errorMsg: "Platform API not available" }
        : d,
      ));
      dlProcessingRef.current = false;
      runDownloadRef.current();
      return;
    }

    setDownloads((prev) => prev.map((d) => d.id === id ? { ...d, status: "downloading" as const } : d));

    const baseName = sanitizeDlFilename(dl.title);
    const downloadsDir = localStorage.getItem("settings-downloads-path") ?? "";
    const videosDir = localStorage.getItem("settings-videos-path") ?? "";

    try {
      if (dl.type === "merged") {
        if (!api.ytDownloadMerged) throw new Error("Merged download not available");

        const cleanupA = api.onYtProgress(({ percent }) =>
          setDownloads((prev) => prev.map((d) => d.id === id ? { ...d, progressAudio: percent } : d)),
        );
        const cleanupV = api.onYtProgressVideo?.(({ percent }) =>
          setDownloads((prev) => prev.map((d) => d.id === id ? { ...d, progressVideo: percent } : d)),
        ) ?? (() => {});
        const cleanupM = api.onYtProgressMerge?.(({ percent }) =>
          setDownloads((prev) => prev.map((d) => d.id === id ? { ...d, progressMerge: percent } : d)),
        ) ?? (() => {});

        const result = await api.ytDownloadMerged({ url: dl.videoUrl, videoFormatId: dl.videoFormatId ?? null });
        cleanupA(); cleanupV(); cleanupM();

        if ("error" in result) {
          setDownloads((prev) => prev.map((d) => d.id === id
            ? { ...d, status: "error" as const, errorMsg: result.error }
            : d,
          ));
        } else {
          const mergedFilename = `${baseName}.mp4`;
          const res = result as any;

          if (res.filePath && !(res.bytes?.byteLength > 0)) {
            // Android fast path: Java already streamed the file to disk.
            // Skip loading any bytes into memory to avoid OOM.
            const nativePath: string = res.filePath;
            const fileSize: number   = res.fileSize ?? 0;
            const fakeFile = new File([], mergedFilename, { type: "video/mp4" });
            await addFiles([fakeFile]);
            const trackId = `${fakeFile.name}-${fakeFile.size}`;
            const webUrl  = convertFileUri(nativePath);
            // Clear the zero-byte blob from IDB; store filePath so the loading
            // logic uses convertFileUri(filePath) for audio on app restart.
            await saveStoredTrack(trackId, {
              videoPath: nativePath,
              filePath:  nativePath,
              fileBlob:  undefined,
              fileSize,
            });
            // Patch in-memory URL so audio plays immediately in the current session.
            setTracks((prev) =>
              prev.map((t) => t.id === trackId ? { ...t, url: webUrl } : t),
            );
            await updateTrackInfo(trackId, { title: result.title, artist: result.author });
            addDownloadRecord({
              id: `merged-${Date.now()}`,
              trackId,
              title: result.title,
              artist: result.author,
              ext: "mp4",
              fileSize,
              filePath: nativePath,
              downloadedAt: Date.now(),
              type: "video",
            });
          } else {
            const mergedBytes = new Uint8Array(result.bytes);
            const blob = new Blob([mergedBytes], { type: "video/mp4" });
            const file = new File([blob], mergedFilename, { type: "video/mp4" });
            const saveDir = downloadsDir || videosDir;
            if (saveDir && api.writeFile) await api.writeFile(`${saveDir}/${mergedFilename}`, mergedBytes);
            await addFiles([file]);
            const trackId = `${file.name}-${file.size}`;
            if (saveDir) await saveStoredTrack(trackId, { videoPath: `${saveDir}/${mergedFilename}` });
            await updateTrackInfo(trackId, { title: result.title, artist: result.author });
            addDownloadRecord({
              id: `merged-${Date.now()}`,
              trackId,
              title: result.title,
              artist: result.author,
              ext: "mp4",
              fileSize: mergedBytes.byteLength,
              filePath: saveDir ? `${saveDir}/${mergedFilename}` : null,
              downloadedAt: Date.now(),
              type: "video",
            });
          }

          setDownloads((prev) => prev.map((d) => d.id === id
            ? { ...d, status: "done" as const, progressAudio: 100, progressVideo: 100, progressMerge: 100 }
            : d,
          ));
          setTimeout(() => setDownloads((prev) => prev.filter((d) => d.id !== id)), 4000);
        }
      } else {
        const cleanupA = api.onYtProgress(({ percent }) =>
          setDownloads((prev) => prev.map((d) => d.id === id ? { ...d, progressAudio: percent } : d)),
        );

        const result = await api.ytDownload(dl.videoUrl);
        cleanupA();

        if ("error" in result) {
          setDownloads((prev) => prev.map((d) => d.id === id
            ? { ...d, status: "error" as const, errorMsg: result.error }
            : d,
          ));
        } else {
          const audioFilename = `${baseName}.${result.ext}`;
          const res = result as any;
          let file: File;
          let fileSizeBytes: number;

          if (res.filePath && !(res.bytes?.byteLength > 0)) {
            // Android fast path: file already on disk.
            // Register a 0-byte placeholder so addFiles creates the library entry,
            // then immediately overwrite IDB (fileBlob → undefined, filePath → native
            // path) so the loading logic uses convertFileUri(filePath) on restart.
            const nativePath = res.filePath as string;
            const webUrl     = convertFileUri(nativePath);
            file = new File([], audioFilename, { type: result.mimeType });
            fileSizeBytes = (res.fileSize as number) ?? 0;

            await addFiles([file]);
            const trackId = `${file.name}-${file.size}`;

            // Clear the blob from IDB so restart always uses filePath → convertFileUri.
            await saveStoredTrack(trackId, {
              filePath:  nativePath,
              fileBlob:  undefined,
              fileSize:  fileSizeBytes,
            });
            // Patch the in-memory URL immediately so the track plays right now.
            setTracks((prev) =>
              prev.map((t) => t.id === trackId ? { ...t, url: webUrl } : t),
            );

            await updateTrackInfo(trackId, { title: result.title, artist: result.author });
          } else {
            const audioBytes = new Uint8Array(result.bytes);
            const blob = new Blob([audioBytes], { type: result.mimeType });
            file = new File([blob], audioFilename, { type: result.mimeType });
            if (downloadsDir && api.writeFile) await api.writeFile(`${downloadsDir}/${audioFilename}`, audioBytes);
            fileSizeBytes = audioBytes.byteLength;

            await addFiles([file]);
            const trackId = `${file.name}-${file.size}`;
            await updateTrackInfo(trackId, { title: result.title, artist: result.author });
          }
          const audioTrackId = `${file.name}-${file.size}`;
          addDownloadRecord({
            id: `audio-${Date.now()}`,
            trackId: audioTrackId,
            title: result.title,
            artist: result.author,
            ext: result.ext,
            fileSize: fileSizeBytes,
            filePath: res.filePath ?? (downloadsDir ? `${downloadsDir}/${audioFilename}` : null),
            downloadedAt: Date.now(),
            type: "audio",
          });
          setDownloads((prev) => prev.map((d) => d.id === id
            ? { ...d, status: "done" as const, progressAudio: 100 }
            : d,
          ));
          setTimeout(() => setDownloads((prev) => prev.filter((d) => d.id !== id)), 4000);
        }
      }
    } catch (e) {
      setDownloads((prev) => prev.map((d) => d.id === id
        ? { ...d, status: "error" as const, errorMsg: String((e as Error)?.message ?? e) }
        : d,
      ));
    } finally {
      dlProcessingRef.current = false;
      runDownloadRef.current();
    }
  }, [addFiles, updateTrackInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  runDownloadRef.current = runDownload;

  const startDownload = useCallback((
    videoUrl: string,
    info: { title: string; author: string; thumbnailUrl: string | null },
    type: DownloadType,
    videoFormatId?: string | null,
  ) => {
    const dl: ActiveDownload = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      videoUrl,
      title: info.title,
      author: info.author,
      thumbnailUrl: info.thumbnailUrl,
      type,
      videoFormatId,
      progressAudio: 0,
      progressVideo: 0,
      progressMerge: 0,
      status: "pending",
    };
    setDownloads((prev) => [...prev, dl]);
    setTimeout(() => runDownloadRef.current(), 0);
  }, []);

  const cancelDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

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

  const reorderPlaylists = useCallback((ids: string[]) => {
    setPlaylists((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as typeof prev;
      const rest = prev.filter((p) => !ids.includes(p.id));
      const next = [...ordered, ...rest];
      try { localStorage.setItem("playlist-list-order", JSON.stringify(ids)); } catch {}
      return next;
    });
  }, []);

  // ── Auto-scan library ────────────────────────────────────────────────────────
  const autoScanLibrary = useCallback(async (manual = false) => {
    if (!platformAPI?.scanLibrary) return;
    // On non-Android platforms we also need readFile for byte reading
    if (currentPlatform !== 'android' && !platformAPI?.readFile) return;
    setIsScanning(true);
    setScanStatus(null);
    if (scanStatusTimerRef.current) clearTimeout(scanStatusTimerRef.current);

    // Subscribe to real-time progress from the Electron scanner
    let unsubProgress: (() => void) | undefined;
    if (platformAPI.onScanProgress) {
      unsubProgress = platformAPI.onScanProgress(({ found, done }) => {
        if (!done) setScanStatus(`Scanning… ${found.toLocaleString()} files found`);
      });
    }

    try {
      const found = await platformAPI.scanLibrary();
      // Build a map of trackId → file info (generateTrackId uses name+size)
      const foundMap = new Map(
        found.map(f => [generateTrackId({ name: f.name, size: f.size }), f]),
      );
      // Read all stored IDs from IDB directly (avoids React-state timing issues)
      const storedTracks = await getAllStoredTracks();
      const existingIds = new Set(storedTracks.map(t => t.id));
      // Tracks on disk that are new to the library
      const toAdd = [...foundMap.entries()].filter(([id]) => !existingIds.has(id));
      // On manual refresh: remove tracks that were auto-scanned but are now gone from disk
      let removed = 0;
      if (manual) {
        let registry: { id: string }[] = [];
        try { registry = JSON.parse(localStorage.getItem("auto-scan-registry") ?? "[]"); }
        catch (_) {}
        for (const entry of registry) {
          if (!foundMap.has(entry.id) && existingIds.has(entry.id)) {
            removeTrack(entry.id);
            removed++;
          }
        }
      }
      // Add new tracks
      let added = 0;
      if (currentPlatform === 'android') {
        // Android: use MediaStore metadata directly — never read file bytes during scan
        const MIME: Record<string, string> = {
          mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav",
          m4a: "audio/mp4",  ogg: "audio/ogg",  aac: "audio/aac",
          opus: "audio/opus", wma: "audio/x-ms-wma",
        };
        const now = Date.now();
        const newAndroidTracks: Track[] = [];
        for (const [id, info] of toAdd) {
          try {
            const storedMeta = await getTrackMetadata(id);
            const addedAt = storedMeta?.addedAt ?? now;
            const playCount = storedMeta?.playCount ?? 0;
            const lastPlayedAt = storedMeta?.lastPlayedAt;
            const liked = storedMeta?.liked ?? false;
            const ext = info.name.split(".").pop()?.toLowerCase() ?? "";
            const mimeType = MIME[ext] ?? "audio/mpeg";
            const playbackUrl = convertFileUri(info.path);
            const placeholderFile = new File([], info.name, { type: mimeType });
            newAndroidTracks.push({
              id,
              file: placeholderFile,
              url: playbackUrl,
              path: info.path,   // content:// URI — used by MediaMetadataRetriever for album art
              title: storedMeta?.customTitle ?? info.title ?? info.name.replace(/\.[^/.]+$/, ""),
              artist: storedMeta?.customArtist ?? info.artist ?? "Unknown Artist",
              album: storedMeta?.customAlbum ?? info.album ?? "Unknown Album",
              year: storedMeta?.customYear,
              genre: storedMeta?.customGenre,
              duration: storedMeta?.metaDuration ?? info.durationSecs ?? 0,
              addedAt,
              playCount,
              lastPlayedAt,
              liked,
            });
            added++;
            await saveStoredTrack(id, {
              filePath: info.path,
              fileName: info.name,
              fileType: mimeType,
              fileSize: info.size,
              addedAt,
              metaTitle: info.title,
              metaArtist: info.artist,
              metaAlbum: info.album,
              metaDuration: info.durationSecs,
              playCount,
              lastPlayedAt,
            });
          } catch (_) {}
        }
        if (newAndroidTracks.length > 0) {
          setTracks(prev => {
            const have = new Set(prev.map(t => t.id));
            return [...prev, ...newAndroidTracks.filter(t => !have.has(t.id))];
          });
        }
      } else {
        // Desktop: read file bytes and store blobs in IDB
        const newFiles: File[] = [];
        for (const [, info] of toAdd) {
          try {
            const result = await platformAPI!.readFile!(info.path);
            const blob = new Blob([result.bytes.buffer as ArrayBuffer]);
            const ext = info.name.split(".").pop()?.toLowerCase() ?? "";
            const MIME: Record<string, string> = {
              mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav",
              m4a: "audio/mp4",  ogg: "audio/ogg",  aac: "audio/aac",
              opus: "audio/opus", wma: "audio/x-ms-wma",
            };
            newFiles.push(new File([blob], info.name, { type: MIME[ext] ?? "audio/mpeg" }));
            added++;
          } catch (_) {}
        }
        if (newFiles.length > 0) await addFiles(newFiles);
      }

      // ── Persist file paths & sync game playlists ──────────────────────────────
      // Save filePath for every newly scanned track.
      for (const [id, info] of toAdd) {
        try { await saveStoredTrack(id, { filePath: info.path }); } catch (_) {}
      }
      // Backfill: store paths for existing tracks that were found on disk
      // but never had their path recorded (e.g. added before this feature existed).
      const backfilledPaths = new Map<string, string>();
      for (const s of storedTracks) {
        if (!s.filePath && foundMap.has(s.id)) {
          const fp = foundMap.get(s.id)!.path;
          try { await saveStoredTrack(s.id, { filePath: fp }); } catch (_) {}
          backfilledPaths.set(s.id, fp);
        }
      }
      // Also patch in-memory track.path so "Show in Folder" works without restart.
      if (backfilledPaths.size > 0) {
        setTracks(prev => prev.map(t =>
          (!t.path && backfilledPaths.has(t.id))
            ? { ...t, path: backfilledPaths.get(t.id) }
            : t,
        ));
      }
      // Game soundtrack detection — desktop only (Android paths are never game store paths)
      if (currentPlatform !== 'android') {
        // Build a complete id → path map from scan results + IDB fallback.
        const allPaths = new Map<string, string>();
        for (const [id, info] of foundMap) allPaths.set(id, info.path);
        for (const s of storedTracks) {
          if (s.filePath && !allPaths.has(s.id)) allPaths.set(s.id, s.filePath);
        }
        // Detect game groups: gameName → [trackId, ...]
        const gameGroups = new Map<string, string[]>();
        for (const [id, fp] of allPaths) {
          const gameName = detectGameFromPath(fp);
          if (gameName) {
            const list = gameGroups.get(gameName) ?? [];
            list.push(id);
            gameGroups.set(gameName, list);
          }
        }
        if (gameGroups.size > 0) {
          let gameRegistry: Record<string, string> = {};
          try {
            gameRegistry = JSON.parse(localStorage.getItem("game-playlist-registry") ?? "{}");
          } catch (_) {}
          const storedPls = await getAllStoredPlaylists();
          const storedPlMap = new Map(storedPls.map(p => [p.id, p]));
          const plUpdates: Playlist[] = [];
          for (const [gameName, trackIds] of gameGroups) {
            let playlistId = gameRegistry[gameName];
            let storedPl = playlistId ? storedPlMap.get(playlistId) : undefined;
            if (!storedPl) {
              const now = Date.now();
              playlistId = makeId("pl");
              storedPl = {
                id: playlistId,
                name: `🎮 ${gameName}`,
                trackIds: [],
                createdAt: now,
                updatedAt: now,
              };
              gameRegistry[gameName] = playlistId;
            }
            const have = new Set(storedPl.trackIds);
            const additions = trackIds.filter(id => !have.has(id));
            if (additions.length > 0 || !storedPlMap.has(playlistId)) {
              const updated = {
                ...storedPl,
                trackIds: [...storedPl.trackIds, ...additions],
                updatedAt: Date.now(),
              };
              await saveStoredPlaylist(updated);
              plUpdates.push({
                id: updated.id,
                name: updated.name,
                trackIds: updated.trackIds,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
              });
            }
          }
          if (plUpdates.length > 0) {
            setPlaylists(prev => {
              const map = new Map(prev.map(p => [p.id, p]));
              for (const upd of plUpdates) {
                const existing = map.get(upd.id);
                map.set(upd.id, { ...upd, customCoverUrl: existing?.customCoverUrl });
              }
              return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
            });
          }
          localStorage.setItem("game-playlist-registry", JSON.stringify(gameRegistry));
        }
      }

      // Update scan registry with current disk snapshot
      localStorage.setItem(
        "auto-scan-registry",
        JSON.stringify([...foundMap.keys()].map(id => ({ id }))),
      );
      // Show result message
      const flash = (msg: string) => {
        setScanStatus(msg);
        if (scanStatusTimerRef.current) clearTimeout(scanStatusTimerRef.current);
        scanStatusTimerRef.current = setTimeout(() => setScanStatus(null), 5000);
      };
      if (manual) {
        if (added === 0 && removed === 0) flash("Library is up to date");
        else {
          const parts: string[] = [];
          if (added   > 0) parts.push(`✅ ${added} new song${added !== 1 ? "s" : ""} added`);
          if (removed > 0) parts.push(`🗑️ ${removed} song${removed !== 1 ? "s" : ""} removed`);
          flash(parts.join("  ·  "));
        }
      } else if (added > 0) {
        flash(`✅ Found ${added} song${added !== 1 ? "s" : ""}`);
      }
    } catch (e) {
      console.error("[auto-scan]", e);
    } finally {
      unsubProgress?.();
      setIsScanning(false);
    }
  }, [addFiles, removeTrack]);

  const cancelScan = useCallback(() => {
    platformAPI?.cancelScan?.();
    setIsScanning(false);
    setScanStatus(null);
  }, []);

  // (Startup scan is triggered from the IDB restore effect's finally block above,
  //  so it always runs after saved tracks are already visible to the user.)

  const value = useMemo<PlayerContextValue>(
    () => ({
      tracks,
      playlists,
      currentIndex,
      currentTrack,
      currentQueueIds,
      currentQueueLabel,
      effectiveQueue,
      currentPlaylistId,
      currentPlaylistType,
      isPlaying,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      loadingFiles,
      isScanning,
      scanStatus,
      autoScanLibrary,
      cancelScan,
      crossfadeEnabled,
      crossfadeSecs,
      eqGains,
      eqPreset,
      setEqGain,
      applyEqPreset,
      reverbMix,
      reverbDecay,
      reverbPreset,
      setReverbMix,
      setReverbDecay,
      applyReverbPreset,
      analyserRef: waAnalyserRef,
      isMono,
      toggleMono,
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
      speed,
      setSpeed,
      lyricsOpen,
      setLyricsOpen,
      toggleCrossfade,
      setCrossfadeSecs,
      removeTrack,
      deleteTrackWithFile,
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
      reorderPlaylists,
      downloads,
      startDownload,
      cancelDownload,
      miniMode,
      setMiniMode,
      fsVizOpen,
      setFsVizOpen,
      playEphemeral,
      skipBackSecs,
      skipForwardSecs,
      setSkipBackSecs,
      setSkipForwardSecs,
      skipBack,
      skipForward,
    }),
    [
      speed,
      tracks,
      playlists,
      currentIndex,
      currentTrack,
      currentQueueIds,
      currentQueueLabel,
      effectiveQueue,
      currentPlaylistId,
      currentPlaylistType,
      isPlaying,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      loadingFiles,
      isScanning,
      scanStatus,
      autoScanLibrary,
      cancelScan,
      crossfadeEnabled,
      crossfadeSecs,
      eqGains,
      eqPreset,
      setEqGain,
      applyEqPreset,
      reverbMix,
      reverbDecay,
      reverbPreset,
      setReverbMix,
      setReverbDecay,
      applyReverbPreset,
      isMono,
      toggleMono,
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
      speed,
      setSpeed,
      lyricsOpen,
      setLyricsOpen,
      toggleCrossfade,
      setCrossfadeSecs,
      removeTrack,
      deleteTrackWithFile,
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
      reorderPlaylists,
      downloads,
      startDownload,
      cancelDownload,
      miniMode,
      setMiniMode,
      fsVizOpen,
      setFsVizOpen,
      playEphemeral,
      skipBackSecs,
      skipForwardSecs,
      setSkipBackSecs,
      setSkipForwardSecs,
      skipBack,
      skipForward,
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
