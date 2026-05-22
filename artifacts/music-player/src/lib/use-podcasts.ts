import { useState, useEffect, useCallback } from "react";
import {
  getAllPodcasts, savePodcast, deletePodcast,
  getEpisodesByPodcast, saveEpisodes, updateEpisode, deleteEpisodesByPodcast,
  type StoredPodcast, type StoredEpisode,
} from "./idb";
import type { Podcast, PodcastEpisode } from "./types";
import { platformAPI } from "./platform-api";

function makeId() {
  return `pod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseRssXml(xml: string, podcastId: string): { podcast: Partial<StoredPodcast>; episodes: StoredEpisode[] } {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xml, "text/xml");
  const channel = doc.querySelector("channel");

  const getText = (el: Element | null, tag: string) =>
    el?.querySelector(tag)?.textContent?.trim() ?? "";

  const title       = getText(channel, "title");
  const description = getText(channel, "description");
  const imageUrl    = channel?.querySelector("image url")?.textContent?.trim()
    ?? channel?.querySelector("itunes\\:image, image")?.getAttribute("href")
    ?? undefined;

  const items = Array.from(doc.querySelectorAll("item"));
  const episodes: StoredEpisode[] = items.map((item) => {
    const enclosure  = item.querySelector("enclosure");
    const audioUrl   = enclosure?.getAttribute("url") ?? "";
    const guid       = getText(item, "guid") || audioUrl;
    const title      = getText(item, "title") || "Untitled";
    const description = getText(item, "description") || getText(item, "itunes\\:summary") || undefined;
    const pubDateStr = getText(item, "pubDate");
    const pubDate    = pubDateStr ? new Date(pubDateStr).getTime() : undefined;
    const durationStr = getText(item, "itunes\\:duration");
    const duration   = parseDuration(durationStr);
    const thumbnail  = item.querySelector("itunes\\:image")?.getAttribute("href") ?? imageUrl ?? undefined;

    return {
      id: `ep-${podcastId}-${btoa(guid).replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
      podcastId,
      title,
      description,
      pubDate,
      duration,
      audioUrl,
      guid,
      played: false,
      progress: 0,
      thumbnail,
    };
  }).filter((e) => !!e.audioUrl);

  return { podcast: { title, description, imageUrl }, episodes };
}

function parseDuration(s: string): number | undefined {
  if (!s) return undefined;
  const parts = s.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

export function usePodcasts() {
  const [podcasts,  setPodcasts]  = useState<Podcast[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    getAllPodcasts().then((rows) => {
      setPodcasts(rows as Podcast[]);
      setLoading(false);
    });
  }, []);

  const getEpisodes = useCallback(async (podcastId: string): Promise<PodcastEpisode[]> => {
    const rows = await getEpisodesByPodcast(podcastId);
    return rows as PodcastEpisode[];
  }, []);

  const subscribe = useCallback(async (feedUrl: string): Promise<{ error?: string }> => {
    // Check if it's a YouTube playlist/channel URL
    const isYtSingle   = /youtube\.com\/watch\?.*v=|youtu\.be\//i.test(feedUrl);
    const isYtPlaylist = /youtube\.com\/(playlist|channel|@)/i.test(feedUrl);
    const isYt = isYtSingle || isYtPlaylist;

    const id = makeId();
    let storedPodcast: StoredPodcast;
    let episodes: StoredEpisode[] = [];

    if (isYtSingle) {
      if (!platformAPI?.ytGetInfo) return { error: "YouTube info fetch not available" };
      const res = await platformAPI.ytGetInfo(feedUrl);
      if ("error" in res) return { error: (res as { error: string }).error };
      const info = res as { title: string; author: string; durationSecs: number; thumbnailUrl: string | null };
      storedPodcast = {
        id,
        title:       info.title,
        description: info.author,
        imageUrl:    info.thumbnailUrl ?? undefined,
        feedUrl,
        addedAt:     Date.now(),
      };
      episodes = [{
        id:          `ep-${id}-single`,
        podcastId:   id,
        title:       info.title,
        description: undefined,
        pubDate:     undefined,
        duration:    info.durationSecs,
        audioUrl:    feedUrl,
        guid:        feedUrl,
        played:      false,
        progress:    0,
        thumbnail:   info.thumbnailUrl ?? undefined,
      }];
    } else if (isYtPlaylist) {
      if (!platformAPI?.ytGetPlaylist) return { error: "YouTube playlist fetch not available" };
      const res = await platformAPI.ytGetPlaylist(feedUrl);
      if ("error" in res) return { error: res.error };

      storedPodcast = {
        id,
        title:       res.title,
        description: res.description,
        imageUrl:    res.thumbnail ?? undefined,
        feedUrl,
        addedAt:     Date.now(),
      };

      episodes = res.entries.map((e, i) => ({
        id:          `ep-${id}-${e.id}`,
        podcastId:   id,
        title:       e.title,
        description: undefined,
        pubDate:     undefined,
        duration:    e.duration ?? undefined,
        audioUrl:    e.url,   // YouTube URL — will stream via embed server
        guid:        e.id,
        played:      false,
        progress:    0,
        thumbnail:   e.thumbnail ?? undefined,
      }));
    } else {
      if (!platformAPI?.podcastFetchRss) return { error: "RSS fetch not available" };
      const res = await platformAPI.podcastFetchRss(feedUrl);
      if ("error" in res) return { error: res.error };

      const parsed = parseRssXml(res.xml, id);

      storedPodcast = {
        id,
        title:       parsed.podcast.title       || "Untitled Podcast",
        description: parsed.podcast.description || "",
        imageUrl:    parsed.podcast.imageUrl,
        feedUrl,
        addedAt:     Date.now(),
      };
      episodes = parsed.episodes;
    }

    await savePodcast(storedPodcast);
    await saveEpisodes(episodes);
    setPodcasts((prev) => [...prev, storedPodcast as Podcast]);
    return {};
  }, []);

  const unsubscribe = useCallback(async (id: string) => {
    await deletePodcast(id);
    await deleteEpisodesByPodcast(id);
    setPodcasts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const refreshPodcast = useCallback(async (podcast: Podcast): Promise<{ error?: string }> => {
    const isYtSingle   = /youtube\.com\/watch\?.*v=|youtu\.be\//i.test(podcast.feedUrl);
    const isYt = isYtSingle || /youtube\.com\/(playlist|channel|@)/i.test(podcast.feedUrl);
    if (isYtSingle) return {}; // single video never has new episodes
    const existing = await getEpisodesByPodcast(podcast.id);
    const existingGuids = new Set(existing.map((e) => e.guid));

    let newEps: StoredEpisode[] = [];

    if (isYt) {
      if (!platformAPI?.ytGetPlaylist) return { error: "Not available" };
      const res = await platformAPI.ytGetPlaylist(podcast.feedUrl);
      if ("error" in res) return { error: res.error };
      newEps = res.entries
        .filter((e) => !existingGuids.has(e.id))
        .map((e) => ({
          id: `ep-${podcast.id}-${e.id}`,
          podcastId: podcast.id,
          title: e.title,
          description: undefined,
          pubDate: undefined,
          duration: e.duration ?? undefined,
          audioUrl: e.url,
          guid: e.id,
          played: false,
          progress: 0,
          thumbnail: e.thumbnail ?? undefined,
        }));
    } else {
      if (!platformAPI?.podcastFetchRss) return { error: "Not available" };
      const res = await platformAPI.podcastFetchRss(podcast.feedUrl);
      if ("error" in res) return { error: res.error };
      const parsed = parseRssXml(res.xml, podcast.id);
      newEps = parsed.episodes.filter((e) => !existingGuids.has(e.guid));
    }

    if (newEps.length > 0) await saveEpisodes(newEps);
    return {};
  }, []);

  const markPlayed = useCallback(async (episodeId: string, played: boolean) => {
    await updateEpisode(episodeId, { played });
  }, []);

  const saveProgress = useCallback(async (episodeId: string, progress: number) => {
    await updateEpisode(episodeId, { progress });
  }, []);

  return {
    podcasts,
    loading,
    getEpisodes,
    subscribe,
    unsubscribe,
    refreshPodcast,
    markPlayed,
    saveProgress,
  };
}
