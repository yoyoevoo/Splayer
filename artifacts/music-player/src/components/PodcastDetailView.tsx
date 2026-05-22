import { useEffect, useState, useRef, useCallback } from "react";
import { ArrowLeft, Bookmark, CheckCircle2, Circle, Loader2, Play, Pause, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/player-context";
import { usePodcasts } from "@/lib/use-podcasts";
import type { Podcast, PodcastEpisode, Track } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { platformAPI } from "@/lib/platform-api";

// ── Per-episode speed memory + bookmarks (localStorage) ───────────────────────
type PodBm = { id: string; time: number };
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

function fmtBmTime(t: number): string {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function readPodSpeed(epId: string): number {
  try { return Number(localStorage.getItem(`spd-pod:${epId}`)) || 1; } catch { return 1; }
}
function readPodBms(epId: string): PodBm[] {
  try { return JSON.parse(localStorage.getItem(`bm-pod:${epId}`) ?? "[]"); } catch { return []; }
}
function savePodBms(epId: string, bms: PodBm[]) {
  try { localStorage.setItem(`bm-pod:${epId}`, JSON.stringify(bms)); } catch {}
}

function extractYtId(url: string): string | null {
  const m = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?]+)/);
  return m?.[1] ?? null;
}

// Returns the track to play and the number of seconds to seek to after load.
// For the direct CDN URL path, `startSecs` is non-zero so the caller can seek
// after the audio element has loaded (CDN URLs support Range requests so this works).
// For the stream-proxy fallback, `startSecs` is 0 because yt-dlp already starts
// the stream at the right position via --download-sections.
async function episodeToTrack(
  ep: PodcastEpisode,
  podcast: Podcast,
): Promise<{ track: Track; startSecs: number }> {
  const makeTrack = (url: string): Track => ({
    id:               ep.id,
    file:             new File([], ep.title),
    url,
    title:            ep.title,
    artist:           podcast.title,
    album:            podcast.title,
    duration:         ep.duration ?? 0,
    addedAt:          ep.pubDate ?? Date.now(),
    playCount:        0,
    embeddedCoverUrl: ep.thumbnail ?? podcast.imageUrl,
  });

  const ytId = extractYtId(ep.audioUrl);
  const savedProgress = (typeof ep.progress === "number" && isFinite(ep.progress) && ep.progress > 10)
    ? ep.progress : 0;

  if (ytId && platformAPI?.ytGetAudioUrl) {
    const res = await platformAPI.ytGetAudioUrl(ytId);
    if ("url" in res) {
      return { track: makeTrack(res.url), startSecs: savedProgress };
    }
  }

  if (ytId && platformAPI?.getEmbedPort) {
    const port = await platformAPI.getEmbedPort();
    if (port) {
      const url = `http://127.0.0.1:${port}/stream?v=${ytId}`;
      return { track: makeTrack(url), startSecs: savedProgress };
    }
  }

  return { track: makeTrack(ep.audioUrl), startSecs: savedProgress };
}

interface Props {
  podcast: Podcast;
  onBack: () => void;
}

export function PodcastDetailView({ podcast, onBack }: Props) {
  const { getEpisodes, markPlayed, saveProgress, refreshPodcast } = usePodcasts();
  const { playEphemeral, currentTrack, isPlaying, togglePlay, currentTime, speed, setSpeed, seek } = usePlayer();

  const [episodes,    setEpisodes]   = useState<PodcastEpisode[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [refreshing,  setRefreshing] = useState(false);
  const [loadingEpId, setLoadingEpId] = useState<string | null>(null);
  const [embedPort,   setEmbedPort]  = useState(0);
  const lastSavedRef      = useRef<number>(0);
  const currentEpIdRef    = useRef<string | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const prevIsPlayingRef  = useRef(false);
  const prevEpIdRef       = useRef<string | null>(null);

  const [bms, setBms] = useState<PodBm[]>([]);

  // Fetch the embed-server port once — needed to call kill endpoints.
  useEffect(() => {
    platformAPI?.getEmbedPort?.().then((p) => { if (p) setEmbedPort(p); });
  }, []);

  const killStream = useCallback((videoId: string, atSecs: number) => {
    if (!embedPort) return;
    fetch(`http://127.0.0.1:${embedPort}/kill-stream?v=${videoId}&t=${atSecs}`).catch(() => {});
  }, [embedPort]);

  const killAllStreams = useCallback(() => {
    if (!embedPort) return;
    fetch(`http://127.0.0.1:${embedPort}/kill-all-streams`).catch(() => {});
  }, [embedPort]);

  useEffect(() => {
    getEpisodes(podcast.id).then((eps) => {
      setEpisodes(eps.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0)));
      setLoading(false);
    });
  }, [podcast.id, getEpisodes]);

  // Keep refs pointing at the currently-active podcast episode + its YouTube ID.
  // When the user switches to a regular library track, kill all open streams.
  useEffect(() => {
    const ep = episodes.find((e) => e.id === currentTrack?.id);
    if (ep) {
      currentEpIdRef.current    = ep.id;
      currentVideoIdRef.current = extractYtId(ep.audioUrl);
    } else if (currentTrack && currentEpIdRef.current) {
      killAllStreams();
      currentEpIdRef.current    = null;
      currentVideoIdRef.current = null;
    }
  }, [currentTrack, episodes, killAllStreams]);

  // On pause: save exact position then immediately kill the CDN stream so it
  // stops consuming RAM/CPU. On resume the component calls play(ep) which
  // restarts the stream from the saved position via a Range request.
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;
    if (wasPlaying && !isPlaying) {
      const videoId = currentVideoIdRef.current;
      const epId    = currentEpIdRef.current;
      if (videoId && epId) {
        saveProgress(epId, currentTime);
        setEpisodes((prev) => prev.map((e) => e.id === epId ? { ...e, progress: currentTime } : e));
        lastSavedRef.current = currentTime;
        killStream(videoId, currentTime);
      }
    }
  }, [isPlaying, currentTime, killStream, saveProgress]);

  // Persist progress every 5 seconds while playing, and mark played at 90%+
  useEffect(() => {
    const ep = episodes.find((e) => e.id === currentTrack?.id);
    if (!ep || currentTime < 5) return;
    if (currentTime - lastSavedRef.current < 5) return;
    lastSavedRef.current = currentTime;
    saveProgress(ep.id, currentTime);
    setEpisodes((prev) => prev.map((e) => e.id === ep.id ? { ...e, progress: currentTime } : e));
    const dur = ep.duration ?? 0;
    if (dur > 0 && currentTime / dur >= 0.9 && !ep.played) {
      markPlayed(ep.id, true);
      setEpisodes((prev) => prev.map((e) => e.id === ep.id ? { ...e, played: true } : e));
    }
  }, [currentTime, currentTrack, episodes, saveProgress, markPlayed]);

  // Speed memory: restore per-episode speed; reset to 1× when leaving podcasts
  useEffect(() => {
    const ep = episodes.find((e) => e.id === currentTrack?.id);
    const cur = ep?.id ?? null;
    const prev = prevEpIdRef.current;
    if (cur === prev) return;
    prevEpIdRef.current = cur;
    if (cur) {
      setSpeed(readPodSpeed(cur));
      setBms(readPodBms(cur));
    } else if (prev && episodes.length > 0) {
      // Switched from a podcast episode to something else
      setSpeed(1);
      setBms([]);
    }
  }, [currentTrack, episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist speed whenever it changes while a podcast episode is active
  useEffect(() => {
    const epId = currentEpIdRef.current;
    if (!epId) return;
    try { localStorage.setItem(`spd-pod:${epId}`, String(speed)); } catch {}
  }, [speed]);

  const play = useCallback(async (ep: PodcastEpisode) => {
    setLoadingEpId(ep.id);
    try {
      const { track, startSecs } = await episodeToTrack(ep, podcast);
      const safeStart = (typeof startSecs === "number" && isFinite(startSecs)) ? startSecs : 0;
      lastSavedRef.current = safeStart;
      playEphemeral(track, safeStart);
    } finally {
      setLoadingEpId(null);
    }
  }, [podcast, playEphemeral]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPodcast(podcast);
    const eps = await getEpisodes(podcast.id);
    setEpisodes(eps.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0)));
    setRefreshing(false);
  };

  // ── Bookmarks ────────────────────────────────────────────────────────────
  const currentEp = episodes.find((e) => e.id === currentTrack?.id) ?? null;

  const addBm = useCallback(() => {
    if (!currentEp) return;
    const bm: PodBm = { id: String(Date.now()), time: currentTime };
    setBms((prev) => {
      const next = [...prev, bm].sort((a, b) => a.time - b.time);
      savePodBms(currentEp.id, next);
      return next;
    });
  }, [currentEp, currentTime]);

  const removeBm = useCallback((id: string) => {
    if (!currentEp) return;
    setBms((prev) => {
      const next = prev.filter((b) => b.id !== id);
      savePodBms(currentEp.id, next);
      return next;
    });
  }, [currentEp]);

  const togglePlayed = async (ep: PodcastEpisode) => {
    await markPlayed(ep.id, !ep.played);
    setEpisodes((prev) => prev.map((e) => e.id === ep.id ? { ...e, played: !e.played } : e));
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {podcast.imageUrl && (
          <img src={podcast.imageUrl} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
        )}
        <span className="text-sm font-medium truncate flex-1">{podcast.title}</span>
        <Button
          size="icon" variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh episodes"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Speed + bookmarks — shown when a podcast episode is active */}
      {currentEp && (
        <div className="border-b border-card-border shrink-0">
          {/* Speed row */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex gap-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded transition-colors",
                    speed === s
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addBm}
              title="Bookmark current position"
              className="h-6 px-2 flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Bookmark className="w-3 h-3" />
              {fmtBmTime(currentTime)}
            </button>
          </div>

          {/* Bookmark list */}
          {bms.length > 0 && (
            <div className="px-3 pb-2 space-y-0.5 max-h-32 overflow-y-auto">
              {bms.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center gap-2 group hover:bg-muted/30 rounded px-1 py-0.5 cursor-pointer"
                  onClick={() => seek(bm.time)}
                >
                  <Bookmark className="w-2.5 h-2.5 text-primary shrink-0" />
                  <span className="text-[11px] text-primary tabular-nums shrink-0">
                    {fmtBmTime(bm.time)}
                  </span>
                  <button
                    type="button"
                    className="ml-auto opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); removeBm(bm.id); }}
                    title="Remove bookmark"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Episode list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No episodes found</p>
        ) : (
          <div className="divide-y divide-card-border/40">
            {episodes.map((ep) => {
              const isCurrent = currentTrack?.id === ep.id;
              const liveProgress = isCurrent ? currentTime : ep.progress;
              const progressPct = ep.duration && ep.duration > 0
                ? Math.min((liveProgress / ep.duration) * 100, 100) : 0;

              return (
                <div
                  key={ep.id}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors",
                    ep.played && "opacity-50",
                  )}
                >
                  {/* Thumbnail */}
                  {ep.thumbnail ? (
                    <img src={ep.thumbnail} alt="" className="w-10 h-10 rounded shrink-0 object-cover mt-0.5" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted/60 shrink-0 mt-0.5" />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate leading-tight",
                      isCurrent ? "text-primary" : "text-foreground",
                    )}>
                      {ep.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {ep.pubDate && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(ep.pubDate).toLocaleDateString()}
                        </span>
                      )}
                      {ep.duration && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(ep.duration)}
                        </span>
                      )}
                    </div>
                    {/* Progress bar */}
                    {progressPct > 0 && !ep.played && (
                      <div className="mt-1.5 h-0.5 bg-muted/40 rounded-full overflow-hidden w-full">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => togglePlayed(ep)}
                      title={ep.played ? "Mark unplayed" : "Mark played"}
                    >
                      {ep.played
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        : <Circle className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="icon" variant={isCurrent ? "default" : "ghost"}
                      className="h-7 w-7"
                      disabled={loadingEpId === ep.id}
                      onClick={() => isCurrent && isPlaying ? togglePlay() : play(ep)}
                    >
                      {loadingEpId === ep.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : isCurrent && isPlaying
                          ? <Pause className="w-3.5 h-3.5" />
                          : <Play className="w-3.5 h-3.5 translate-x-[1px]" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
