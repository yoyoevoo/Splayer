import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Music, Search, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

// ── Spotify green palette ─────────────────────────────────────────────────────
const SP = "#1DB954";
const SP_DIM = "rgba(29,185,84,0.15)";
const SP_BORDER = "rgba(29,185,84,0.3)";

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_CLIENT_ID  = "spotify-client-id";
const LS_CLIENT_SEC = "spotify-client-secret";

// ── Types ─────────────────────────────────────────────────────────────────────
type TrackStatus = "idle" | "searching" | "downloading" | "done" | "error" | "skipped";

interface TrackRow {
  id:         string;
  name:       string;
  artists:    string;
  durationMs: number;
  selected:   boolean;
  status:     TrackStatus;
  progress:   number;
  errorMsg:   string;
}

type Stage = "input" | "fetching" | "preview" | "downloading" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120);
}

// ── Spotify logo SVG (inline) ─────────────────────────────────────────────────
function SpotifyLogo({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.32a.75.75 0 0 1-1.032.25c-2.823-1.725-6.38-2.115-10.567-1.158a.75.75 0 0 1-.334-1.463c4.58-1.047 8.508-.597 11.682 1.34a.75.75 0 0 1 .251 1.031zm1.473-3.276a.937.937 0 0 1-1.288.308C14.96 12.525 11.1 12 7.2 13.062a.938.938 0 0 1-.468-1.815C11.17 10.07 15.48 10.655 18.68 12.756a.938.938 0 0 1 .309 1.288zm.126-3.408c-3.35-1.99-8.875-2.172-12.073-1.201a1.124 1.124 0 0 1-.65-2.15c3.671-1.113 9.77-.898 13.626 1.39a1.125 1.125 0 1 1-1.127 1.95l.224-.989z" />
    </svg>
  );
}

// ── Credential row ────────────────────────────────────────────────────────────
function CredentialSection({
  clientId, setClientId,
  clientSecret, setClientSecret,
}: {
  clientId: string; setClientId: (v: string) => void;
  clientSecret: string; setClientSecret: (v: string) => void;
}) {
  const [open, setOpen] = useState(!clientId || !clientSecret);

  function save() {
    try {
      localStorage.setItem(LS_CLIENT_ID,  clientId.trim());
      localStorage.setItem(LS_CLIENT_SEC, clientSecret.trim());
    } catch {}
    setOpen(false);
  }

  return (
    <div className="rounded-lg border border-white/[0.07] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-1.5" style={{ color: SP }}>
          <SpotifyLogo size={13} />
          Spotify credentials
        </span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5" />
          : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/[0.06]">
          <p className="text-[11px] text-muted-foreground mt-2">
            Create a free app at{" "}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="underline hover:opacity-80"
              style={{ color: SP }}
            >
              developer.spotify.com/dashboard
            </a>
            {" "}to get your Client ID and Secret.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 h-8 text-xs font-mono"
            />
            <Input
              type="password"
              placeholder="Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="flex-1 h-8 text-xs font-mono"
            />
            <Button
              size="sm"
              className="h-8 px-3 text-xs shrink-0"
              style={{ background: SP, color: "#000" }}
              onClick={save}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Track status icon ─────────────────────────────────────────────────────────
function StatusIcon({ status, progress }: { status: TrackStatus; progress: number }) {
  if (status === "done")      return <span className="text-[11px] font-bold" style={{ color: SP }}>✓</span>;
  if (status === "error")     return <span className="text-[11px] text-red-400">✗</span>;
  if (status === "skipped")   return <span className="text-[11px] text-muted-foreground">—</span>;
  if (status === "searching") return <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />;
  if (status === "downloading") {
    return (
      <div className="relative flex items-center justify-center w-5 h-5">
        <svg className="absolute inset-0 w-5 h-5 -rotate-90" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <circle
            cx="10" cy="10" r="8" fill="none"
            stroke={SP} strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 8}`}
            strokeDashoffset={`${2 * Math.PI * 8 * (1 - progress / 100)}`}
            strokeLinecap="round"
          />
        </svg>
        <Download className="w-2.5 h-2.5" style={{ color: SP }} />
      </div>
    );
  }
  return null;
}

// ── Main dialog ───────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SpotifyPlaylistDialog({ open, onOpenChange }: Props) {
  const { addFiles, updateTrackInfo } = usePlayer();
  const api = window.electronAPI;

  const [clientId,     setClientId]     = useState(() => { try { return localStorage.getItem(LS_CLIENT_ID)  ?? ""; } catch { return ""; } });
  const [clientSecret, setClientSecret] = useState(() => { try { return localStorage.getItem(LS_CLIENT_SEC) ?? ""; } catch { return ""; } });

  const [stage,     setStage]     = useState<Stage>("input");
  const [url,       setUrl]       = useState("");
  const [fetchErr,  setFetchErr]  = useState("");
  const [plName,    setPlName]    = useState("");
  const [rows,      setRows]      = useState<TrackRow[]>([]);

  // overall counters
  const [doneCount,  setDoneCount]  = useState(0);
  const [totalQueue, setTotalQueue] = useState(0);

  const cancelRef    = useRef(false);
  const progressUnsub = useRef<(() => void) | null>(null);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      progressUnsub.current?.();
      progressUnsub.current = null;
      setTimeout(() => {
        setStage("input");
        setUrl("");
        setFetchErr("");
        setPlName("");
        setRows([]);
        setDoneCount(0);
        setTotalQueue(0);
        cancelRef.current = false;
      }, 200);
    }
  }, [open]);

  // ── Fetch playlist ──────────────────────────────────────────────────────────
  async function handleFetch() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!clientId.trim() || !clientSecret.trim()) {
      setFetchErr("Please save your Spotify Client ID and Secret first.");
      return;
    }
    setFetchErr("");
    setStage("fetching");

    const result = await api?.spotifyFetchPlaylist({
      playlistUrl:  trimmed,
      clientId:     clientId.trim(),
      clientSecret: clientSecret.trim(),
    });

    if (!result || "error" in result) {
      setFetchErr((result as { error: string })?.error ?? "Unknown error");
      setStage("input");
      return;
    }

    setPlName(result.playlistName);
    setRows(
      result.tracks.map((t) => ({
        id:         t.id,
        name:       t.name,
        artists:    t.artists,
        durationMs: t.durationMs,
        selected:   true,
        status:     "idle",
        progress:   0,
        errorMsg:   "",
      }))
    );
    setStage("preview");
  }

  // ── Toggle selection ────────────────────────────────────────────────────────
  function toggleAll(val: boolean) {
    setRows((r) => r.map((t) => ({ ...t, selected: val })));
  }

  function toggleRow(id: string) {
    setRows((r) => r.map((t) => t.id === id ? { ...t, selected: !t.selected } : t));
  }

  // ── Download queue ──────────────────────────────────────────────────────────
  async function startDownload() {
    cancelRef.current = false;
    const downloadsDir = localStorage.getItem("settings-downloads-path") ?? "";
    const selected     = rows.filter((r) => r.selected);

    if (selected.length === 0) return;

    setTotalQueue(selected.length);
    setDoneCount(0);
    setStage("downloading");

    let done = 0;

    for (const track of selected) {
      if (cancelRef.current) {
        updateRowStatus(track.id, "skipped", 0, "Cancelled");
        continue;
      }

      // ── Search YouTube ──
      updateRowStatus(track.id, "searching", 0, "");
      const searchQuery = `${track.name} ${track.artists} official audio`;

      let videoUrl = "";
      try {
        const searchRes = await api?.ytSearch(searchQuery);
        if (!searchRes || "error" in searchRes || searchRes.length === 0) {
          updateRowStatus(track.id, "error", 0, "No YouTube match found");
          done++;
          setDoneCount(done);
          continue;
        }
        videoUrl = searchRes[0].url;
      } catch (e: unknown) {
        updateRowStatus(track.id, "error", 0, String((e as Error)?.message ?? e));
        done++;
        setDoneCount(done);
        continue;
      }

      if (cancelRef.current) {
        updateRowStatus(track.id, "skipped", 0, "Cancelled");
        continue;
      }

      // ── Download audio ──
      updateRowStatus(track.id, "downloading", 0, "");

      const unsub = api?.onYtProgress(({ percent }) => {
        updateRowProgress(track.id, percent);
      });
      progressUnsub.current = unsub ?? null;

      let downloadResult: Awaited<ReturnType<NonNullable<typeof api>["ytDownload"]>> | null = null;
      try {
        downloadResult = await api?.ytDownload(videoUrl) ?? null;
      } catch (e: unknown) {
        unsub?.();
        progressUnsub.current = null;
        updateRowStatus(track.id, "error", 0, String((e as Error)?.message ?? e));
        done++;
        setDoneCount(done);
        continue;
      }

      unsub?.();
      progressUnsub.current = null;

      if (!downloadResult || "error" in downloadResult) {
        updateRowStatus(track.id, "error", 0, (downloadResult as { error: string })?.error ?? "Download failed");
        done++;
        setDoneCount(done);
        continue;
      }

      // ── Save file + add to library ──
      try {
        const baseName    = sanitizeFilename(track.name);
        const filename    = `${baseName}.${downloadResult.ext}`;
        const bytes       = new Uint8Array(downloadResult.bytes);
        const blob        = new Blob([bytes], { type: downloadResult.mimeType });
        const file        = new File([blob], filename, { type: downloadResult.mimeType });

        if (downloadsDir && api?.writeFile) {
          await api.writeFile(`${downloadsDir}/${filename}`, bytes);
        }

        await addFiles([file]);
        const trackId = `${file.name}-${file.size}`;
        await updateTrackInfo(trackId, {
          title:  track.name,
          artist: track.artists,
        });

        addDownloadRecord({
          id:           `spotify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          trackId,
          title:        track.name,
          artist:       track.artists,
          ext:          downloadResult.ext,
          fileSize:     bytes.byteLength,
          filePath:     downloadsDir ? `${downloadsDir}/${filename}` : null,
          downloadedAt: Date.now(),
          type:         "audio",
        });

        updateRowStatus(track.id, "done", 100, "");
      } catch (e: unknown) {
        updateRowStatus(track.id, "error", 0, String((e as Error)?.message ?? e));
      }

      done++;
      setDoneCount(done);
    }

    setStage("done");
  }

  function updateRowStatus(id: string, status: TrackStatus, progress: number, errorMsg: string) {
    setRows((r) => r.map((t) => t.id === id ? { ...t, status, progress, errorMsg } : t));
  }

  function updateRowProgress(id: string, progress: number) {
    setRows((r) => r.map((t) => t.id === id ? { ...t, progress } : t));
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected   = rows.length > 0 && rows.every((r) => r.selected);
  const noneSelected  = rows.every((r) => !r.selected);
  const isDownloading = stage === "downloading";
  const isDone        = stage === "done";

  const overallPct = totalQueue > 0 ? Math.round((doneCount / totalQueue) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span style={{ color: SP }}>
              <SpotifyLogo size={16} />
            </span>
            Spotify Playlist Downloader
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* ── Credentials ── */}
          <CredentialSection
            clientId={clientId} setClientId={setClientId}
            clientSecret={clientSecret} setClientSecret={setClientSecret}
          />

          {/* ── URL input ── */}
          {(stage === "input" || stage === "fetching") && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Spotify playlist link…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                  className="flex-1 text-sm"
                  disabled={stage === "fetching"}
                />
                <Button
                  size="sm"
                  disabled={!url.trim() || stage === "fetching"}
                  onClick={handleFetch}
                  style={url.trim() ? { background: SP, color: "#000" } : undefined}
                  className="gap-1.5 shrink-0"
                >
                  {stage === "fetching"
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…</>
                    : <><Search className="w-3.5 h-3.5" /> Fetch</>}
                </Button>
              </div>
              {fetchErr && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                  {fetchErr}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Paste any public Spotify playlist URL. Each track will be found on YouTube and downloaded as MP3.
              </p>
            </div>
          )}

          {/* ── Preview / Download stage ── */}
          {(stage === "preview" || isDownloading || isDone) && (
            <>
              {/* Playlist header */}
              <div
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 border"
                style={{ background: SP_DIM, borderColor: SP_BORDER }}
              >
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: SP }}
                >
                  <Music className="w-4 h-4 text-black" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{plName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rows.length} track{rows.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {isDownloading && (
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold" style={{ color: SP }}>{overallPct}%</p>
                    <p className="text-[10px] text-muted-foreground">{doneCount}/{totalQueue}</p>
                  </div>
                )}
                {isDone && (
                  <span className="text-xs font-semibold" style={{ color: SP }}>Complete</span>
                )}
              </div>

              {/* Overall progress bar */}
              {(isDownloading || isDone) && (
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${overallPct}%`, background: SP }}
                  />
                </div>
              )}

              {/* Select all / none bar (preview only) */}
              {stage === "preview" && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                  <span>{selectedCount} of {rows.length} selected</span>
                  <div className="flex items-center gap-3">
                    <button
                      className="hover:text-foreground transition-colors"
                      onClick={() => toggleAll(true)}
                      disabled={allSelected}
                    >
                      Select all
                    </button>
                    <button
                      className="hover:text-foreground transition-colors"
                      onClick={() => toggleAll(false)}
                      disabled={noneSelected}
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
              )}

              {/* Track list */}
              <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
                <div className="space-y-1 pr-2">
                  {rows.map((track, idx) => (
                    <div
                      key={track.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
                        track.status === "done"      ? "bg-white/[0.03]" : "",
                        track.status === "error"     ? "bg-red-500/5 border border-red-500/15" : "",
                        track.status === "downloading" || track.status === "searching"
                          ? "border border-white/[0.08]"
                          : "",
                        stage === "preview" ? "hover:bg-white/[0.04] cursor-pointer" : "",
                      )}
                      onClick={stage === "preview" ? () => toggleRow(track.id) : undefined}
                    >
                      {/* Checkbox or status icon */}
                      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                        {stage === "preview" ? (
                          <div
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                              track.selected
                                ? "border-transparent"
                                : "border-white/20 bg-transparent",
                            )}
                            style={track.selected ? { background: SP, borderColor: SP } : undefined}
                          >
                            {track.selected && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3.5 6L8 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        ) : (
                          <StatusIcon status={track.status} progress={track.progress} />
                        )}
                      </div>

                      {/* Track number */}
                      <span className="shrink-0 text-[10px] text-muted-foreground/50 w-5 text-right font-mono select-none">
                        {idx + 1}
                      </span>

                      {/* Title + artist */}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-xs font-medium truncate leading-tight",
                          track.status === "done"    ? "text-muted-foreground" : "text-foreground",
                          track.status === "skipped" ? "text-muted-foreground/50 line-through" : "",
                        )}>
                          {track.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 truncate">
                          {track.artists}
                        </p>
                        {track.status === "error" && track.errorMsg && (
                          <p className="text-[10px] text-red-400 truncate">{track.errorMsg}</p>
                        )}
                      </div>

                      {/* Duration */}
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 font-mono">
                        {fmtDuration(track.durationMs)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                {stage === "preview" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => { setStage("input"); setRows([]); setPlName(""); }}
                    >
                      <X className="w-3.5 h-3.5" />
                      Back
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      style={selectedCount > 0 ? { background: SP, color: "#000" } : undefined}
                      disabled={selectedCount === 0}
                      onClick={startDownload}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download {selectedCount} track{selectedCount !== 1 ? "s" : ""}
                    </Button>
                  </>
                )}

                {isDownloading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-red-400 hover:text-red-300"
                    onClick={() => { cancelRef.current = true; }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel remaining
                  </Button>
                )}

                {isDone && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setStage("input"); setUrl(""); setRows([]); setPlName(""); setDoneCount(0); setTotalQueue(0); }}
                    >
                      Download another playlist
                    </Button>
                    <Button
                      size="sm"
                      style={{ background: SP, color: "#000" }}
                      onClick={() => onOpenChange(false)}
                    >
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
