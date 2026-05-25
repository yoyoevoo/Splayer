import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Plus,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/types";
import { usePlayer } from "@/lib/player-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type TrimOp = { kind: "trim"; start: number; end: number };
type CutOp  = { kind: "cut";  start: number; end: number };
type Op = TrimOp | CutOp;

type ExtraTrack = { id: string; name: string; buffer: AudioBuffer; duration: number };
type Snapshot   = { ops: Op[]; extras: ExtraTrack[] };

// ── Audio helpers ─────────────────────────────────────────────────────────────

function sliceBuffer(src: AudioBuffer, start: number, end: number, ctx: AudioContext): AudioBuffer {
  const sr = src.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(src.length, Math.floor(end * sr));
  const len = Math.max(1, s1 - s0);
  const out = ctx.createBuffer(src.numberOfChannels, len, sr);
  for (let c = 0; c < src.numberOfChannels; c++)
    out.copyToChannel(src.getChannelData(c).slice(s0, s1), c);
  return out;
}

function cutBuffer(src: AudioBuffer, start: number, end: number, ctx: AudioContext): AudioBuffer {
  const sr = src.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(src.length, Math.floor(end * sr));
  const newLen = Math.max(1, src.length - (s1 - s0));
  const out = ctx.createBuffer(src.numberOfChannels, newLen, sr);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const data = src.getChannelData(c);
    const dst  = out.getChannelData(c);
    dst.set(data.slice(0, s0));
    dst.set(data.slice(s1), s0);
  }
  return out;
}

function concatBuffers(bufs: AudioBuffer[], ctx: AudioContext): AudioBuffer {
  const nc  = Math.max(...bufs.map((b) => b.numberOfChannels));
  const len = bufs.reduce((a, b) => a + b.length, 0);
  const sr  = bufs[0].sampleRate;
  const out = ctx.createBuffer(nc, len, sr);
  let off   = 0;
  for (const buf of bufs) {
    for (let c = 0; c < nc; c++) {
      const src = c < buf.numberOfChannels
        ? buf.getChannelData(c)
        : new Float32Array(buf.length);
      out.copyToChannel(src, c, off);
    }
    off += buf.length;
  }
  return out;
}

function applyOps(source: AudioBuffer, ops: Op[], ctx: AudioContext): AudioBuffer {
  let buf = source;
  for (const op of ops) {
    buf = op.kind === "trim"
      ? sliceBuffer(buf, op.start, op.end, ctx)
      : cutBuffer(buf, op.start, op.end, ctx);
  }
  return buf;
}

function applyFades(src: AudioBuffer, fadeIn: number, fadeOut: number, ctx: AudioContext): AudioBuffer {
  const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
  const fiSamples = Math.floor(fadeIn  * src.sampleRate);
  const foSamples = Math.floor(fadeOut * src.sampleRate);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const s = src.getChannelData(c);
    const d = out.getChannelData(c);
    d.set(s);
    for (let i = 0; i < fiSamples && i < d.length; i++)
      d[i] *= i / fiSamples;
    for (let i = 0; i < foSamples && i < d.length; i++)
      d[d.length - 1 - i] *= i / foSamples;
  }
  return out;
}

// ── WAV encoding ──────────────────────────────────────────────────────────────

function encodeWav(buf: AudioBuffer): Uint8Array {
  const nc = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const ns = buf.length;
  const block = nc * 2;
  const dataSize = ns * block;
  const ab = new ArrayBuffer(44 + dataSize);
  const v  = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * block, true); v.setUint16(32, block, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < ns; i++)
    for (let c = 0; c < nc; c++) {
      const x = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      v.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      off += 2;
    }
  return new Uint8Array(ab);
}

// ── Peak computation ──────────────────────────────────────────────────────────

type Peaks = { mins: Float32Array; maxs: Float32Array };

function computePeaks(buf: AudioBuffer, buckets: number): Peaks {
  const nc  = buf.numberOfChannels;
  const spb = buf.length / buckets;
  const mins = new Float32Array(buckets);
  const maxs = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    const s0 = Math.floor(i * spb);
    const s1 = Math.min(buf.length, Math.floor((i + 1) * spb));
    let lo = 0, hi = 0;
    for (let s = s0; s < s1; s++) {
      let v = 0;
      for (let c = 0; c < nc; c++) v += buf.getChannelData(c)[s];
      v /= nc;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    mins[i] = lo;
    maxs[i] = hi;
  }
  return { mins, maxs };
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

const HANDLE_W = 14; // px grab radius for handles (must be ≥12 for easy grabbing)

function drawCanvas(
  canvas: HTMLCanvasElement,
  peaks: Peaks | null,
  selFrac: [number, number],  // [0..1, 0..1]
  playFrac: number,            // 0..1
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height, mid = H / 2;

  ctx.fillStyle = "#0d0d18";
  ctx.fillRect(0, 0, W, H);

  if (!peaks) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, mid - 1, W, 2);
    return;
  }

  const [sf, ef] = selFrac;
  const sx = Math.round(sf * W);
  const ex = Math.round(ef * W);

  // Selection tint
  ctx.fillStyle = "rgba(234,100,20,0.10)";
  ctx.fillRect(sx, 0, ex - sx, H);

  // Waveform bars
  for (let i = 0; i < W; i++) {
    const inSel = i >= sx && i <= ex;
    ctx.fillStyle = inSel ? "rgba(234,100,20,0.90)" : "rgba(255,255,255,0.22)";
    const yTop = mid - Math.abs(peaks.maxs[i]) * mid * 0.92;
    const yBot = mid + Math.abs(peaks.mins[i]) * mid * 0.92;
    ctx.fillRect(i, yTop, 1, Math.max(1, yBot - yTop));
  }

  // Full-height handle lines + top and bottom grip tabs
  for (const hx of [sx, ex]) {
    ctx.fillStyle = "rgba(234,100,20,1)";
    // Full-height vertical line
    ctx.fillRect(hx - 1, 0, 2, H);

    const hw = HANDLE_W;
    const gh = 18; // grip rectangle height
    const ta = 8;  // triangle arrow height

    // ── Top grip ──────────────────────────────────────────
    ctx.fillRect(hx - hw / 2, 0, hw, gh);
    ctx.beginPath();
    ctx.moveTo(hx - hw / 2, gh);
    ctx.lineTo(hx + hw / 2, gh);
    ctx.lineTo(hx, gh + ta);
    ctx.closePath();
    ctx.fill();

    // ── Bottom grip ───────────────────────────────────────
    ctx.fillRect(hx - hw / 2, H - gh, hw, gh);
    ctx.beginPath();
    ctx.moveTo(hx - hw / 2, H - gh);
    ctx.lineTo(hx + hw / 2, H - gh);
    ctx.lineTo(hx, H - gh - ta);
    ctx.closePath();
    ctx.fill();
  }

  // Playhead
  const px = Math.round(playFrac * W);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(px, 0, 1, H);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 20;

interface EditorPageProps {
  track: Track;
  onClose: () => void;
}

export function EditorPage({ track, onClose }: EditorPageProps) {
  const { addFiles, volume, muted } = usePlayer();

  // ── Audio decode ─────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [source, setSource] = useState<AudioBuffer | null>(null);
  const [loadErr, setLoadErr]  = useState<string | null>(null);

  // ── Edit state ───────────────────────────────────────────────────────────
  const [ops,        setOps]    = useState<Op[]>([]);
  const [extras,     setExtras] = useState<ExtraTrack[]>([]);
  const [computed,   setComputed] = useState<AudioBuffer | null>(null);
  const [undoStack,  setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack,  setRedoStack] = useState<Snapshot[]>([]);

  // ── Selection (seconds in computed buffer time) ──────────────────────────
  const [selStart, setSelStart] = useState(0);
  const [selEnd,   setSelEnd]   = useState(0);

  // ── Fades ────────────────────────────────────────────────────────────────
  const [fadeIn,  setFadeIn]  = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  // ── Playback ─────────────────────────────────────────────────────────────
  const srcNodeRef    = useRef<AudioBufferSourceNode | null>(null);
  const startCtxTime  = useRef(0);
  const startOffset   = useRef(0);
  const [isPlaying,   setIsPlaying]  = useState(false);
  const [playhead,    setPlayhead]   = useState(0); // seconds

  // ── Canvas ───────────────────────────────────────────────────────────────
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const peaksRef   = useRef<Peaks | null>(null);
  const selRef     = useRef([0, 1]); // fractions, synced from state
  const playRef    = useRef(0);      // fraction, synced from playhead
  const dragRef    = useRef<"left" | "right" | null>(null);
  const rafRef     = useRef<number>(0);

  // ── Export dialog ────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState(() => {
    const base = (track.title || track.file?.name || "audio").replace(/\.[^.]+$/, "");
    return `${base}_edited`;
  });
  const [exportFmt,     setExportFmt]     = useState<"mp3" | "wav" | "flac" | "ogg">("mp3");
  const [exportQuality, setExportQuality] = useState<"128" | "192" | "320">("192");
  const [exporting,     setExporting]     = useState(false);
  const [exportPct,     setExportPct]     = useState(0);
  const [exportDone,    setExportDone]    = useState<string | null>(null);
  const [exportErr,     setExportErr]     = useState<string | null>(null);

  // ── File input for merge ─────────────────────────────────────────────────
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const duration  = computed?.duration ?? 0;
  const hasEdits  = undoStack.length > 0;

  // ── Decode source audio ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        // Route playback through a GainNode; set volume immediately so the
        // first playback is already at the correct level (the volume-sync
        // effect runs while gainNodeRef is still null on first render).
        const gain = ctx.createGain();
        gain.gain.value = muted ? 0 : volume;
        gain.connect(ctx.destination);
        gainNodeRef.current = gain;

        let ab: ArrayBuffer;
        // Bug 1: correct priority — path → real file blob → URL
        // Library-scan tracks have track.file.size === 0 (placeholder) so check size first
        if (track.path && window.electronAPI) {
          const r = await window.electronAPI.readFile(track.path);
          ab = (r.bytes as Uint8Array).buffer as ArrayBuffer;
        } else if (track.file && track.file.size > 0) {
          ab = await track.file.arrayBuffer();
        } else if (track.url) {
          ab = await fetch(track.url).then((r) => r.arrayBuffer());
        } else {
          throw new Error("No audio source for this track");
        }

        if (cancelled) return;
        const buf = await ctx.decodeAudioData(ab);
        if (cancelled) return;
        setSource(buf);
        setComputed(buf);
        setSelStart(0);
        setSelEnd(buf.duration);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load audio");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Bug 5: sync editor gain to main player volume ────────────────────────
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = muted ? 0 : volume;
    }
  }, [volume, muted]);

  // ── Re-derive computed buffer when ops or extras change ──────────────────
  useEffect(() => {
    if (!source || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const main = applyOps(source, ops, ctx);
    const all  = extras.length ? concatBuffers([main, ...extras.map((e) => e.buffer)], ctx) : main;
    setComputed(all);
  }, [source, ops, extras]);

  // ── Compute peaks when computed buffer or canvas width changes ───────────
  useEffect(() => {
    if (!computed || !canvasRef.current) return;
    const canvas = canvasRef.current;
    peaksRef.current = computePeaks(computed, canvas.width);
  }, [computed]);

  // ── ResizeObserver: keep canvas width in sync with container ────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      if (computed) peaksRef.current = computePeaks(computed, canvas.width);
    });
    ro.observe(wrap);
    canvas.width  = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    return () => ro.disconnect();
  }, [computed]);

  // ── Animation loop: draw canvas ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function tick() {
      // Update playhead from AudioContext clock
      if (isPlaying && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startCtxTime.current;
        const pos = Math.min(duration, startOffset.current + elapsed);
        setPlayhead(pos);
        playRef.current = duration > 0 ? pos / duration : 0;
      }

      selRef.current = duration > 0
        ? [selStart / duration, selEnd / duration]
        : [0, 1];

      drawCanvas(canvas, peaksRef.current, selRef.current as [number, number], playRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, duration, selStart, selEnd]);

  // Keep playRef in sync between RAF ticks
  useEffect(() => {
    playRef.current = duration > 0 ? playhead / duration : 0;
  }, [playhead, duration]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // Capture phase + stopImmediatePropagation swallows ALL keys from other
  // handlers while the editor is open. Only these pass through with action:
  //   Space        → play/pause in editor
  //   Ctrl+Z       → undo
  //   Ctrl+Shift+Z → redo
  //   Escape       → back to library (with unsaved-changes warning)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.stopImmediatePropagation(); // block main-player handlers regardless
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); redo(); }
      else if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "Escape") { e.preventDefault(); handleBack(); }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [ops, extras, undoStack, redoStack, isPlaying, computed, handleBack]);

  // ── Playback ─────────────────────────────────────────────────────────────
  function playFrom(offsetSecs: number) {
    const ctx = audioCtxRef.current;
    if (!ctx || !computed) return;
    stopNode();
    const node = ctx.createBufferSource();
    node.buffer = computed;
    node.connect(gainNodeRef.current ?? ctx.destination); // Bug 5: route through gain
    const clampedOffset = Math.max(0, Math.min(computed.duration - 0.01, offsetSecs));
    node.start(0, clampedOffset);
    node.onended = () => {
      setIsPlaying(false);
      setPlayhead(0);
    };
    srcNodeRef.current = node;
    startCtxTime.current = ctx.currentTime;
    startOffset.current  = clampedOffset;
    setIsPlaying(true);
  }

  function stopNode() {
    if (srcNodeRef.current) {
      try { srcNodeRef.current.stop(); } catch {}
      srcNodeRef.current.disconnect();
      srcNodeRef.current = null;
    }
  }

  function togglePlay() {
    if (isPlaying) {
      const elapsed = (audioCtxRef.current?.currentTime ?? 0) - startCtxTime.current;
      const pos = Math.min(duration, startOffset.current + elapsed);
      stopNode();
      setIsPlaying(false);
      setPlayhead(pos);
    } else {
      playFrom(playhead);
    }
  }

  function stop() {
    stopNode();
    setIsPlaying(false);
    setPlayhead(0);
  }

  function seekTo(secs: number) {
    const wasPlaying = isPlaying;
    stopNode();
    setIsPlaying(false);
    setPlayhead(secs);
    if (wasPlaying) playFrom(secs);
  }

  // Cleanup on unmount
  useEffect(() => () => { stopNode(); cancelAnimationFrame(rafRef.current); }, []);

  // ── Canvas mouse interaction ──────────────────────────────────────────────
  function canvasXtoSec(e: React.MouseEvent<HTMLCanvasElement>): number {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    return (x / canvas.width) * duration;
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!computed || duration === 0) return;
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    const W = canvas.width;

    const lx = (selStart / duration) * W;
    const rx = (selEnd   / duration) * W;

    if (Math.abs(x - lx) <= HANDLE_W) {
      dragRef.current = "left";
    } else if (Math.abs(x - rx) <= HANDLE_W) {
      dragRef.current = "right";
    } else {
      seekTo((x / W) * duration);
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;

    // Update cursor and tooltip based on proximity to handles
    if (!dragRef.current && computed && duration > 0) {
      const rect  = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const x  = (e.clientX - rect.left) * scaleX;
      const W  = canvas.width;
      const lx = (selStart / duration) * W;
      const rx = (selEnd   / duration) * W;
      if (Math.abs(x - lx) <= HANDLE_W) {
        canvas.style.cursor = "ew-resize";
        canvas.title = "Drag to set start";
      } else if (Math.abs(x - rx) <= HANDLE_W) {
        canvas.style.cursor = "ew-resize";
        canvas.title = "Drag to set end";
      } else {
        canvas.style.cursor = "crosshair";
        canvas.title = "";
      }
    }

    if (!dragRef.current || duration === 0) return;
    const secs = Math.max(0, Math.min(duration, canvasXtoSec(e)));
    if (dragRef.current === "left")  setSelStart(Math.min(secs, selEnd   - 0.05));
    if (dragRef.current === "right") setSelEnd(  Math.max(secs, selStart + 0.05));
  }

  function handleMouseUp() {
    dragRef.current = null;
    // Restore crosshair after drag ends
    if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
  }

  // ── Edit operations ───────────────────────────────────────────────────────
  function pushHistory() {
    setUndoStack((s) => [...s.slice(-MAX_HISTORY + 1), { ops, extras }]);
    setRedoStack([]);
  }

  function undo() {
    setUndoStack((s) => {
      if (!s.length) return s;
      const snap = s[s.length - 1];
      setRedoStack((r) => [...r, { ops, extras }]);
      setOps(snap.ops);
      setExtras(snap.extras);
      stop();
      return s.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((r) => {
      if (!r.length) return r;
      const snap = r[r.length - 1];
      setUndoStack((u) => [...u, { ops, extras }]);
      setOps(snap.ops);
      setExtras(snap.extras);
      stop();
      return r.slice(0, -1);
    });
  }

  function doTrim() {
    pushHistory();
    const dur = computed?.duration ?? 0;
    setOps((prev) => [...prev, { kind: "trim", start: selStart, end: selEnd }]);
    // After trim, reset selection to full new buffer
    // The new duration will be (selEnd - selStart); we'll reset in the next render
    setSelStart(0);
    setSelEnd(selEnd - selStart);
    stop();
  }

  function doCut() {
    pushHistory();
    setOps((prev) => [...prev, { kind: "cut", start: selStart, end: selEnd }]);
    const newDur = (computed?.duration ?? 0) - (selEnd - selStart);
    setSelStart(0);
    setSelEnd(Math.max(0, newDur));
    stop();
  }

  // ── Merge ────────────────────────────────────────────────────────────────
  async function handleMergeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !audioCtxRef.current) return;
    e.target.value = "";
    try {
      const ab  = await file.arrayBuffer();
      const buf = await audioCtxRef.current.decodeAudioData(ab);
      pushHistory();
      setExtras((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name: file.name, buffer: buf, duration: buf.duration },
      ]);
    } catch {
      // silently ignore decode errors for now
    }
  }

  function removeExtra(id: string) {
    pushHistory();
    setExtras((prev) => prev.filter((e) => e.id !== id));
  }

  // ── Back ─────────────────────────────────────────────────────────────────
  function handleBack() {
    if (hasEdits && !window.confirm("You have unsaved edits. Go back without exporting?")) return;
    stop();
    onClose();
  }

  // ── Export ───────────────────────────────────────────────────────────────
  async function runExport() {
    if (!computed || !audioCtxRef.current || !window.electronAPI) return;
    setExporting(true);
    setExportPct(0);
    setExportDone(null);
    setExportErr(null);

    let unsub: (() => void) | undefined;
    try {
      if (window.electronAPI.onEditorExportProgress) {
        unsub = window.electronAPI.onEditorExportProgress(({ percent }) =>
          setExportPct(percent));
      }

      // Bug 4: fades are applied by ffmpeg's afade filter in main process
      const wavBytes = encodeWav(computed);
      const result   = await (window.electronAPI as any).editorExport({
        wavBytes,
        format:   exportFmt,
        quality:  exportQuality,
        fileName: exportName.trim() || "export",
        fadeIn,
        fadeOut,
      });

      if ("error" in result) { setExportErr(result.error); return; }

      setExportPct(100);
      setExportDone(result.outputPath);

      // Add to library
      try {
        const fd  = await window.electronAPI.readFile(result.outputPath);
        const ext = exportFmt;
        const mime: Record<string, string> = {
          mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg",
        };
        const name = result.outputPath.split(/[\\/]/).pop() ?? `${exportName}.${ext}`;
        await addFiles([new File([fd.bytes as BlobPart], name, { type: mime[ext] })]);
      } catch { /* library add failed — not fatal */ }
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      unsub?.();
      setExporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadErr) return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0d0d18] text-white gap-4">
      <p className="text-lg font-medium">Could not load audio</p>
      <p className="text-sm text-white/50">{loadErr}</p>
      <Button onClick={onClose} variant="outline">Back to Library</Button>
    </div>
  );

  const canEdit = !!computed && duration > 0;
  const selDur  = selEnd - selStart;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d18] text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 shrink-0">
        <Button size="sm" variant="ghost" onClick={handleBack}
          className="gap-1.5 text-white/60 hover:text-white hover:bg-white/10">
          <ArrowLeft className="w-4 h-4" />
          Library
        </Button>

        <div className="w-px h-4 bg-white/10 mx-1" />

        <span className="text-sm font-medium truncate max-w-xs text-white/90">
          {track.title || track.file?.name || "Audio"}
        </span>
        {hasEdits && <span className="text-xs text-orange-400">• edited</span>}

        <div className="flex-1" />

        <Button size="sm" variant="ghost" onClick={undo} disabled={!undoStack.length}
          title="Undo (Ctrl+Z)"
          className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30">
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={redo} disabled={!redoStack.length}
          title="Redo (Ctrl+Shift+Z)"
          className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30">
          <Redo2 className="w-4 h-4" />
        </Button>

        <Button size="sm"
          onClick={() => { setExportOpen(true); setExportDone(null); setExportErr(null); }}
          disabled={!canEdit}
          className="gap-1.5 bg-orange-600 hover:bg-orange-500 text-white ml-1">
          <Upload className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col gap-4 px-4 py-4 min-h-0 overflow-y-auto">

        {/* Waveform card */}
        <div className="flex flex-col gap-1">
          <div
            ref={wrapRef}
            className="relative rounded-xl overflow-hidden bg-[#0a0a14] border border-white/8"
            style={{ height: 140 }}
          >
            {!computed && !loadErr && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="block w-full h-full"
              style={{ cursor: "crosshair" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>

          {/* Selection times */}
          <div className="flex justify-between text-xs text-white/40 px-1 select-none">
            <span className="text-orange-400/90">{fmt(selStart)}</span>
            <span>
              Selection: <span className="text-white/70">{fmt(selDur)}</span>
              {" "}of{" "}
              <span className="text-white/70">{fmt(duration)}</span>
            </span>
            <span className="text-orange-400/90">{fmt(selEnd)}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/8">
          <Button size="sm" variant="ghost" onClick={stop} disabled={!canEdit}
            className="text-white/60 hover:text-white hover:bg-white/10" title="Stop">
            <Square className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={togglePlay}
            disabled={!canEdit}
            className={cn(
              "gap-2 min-w-[80px]",
              isPlaying
                ? "bg-white/15 hover:bg-white/20 text-white"
                : "bg-orange-600 hover:bg-orange-500 text-white",
            )}
          >
            {isPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Play</>}
          </Button>
          <span className="text-sm tabular-nums text-white/60 ml-1">
            {fmt(playhead)} / {fmt(duration)}
          </span>
          <span className="text-xs text-white/30 ml-1">Space</span>
        </div>

        {/* Edit tools */}
        <div className="bg-white/5 rounded-xl px-4 py-4 border border-white/8 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Edit</p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline"
              onClick={doTrim}
              disabled={!canEdit || selDur < 0.05 || selDur >= duration - 0.01}
              className="border-white/20 text-white/80 hover:bg-white/10 bg-transparent">
              Trim to Selection
            </Button>
            <Button size="sm" variant="outline"
              onClick={doCut}
              disabled={!canEdit || selDur < 0.05}
              className="border-white/20 text-white/80 hover:bg-white/10 bg-transparent">
              Cut Selection
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Fade In */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-white/60">
                <Label className="text-white/60">Fade In</Label>
                <span className="tabular-nums text-white/80">{fadeIn.toFixed(1)}s</span>
              </div>
              <Slider
                value={[fadeIn]} min={0} max={10} step={0.1}
                onValueChange={([v]) => setFadeIn(v)}
                className="[&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-0"
              />
            </div>

            {/* Fade Out */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-white/60">
                <Label className="text-white/60">Fade Out</Label>
                <span className="tabular-nums text-white/80">{fadeOut.toFixed(1)}s</span>
              </div>
              <Slider
                value={[fadeOut]} min={0} max={10} step={0.1}
                onValueChange={([v]) => setFadeOut(v)}
                className="[&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-0"
              />
            </div>
          </div>
          <p className="text-xs text-white/30">Fades are applied at export time.</p>
        </div>

        {/* Merge / track list */}
        <div className="bg-white/5 rounded-xl px-4 py-4 border border-white/8 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Tracks</p>
            <Button size="sm" variant="ghost"
              onClick={() => mergeInputRef.current?.click()}
              className="gap-1.5 text-white/60 hover:text-white hover:bg-white/10 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Add Track
            </Button>
          </div>

          {/* Main track */}
          <div className="flex items-center gap-2 text-sm text-white/70">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            <span className="truncate flex-1">{track.title || track.file?.name || "Main track"}</span>
            <span className="tabular-nums text-white/40 shrink-0">{fmt(applyOps(source ?? new AudioContext().createBuffer(1,1,44100), ops, audioCtxRef.current ?? new AudioContext()).duration)}</span>
          </div>

          {extras.map((ex) => (
            <div key={ex.id} className="flex items-center gap-2 text-sm text-white/70">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 shrink-0" />
              <span className="truncate flex-1">{ex.name}</span>
              <span className="tabular-nums text-white/40 shrink-0">{fmt(ex.duration)}</span>
              <button
                onClick={() => removeExtra(ex.id)}
                className="text-white/30 hover:text-red-400 transition-colors ml-1"
                title="Remove track">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {extras.length > 0 && (
            <p className="text-xs text-white/30">Tracks are concatenated in order on export.</p>
          )}
        </div>
      </div>

      {/* Hidden file input for merge */}
      <input
        ref={mergeInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleMergeFile}
      />

      {/* ── Export dialog ── */}
      {exportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-[#141420] border border-white/15 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">Export Audio</h2>

            {exportDone ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <p className="text-white/90 font-medium">Saved!</p>
                <p className="text-xs text-white/50 break-all">{exportDone}</p>
                <p className="text-xs text-green-500/80">Added to your library</p>
                <Button onClick={() => setExportOpen(false)}
                  className="mt-2 bg-white/10 hover:bg-white/15 text-white border-0 w-full">
                  Close
                </Button>
              </div>
            ) : (
              <>
                {/* File name */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-white/60 text-xs">File name</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={exportName}
                      onChange={(e) => setExportName(e.target.value)}
                      disabled={exporting}
                      className="bg-white/8 border-white/15 text-white placeholder:text-white/30 flex-1"
                    />
                    <span className="text-white/40 text-sm shrink-0">.{exportFmt}</span>
                  </div>
                </div>

                {/* Format */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-white/60 text-xs">Format</Label>
                  <div className="flex gap-1.5">
                    {(["mp3", "wav", "flac", "ogg"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setExportFmt(f)}
                        disabled={exporting}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-medium uppercase border transition-colors",
                          exportFmt === f
                            ? "bg-orange-600 border-orange-500 text-white"
                            : "bg-white/8 border-white/15 text-white/60 hover:bg-white/12",
                        )}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality (MP3 only) */}
                {exportFmt === "mp3" && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-white/60 text-xs">Quality</Label>
                    <div className="flex gap-1.5">
                      {(["128", "192", "320"] as const).map((q) => (
                        <button
                          key={q}
                          onClick={() => setExportQuality(q)}
                          disabled={exporting}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            exportQuality === q
                              ? "bg-orange-600 border-orange-500 text-white"
                              : "bg-white/8 border-white/15 text-white/60 hover:bg-white/12",
                          )}>
                          {q} kbps
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Progress */}
                {exporting && (
                  <div className="flex flex-col gap-1.5">
                    <Progress value={exportPct} className="h-1.5 bg-white/10 [&>div]:bg-orange-500" />
                    <p className="text-xs text-white/40 text-center">
                      {exportPct < 100 ? `Encoding… ${exportPct}%` : "Finalizing…"}
                    </p>
                  </div>
                )}

                {exportErr && (
                  <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{exportErr}</p>
                )}

                {/* Fades reminder */}
                {(fadeIn > 0 || fadeOut > 0) && (
                  <p className="text-xs text-white/40">
                    Fades applied:{" "}
                    {fadeIn > 0 && `${fadeIn.toFixed(1)}s in`}
                    {fadeIn > 0 && fadeOut > 0 && ", "}
                    {fadeOut > 0 && `${fadeOut.toFixed(1)}s out`}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setExportOpen(false)}
                    disabled={exporting}
                    className="flex-1 text-white/60 hover:text-white hover:bg-white/10 border border-white/15">
                    Cancel
                  </Button>
                  <Button
                    onClick={runExport}
                    disabled={exporting || !exportName.trim()}
                    className="flex-1 gap-1.5 bg-orange-600 hover:bg-orange-500 text-white border-0">
                    {exporting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
                      : <><Upload className="w-4 h-4" /> Export</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
