import { useState, useEffect, useCallback } from "react";
import {
  getAllBooks, saveBook, updateBook, deleteBook, getBookById,
  getChaptersByBook, saveChapters, updateChapter, deleteChaptersByBook,
  getBookmarksByBook, saveBookmark, deleteBookmark, deleteBookmarksByBook,
  type StoredBook, type StoredBookChapter, type StoredBookBookmark,
} from "./idb";
import type { Book, BookChapter, BookBookmark } from "./types";
import { extractMetadata } from "./metadata";
import { parseChapters } from "./parse-chapters";
import { platformAPI } from "./platform-api";

function makeId(prefix = "bk") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useBooks() {
  const [books,   setBooks]   = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllBooks().then(async (rows) => {
      const withCovers = await Promise.all(
        rows.map(async (row): Promise<Book> => ({
          id:          row.id,
          title:       row.title,
          author:      row.author,
          narrator:    row.narrator,
          description: row.description,
          coverUrl:    row.coverBlob ? URL.createObjectURL(row.coverBlob) : undefined,
          source:      row.source,
          feedUrl:     row.feedUrl,
          addedAt:     row.addedAt,
          duration:    row.duration,
          progress:    row.progress ?? 0,
        })),
      );
      setBooks(withCovers);
      setLoading(false);
    });
  }, []);

  const getChapters = useCallback(async (bookId: string): Promise<BookChapter[]> => {
    const rows = await getChaptersByBook(bookId);
    return rows as BookChapter[];
  }, []);

  const getBookmarks = useCallback(async (bookId: string): Promise<BookBookmark[]> => {
    const rows = await getBookmarksByBook(bookId);
    return rows as BookBookmark[];
  }, []);

  // Returns a fresh Object URL for the book's audio blob; caller must revoke it.
  const getAudioBlobUrl = useCallback(async (bookId: string): Promise<string | null> => {
    const row = await getBookById(bookId);
    if (!row?.audioBlob) return null;
    return URL.createObjectURL(row.audioBlob);
  }, []);

  const addBookFromFile = useCallback(async (file: File): Promise<{ error?: string }> => {
    const id = makeId();
    try {
      const [meta, parsedChapters] = await Promise.all([
        extractMetadata(file),
        parseChapters(file),
      ]);

      const storedBook: StoredBook = {
        id,
        title:     meta.title   || file.name.replace(/\.[^/.]+$/, ""),
        author:    meta.artist  || "Unknown Author",
        source:    "local",
        addedAt:   Date.now(),
        duration:  meta.duration,
        progress:  0,
        coverBlob: meta.coverBlob,
        audioBlob: file,
        audioType: file.type || "audio/mpeg",
      };

      const storedChapters: StoredBookChapter[] = parsedChapters.map((ch, i) => ({
        id:        `${id}-ch-${i}`,
        bookId:    id,
        title:     ch.title,
        index:     i,
        startTime: ch.startSecs,
        endTime:   i + 1 < parsedChapters.length ? parsedChapters[i + 1].startSecs : meta.duration,
        progress:  0,
        played:    false,
      }));

      await saveBook(storedBook);
      if (storedChapters.length > 0) await saveChapters(storedChapters);

      const bookState: Book = {
        id,
        title:    storedBook.title,
        author:   storedBook.author,
        source:   "local",
        coverUrl: meta.coverUrl,
        addedAt:  storedBook.addedAt,
        duration: meta.duration,
        progress: 0,
      };
      setBooks((prev) => [...prev, bookState]);
      return {};
    } catch (e: unknown) {
      return { error: String((e as { message?: string })?.message ?? e) };
    }
  }, []);

  const addBookFromUrl = useCallback(async (url: string): Promise<{ error?: string }> => {
    const id = makeId();
    const isYtPlaylist = /youtube\.com\/(playlist|channel|@)/i.test(url);
    const isYtSingle   = /youtube\.com\/watch\?.*v=|youtu\.be\//i.test(url);

    if (!isYtPlaylist && !isYtSingle) {
      return { error: "Please provide a YouTube playlist or single video URL" };
    }

    try {
      let storedBook: StoredBook;
      let storedChapters: StoredBookChapter[] = [];

      if (isYtSingle) {
        if (!platformAPI?.ytGetInfo) return { error: "YouTube info not available" };
        const res = await platformAPI.ytGetInfo(url);
        if ("error" in res) return { error: String((res as { error: unknown }).error) };
        const info = res as { title: string; author: string; durationSecs: number; thumbnailUrl: string | null };
        storedBook = {
          id,
          title:   info.title,
          author:  info.author,
          source:  "youtube",
          feedUrl: url,
          addedAt: Date.now(),
          duration: info.durationSecs,
          progress: 0,
        };
        storedChapters = [{
          id:       `${id}-ch-0`,
          bookId:   id,
          title:    info.title,
          index:    0,
          audioUrl: url,
          progress: 0,
          played:   false,
        }];
      } else {
        if (!platformAPI?.ytGetPlaylist) return { error: "YouTube playlist not available" };
        const res = await platformAPI.ytGetPlaylist(url);
        if ("error" in res) return { error: res.error };
        storedBook = {
          id,
          title:   res.title,
          author:  res.description.slice(0, 80) || "",
          source:  "youtube",
          feedUrl: url,
          addedAt: Date.now(),
        };
        storedChapters = res.entries.map((e, i) => ({
          id:       `${id}-ch-${e.id}`,
          bookId:   id,
          title:    e.title,
          index:    i,
          audioUrl: e.url,
          duration: e.duration ?? undefined,
          progress: 0,
          played:   false,
        }));
      }

      await saveBook(storedBook);
      if (storedChapters.length > 0) await saveChapters(storedChapters);

      const bookState: Book = {
        id,
        title:   storedBook.title,
        author:  storedBook.author,
        source:  "youtube",
        feedUrl: url,
        addedAt: storedBook.addedAt,
        duration: storedBook.duration,
        progress: 0,
      };
      setBooks((prev) => [...prev, bookState]);
      return {};
    } catch (e: unknown) {
      return { error: String((e as { message?: string })?.message ?? e) };
    }
  }, []);

  const removeBook = useCallback(async (id: string) => {
    setBooks((prev) => {
      const book = prev.find((b) => b.id === id);
      if (book?.coverUrl) URL.revokeObjectURL(book.coverUrl);
      return prev.filter((b) => b.id !== id);
    });
    await deleteBook(id);
    await deleteChaptersByBook(id);
    await deleteBookmarksByBook(id);
  }, []);

  const saveProgress = useCallback(async (bookId: string, time: number) => {
    await updateBook(bookId, { progress: time });
    setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, progress: time } : b));
  }, []);

  const saveChapterProgress = useCallback(async (chapterId: string, time: number) => {
    await updateChapter(chapterId, { progress: time });
  }, []);

  const markChapterPlayed = useCallback(async (chapterId: string, played: boolean) => {
    await updateChapter(chapterId, { played });
  }, []);

  const addBookmark = useCallback(async (
    bookId: string,
    time: number,
    note: string,
  ): Promise<BookBookmark> => {
    const bm: StoredBookBookmark = {
      id:        makeId("bmk"),
      bookId,
      time,
      note,
      createdAt: Date.now(),
    };
    await saveBookmark(bm);
    return bm as BookBookmark;
  }, []);

  const removeBookmark = useCallback(async (id: string) => {
    await deleteBookmark(id);
  }, []);

  return {
    books,
    loading,
    getChapters,
    getBookmarks,
    getAudioBlobUrl,
    addBookFromFile,
    addBookFromUrl,
    removeBook,
    saveProgress,
    saveChapterProgress,
    markChapterPlayed,
    addBookmark,
    removeBookmark,
  };
}
