import { useEffect, useRef, useState } from "react";
import { platformAPI } from "@/lib/platform-api";
import { Download, Loader2, Music, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlayer } from "@/lib/player-context";
import { addDownloadRecord } from "@/lib/downloads-history";
import { saveStoredTrack } from "@/lib/idb";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SP        = "#1DB954";
const SP_DIM    = "rgba(29,185,84,0.15)";
const SP_BORDER = "rgba(29,185,84,0.3)";

type TrackStatus = "idle" | "downloading" | "done" | "error" | "skipped";
type Stage = "input" | "fetching" | "preview" | "downloading" | "done";

interface TrackRow {
  id: string; name: string; artists: string; durationMs: number;
  url?: string; selected: boolean; status: TrackStatus; errorMsg: string;
}

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function sanitize(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120);
}

function SpotifyLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.32a.75.75 0 0 1-1.032.25c-2.823-1.725-6.38-2.115-10.567-1.158a.75.75 0 0 1-.334-1.463c4.58-1.047 8.508-.597 11.682 1.34a.75.75 0 0 1 .251 1.031zm1.473-3.276a.937.937 0 0 1-1.288.308C14.96 12.525 11.1 12 7.2 13.062a.938.938 0 0 1-.468-1.815C11.17 10.07 15.48 10.655 18.68 12.756a.938.938 0 0 1 .309 1.288zm.126-3.408c-3.35-1.99-8.875-2.172-12.073-1.201a1.124 1.124 0 0 1-.65-2.15c3.671-1.113 9.77-.898 13.626 1.39a1.125 1.125 0 1 1-1.127 1.95l.224-.989z" />
    </svg>
  );
}

function StatusIcon({ status }: { status: TrackStatus }) {
  if (status === "done")        return <span className="text-[11px] font-bold" style={{ color: SP }}>✓</span>;
  if (status === "error")       return <span className="text-[11px] text-red-400">✗</span>;
  if (status === "skipped")     return <span className="text-[11px] text-muted-foreground">—</span>;
  if (status === "downloading") return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: SP }} />;
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Called with live progress while a background download is active; null = done/cancelled. */
  onBackgroundProgress?: (info: { done: number; total: number } | null) => void;
}

export function SpotifyPlaylistDialog({ open, onOpenChange, onBackgroundProgress }: Props) {
  const { addFiles, updateTrackInfo, createPlaylist, addTracksToPlaylist, playlists } = usePlayer();
  const { toast } = useToast();
  const api = platformAPI;

  const [loggedIn,     setLoggedIn]     = useState<boolean | null>(null);
  const [loginBusy,    setLoginBusy]    = useState(false);
  const [importBusy,   setImportBusy]   = useState(false);
  const [importErr,    setImportErr]    = useState("");
  const [showPaste,    setShowPaste]    = useState(false);
  const [pastedCookie, setPastedCookie] = useState("");
  const [stage,      setStage]      = useState<Stage>("input");
  const [url,        setUrl]        = useState("");
  const [fetchErr,   setFetchErr]   = useState("");
  const [plName,     setPlName]     = useState("");
  const [rows,       setRows]       = useState<TrackRow[]>([]);
  const [doneCount,  setDoneCount]  = useState(0);
  const [totalQueue, setTotalQueue] = useState(0);
  const [failedList, setFailedList] = useState<{ name: string; artist?: string; reason: string }[]>([]);

  const cancelRef          = useRef(false);
  const trackDoneUnsub     = useRef<(() => void) | null>(null);
  const downloadedTrackIds = useRef<string[]>([]);
  const backgroundMode     = useRef(false);
  const downloadRunning    = useRef(false); // re-entry guard for startDownload

  useEffect(() => {
    if (!open) return;
    (api as any)?.spotifyCheck?.().then((r: { loggedIn: boolean }) => setLoggedIn(r?.loggedIn ?? false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (backgroundMode.current) return; // let download finish in background
      cancelRef.current = true;
      trackDoneUnsub.current?.(); trackDoneUnsub.current = null;
      setTimeout(() => {
        setStage("input"); setUrl(""); setFetchErr(""); setPlName("");
        setRows([]); setDoneCount(0); setTotalQueue(0); setFailedList([]);
        cancelRef.current = false; downloadedTrackIds.current = [];
      }, 200);
    }
  }, [open]);

  async function handleLogin() {
    setLoginBusy(true); setImportErr("");
    const result = await (api as any)?.spotifyLogin?.();
    setLoginBusy(false);
    if (result?.success) setLoggedIn(true);
    else if (result?.error && result.error !== "Login cancelled")
      toast({ title: "Login failed", description: result.error, variant: "destructive" });
  }

  async function handleImportFromBrowser() {
    setImportBusy(true); setImportErr("");
    const result = await (api as any)?.spotifyImportBrowser?.();
    setImportBusy(false);
    if (result?.success) setLoggedIn(true);
    else setImportErr(result?.error ?? "Not found — try the paste method below");
  }

  async function handlePasteCookie() {
    if (!pastedCookie.trim()) return;
    const result = await (api as any)?.spotifySetCookie?.({ spDc: pastedCookie });
    if (result?.success) { setLoggedIn(true); setShowPaste(false); }
    else if (result?.error) toast({ title: "Connection failed", description: result.error, variant: "destructive" });
  }

  async function handleLogout() {
    await (api as any)?.spotifyLogout?.();
    setLoggedIn(false);
    setStage("input"); setRows([]); setPlName("");
  }

  async function handleFetch() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setFetchErr(""); setStage("fetching");

    const result = await (api as any)?.spotifyFetch?.({ url: trimmed });

    if (!result || "error" in result) {
      const err = (result as { error: string })?.error ?? "Unknown error";
      if (err === "NOT_LOGGED_IN") { setLoggedIn(false); setStage("input"); return; }
      setFetchErr(err); setStage("input"); return;
    }

    setPlName(result.playlistName);
    setRows(result.tracks.map((t: any) => ({
      id: t.id, name: t.name, artists: t.artists, durationMs: t.durationMs,
      url: t.url ?? `https://open.spotify.com/track/${t.id}`,
      selected: true, status: "idle" as TrackStatus, errorMsg: "",
    })));
    setStage("preview");
  }

  function toggleAll(val: boolean) { setRows((r) => r.map((t) => ({ ...t, selected: val }))); }
  function toggleRow(id: string)   { setRows((r) => r.map((t) => t.id === id ? { ...t, selected: !t.selected } : t)); }

  function handleBackgroundDownload() {
    backgroundMode.current = true;
    onBackgroundProgress?.({ done: doneCount, total: totalQueue });
    onOpenChange(false);
  }

  async function startDownload() {
    if (downloadRunning.current) return; // prevent double-start on rapid clicks
    downloadRunning.current = true;

    cancelRef.current = false;
    downloadedTrackIds.current = [];
    setFailedList([]);

    // Always unsubscribe any stale listener before registering a new one.
    // Without this, a second call would register a second listener and every
    // spotdl event would increment the counter twice.
    trackDoneUnsub.current?.();
    trackDoneUnsub.current = null;

    const downloadsDir = localStorage.getItem("settings-downloads-path") ?? "";
    const selected     = rows.filter((r) => r.selected);
    if (!selected.length) { downloadRunning.current = false; return; }

    const total = selected.length;
    setTotalQueue(total); setDoneCount(0); setStage("downloading");
    setRows((r) => r.map((t) => t.selected ? { ...t, status: "downloading" as TrackStatus } : t));

    let done = 0;
    trackDoneUnsub.current = (api as any)?.onSpotdlTrackDone?.((data: { name: string; skipped: boolean }) => {
      setRows((r) => {
        const idx = r.findIndex((t) => t.status === "downloading" &&
          t.name.toLowerCase().startsWith(data.name.toLowerCase().slice(0, 15)));
        if (idx === -1) return r; // already marked — skip duplicate event
        const updated = [...r];
        updated[idx] = { ...updated[idx], status: data.skipped ? "skipped" : "done" };
        return updated;
      });
      // Cap at total so duplicate events can't push the counter above the playlist size
      done = Math.min(done + 1, total);
      setDoneCount(done);
      if (backgroundMode.current) {
        onBackgroundProgress?.({ done, total });
      }
    }) ?? null;

    let result: any = null;
    try {
      result = await (api as any)?.spotdlDownloadBatch?.({
        tracks:    selected.map((t) => ({ url: t.url ?? `https://open.spotify.com/track/${t.id}`, name: t.name, artist: t.artists })),
        outputDir: downloadsDir || undefined,
        format:    "mp3",
      });
    } catch (e: any) {
      toast({ title: "Download failed", description: String(e?.message ?? e), variant: "destructive" });
    }

    trackDoneUnsub.current?.(); trackDoneUnsub.current = null;

    if (result?.files?.length) {
      for (const f of result.files) {
        try {
          // Read from disk. On Android fileFetchUrl is a WebView-accessible URL;
          // on Electron we build a file:// URL from the absolute path.
          const fileUrl = (f as { fileFetchUrl?: string }).fileFetchUrl
            ?? ("file:///" + f.filePath.replace(/\\/g, "/"));
          const resp  = await fetch(fileUrl);
          const blob  = await resp.blob();
          const file  = new File([blob], f.fileName, { type: f.mimeType });
          await addFiles([file]);
          const tid = `${file.name}-${file.size}`;
          // Persist the real disk path so deleteTrackWithFile / Show in Folder work
          if (f.filePath) {
            await saveStoredTrack(tid, { filePath: f.filePath }).catch(() => {});
            console.log("[spotify-dl] saved filePath to IDB:", tid, "→", f.filePath);
          } else {
            console.warn("[spotify-dl] f.filePath missing for", f.fileName);
          }
          const matched = selected.find((t) => f.fileName.toLowerCase().includes(sanitize(t.name).toLowerCase().slice(0, 12)));
          if (matched) await updateTrackInfo(tid, { title: matched.name, artist: matched.artists });
          addDownloadRecord({
            id: `spotdl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            trackId: tid, title: f.fileName.replace(/\.[^.]+$/, ""), artist: "",
            ext: f.ext, fileSize: blob.size,
            filePath: f.filePath ?? null,
            downloadedAt: Date.now(), type: "audio",
          });
          downloadedTrackIds.current.push(tid);
        } catch { /* non-fatal */ }
      }
    }

    setRows((r) => r.map((t) => t.status === "downloading" ? { ...t, status: "done" as TrackStatus } : t));
    setDoneCount(selected.length);

    if (downloadedTrackIds.current.length > 0) {
      try {
        const PLAYLIST_NAME = "Spotify Songs";
        const existing = playlists.find((p) => p.name === PLAYLIST_NAME);
        const pl = existing ?? await createPlaylist(PLAYLIST_NAME);
        console.log("[spotify-dl] adding to playlist:", pl.id, "trackIds:", downloadedTrackIds.current);
        await addTracksToPlaylist(pl.id, downloadedTrackIds.current);
      } catch { /* non-fatal */ }
    }

    const failed: { name: string; artist?: string; reason: string }[] = result?.failed ?? [];
    if (failed.length) {
      setFailedList(failed);
      failed.forEach((f) => console.error(`[spotify-dl] failed: "${f.name}" by "${f.artist}" — ${f.reason}`));
    }

    if (backgroundMode.current) {
      onBackgroundProgress?.(null); // clear the badge
      toast({
        title: "Spotify download complete!",
        description: `${downloadedTrackIds.current.length} song${downloadedTrackIds.current.length !== 1 ? "s" : ""} added to Spotify Songs${failed.length ? `, ${failed.length} failed` : ""}`,
        duration: 6000,
      });
      backgroundMode.current = false;
      setTimeout(() => {
        setStage("input"); setUrl(""); setFetchErr(""); setPlName("");
        setRows([]); setDoneCount(0); setTotalQueue(0);
        downloadedTrackIds.current = [];
      }, 300);
    } else {
      setStage("done");
    }
    downloadRunning.current = false;
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected   = rows.length > 0 && rows.every((r) => r.selected);
  const noneSelected  = rows.every((r) => !r.selected);
  const isDownloading = stage === "downloading";
  const isDone        = stage === "done";
  const overallPct    = totalQueue > 0 ? Math.round((doneCount / totalQueue) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              <span style={{ color: SP }}><SpotifyLogo size={16} /></span>
              Spotify Downloader
            </DialogTitle>
            {isDownloading && (
              <Button size="sm" variant="ghost" className="text-xs h-7 px-2 mr-7 shrink-0" onClick={handleBackgroundDownload}>
                ↓ Background
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* Login */}
          {loggedIn === false && !showPaste && (
            <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: SP_BORDER, background: SP_DIM }}>
              <div className="flex items-center gap-3">
                <SpotifyLogo size={24} />
                <div>
                  <p className="text-sm font-semibold">Connect your Spotify account</p>
                  <p className="text-xs text-muted-foreground">No developer account needed.</p>
                </div>
              </div>

              {/* Option 1: email/password popup */}
              <Button className="gap-2 w-full font-semibold" style={{ background: SP, color: "#000" }}
                onClick={handleLogin} disabled={loginBusy || importBusy}>
                {loginBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SpotifyLogo size={14} />}
                {loginBusy ? "Opening…" : "Log in with Spotify (email/password)"}
              </Button>

              {/* Option 2: import from browser (Google accounts) */}
              <Button variant="outline" className="gap-2 w-full text-sm"
                onClick={handleImportFromBrowser} disabled={loginBusy || importBusy}>
                {importBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {importBusy ? "Searching browsers…" : "Import from Chrome / Firefox (Google accounts)"}
              </Button>
              {importErr && <p className="text-xs text-red-400">{importErr}</p>}

              {/* Option 3: manual paste */}
              <button className="text-[11px] text-muted-foreground hover:text-foreground underline text-center"
                onClick={() => setShowPaste(true)}>
                Paste sp_dc cookie manually
              </button>
            </div>
          )}

          {/* Paste cookie form */}
          {loggedIn === false && showPaste && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                In Chrome/Firefox: open <span className="font-mono">open.spotify.com</span> → F12 → Application → Cookies → copy the <span className="font-mono">sp_dc</span> value.
              </p>
              <Input className="text-xs font-mono" placeholder="Paste sp_dc cookie value here…"
                value={pastedCookie} onChange={(e) => setPastedCookie(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowPaste(false)}>Cancel</Button>
                <Button size="sm" className="flex-1"
                  style={pastedCookie.trim() ? { background: SP, color: "#000" } : undefined}
                  disabled={!pastedCookie.trim()} onClick={handlePasteCookie}>
                  Connect
                </Button>
              </div>
            </div>
          )}

          {/* Connected bar */}
          {loggedIn === true && stage === "input" && (
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: SP_DIM, color: SP, border: `1px solid ${SP_BORDER}` }}>
                <SpotifyLogo size={10} /> Connected
              </span>
              <button className="text-[11px] text-muted-foreground hover:text-foreground underline"
                onClick={handleLogout}>Disconnect</button>
            </div>
          )}

          {/* URL input */}
          {loggedIn === true && (stage === "input" || stage === "fetching") && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Spotify playlist, album, or track link…"
                  value={url} onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                  className="flex-1 text-sm" disabled={stage === "fetching"} autoFocus
                />
                <Button size="sm" disabled={!url.trim() || stage === "fetching"}
                  style={url.trim() ? { background: SP, color: "#000" } : undefined}
                  className="gap-1.5 shrink-0" onClick={handleFetch}>
                  {stage === "fetching"
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…</>
                    : <><Search className="w-3.5 h-3.5" /> Fetch</>}
                </Button>
              </div>
              {fetchErr && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{fetchErr}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Paste any Spotify link. Downloads 5 tracks at once with full metadata + album art.
              </p>
            </div>
          )}

          {/* Track list */}
          {(stage === "preview" || isDownloading || isDone) && (
            <>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 border"
                style={{ background: SP_DIM, borderColor: SP_BORDER }}>
                <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: SP }}>
                  <Music className="w-4 h-4 text-black" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{plName}</p>
                  <p className="text-xs text-muted-foreground">{rows.length} track{rows.length !== 1 ? "s" : ""}</p>
                </div>
                {isDownloading && (
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold" style={{ color: SP }}>{overallPct}%</p>
                    <p className="text-[10px] text-muted-foreground">{doneCount}/{totalQueue}</p>
                  </div>
                )}
                {isDone && <span className="text-xs font-semibold" style={{ color: SP }}>Complete</span>}
              </div>

              {(isDownloading || isDone) && (
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${overallPct}%`, background: SP }} />
                </div>
              )}

              {stage === "preview" && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                  <span>{selectedCount} of {rows.length} selected</span>
                  <div className="flex gap-3">
                    <button className="hover:text-foreground" onClick={() => toggleAll(true)}  disabled={allSelected}>Select all</button>
                    <button className="hover:text-foreground" onClick={() => toggleAll(false)} disabled={noneSelected}>Deselect all</button>
                  </div>
                </div>
              )}

              <div className="overflow-y-auto max-h-[360px] min-h-0 flex-1">
                <div className="space-y-1 pr-2">
                  {rows.map((track, idx) => (
                    <div key={track.id}
                      className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
                        track.status === "done"        ? "bg-white/[0.03]" : "",
                        track.status === "error"       ? "bg-red-500/5 border border-red-500/15" : "",
                        track.status === "downloading" ? "border border-white/[0.08]" : "",
                        stage === "preview"            ? "hover:bg-white/[0.04] cursor-pointer" : "")}
                      onClick={stage === "preview" ? () => toggleRow(track.id) : undefined}>

                      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                        {stage === "preview" ? (
                          <div className={cn("w-4 h-4 rounded border flex items-center justify-center",
                            track.selected ? "border-transparent" : "border-white/20")}
                            style={track.selected ? { background: SP } : undefined}>
                            {track.selected && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3.5 6L8 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        ) : <StatusIcon status={track.status} />}
                      </div>

                      <span className="shrink-0 text-[10px] text-muted-foreground/50 w-5 text-right font-mono">{idx + 1}</span>

                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs font-medium truncate leading-tight",
                          track.status === "done"    ? "text-muted-foreground" : "text-foreground",
                          track.status === "skipped" ? "text-muted-foreground/50 line-through" : "")}>
                          {track.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 truncate">{track.artists}</p>
                        {track.status === "error" && track.errorMsg && (
                          <p className="text-[10px] text-red-400 truncate">{track.errorMsg}</p>
                        )}
                      </div>

                      <span className="text-[10px] text-muted-foreground/50 shrink-0 font-mono">{fmtDuration(track.durationMs)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {isDone && failedList.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-red-400">
                    Failed to download ({failedList.length}):
                  </p>
                  <ul className="space-y-0.5">
                    {failedList.map((f, i) => (
                      <li key={i} className="text-[11px] text-red-300/80">
                        <span className="font-medium">{f.name}</span>
                        {f.artist ? <span className="text-red-400/60"> by {f.artist}</span> : null}
                        {f.reason ? <p className="text-[10px] text-red-400/60 mt-0.5 break-all">{f.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {stage === "preview" && (
                  <>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
                      onClick={() => { setStage("input"); setRows([]); setPlName(""); }}>
                      <X className="w-3.5 h-3.5" /> Back
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5"
                      style={selectedCount > 0 ? { background: SP, color: "#000" } : undefined}
                      disabled={selectedCount === 0} onClick={startDownload}>
                      <Download className="w-3.5 h-3.5" />
                      Download {selectedCount} track{selectedCount !== 1 ? "s" : ""}
                    </Button>
                  </>
                )}

                {isDownloading && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-red-400 hover:text-red-300"
                    onClick={() => { cancelRef.current = true; }}>
                    <X className="w-3.5 h-3.5" /> Cancel remaining
                  </Button>
                )}

                {isDone && (
                  <>
                    <Button variant="ghost" size="sm"
                      onClick={() => { setStage("input"); setUrl(""); setRows([]); setPlName(""); setDoneCount(0); setTotalQueue(0); setFailedList([]); downloadedTrackIds.current = []; }}>
                      Download another
                    </Button>
                    <Button size="sm" style={{ background: SP, color: "#000" }} onClick={() => onOpenChange(false)}>
                      Done
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
