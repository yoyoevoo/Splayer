import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LS_KEY = "settings-global-shortcuts";

interface ShortcutDef {
  id:         string;
  label:      string;
  defaultKey: string;
}

const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: "playPause",   label: "Play / pause",       defaultKey: "MediaPlayPause"      },
  { id: "next",        label: "Next track",          defaultKey: "MediaNextTrack"      },
  { id: "prev",        label: "Previous track",      defaultKey: "MediaPreviousTrack"  },
  { id: "mute",        label: "Mute / unmute",       defaultKey: "Ctrl+Shift+M"        },
  { id: "shuffle",     label: "Toggle shuffle",      defaultKey: "Ctrl+Shift+S"        },
  { id: "repeat",      label: "Cycle repeat mode",   defaultKey: "Ctrl+Shift+R"        },
  { id: "volumeUp",    label: "Volume +5",           defaultKey: "Ctrl+Up"             },
  { id: "volumeDown",  label: "Volume −5",           defaultKey: "Ctrl+Down"           },
];

const DEFAULT_BINDINGS = Object.fromEntries(
  SHORTCUT_DEFS.map((d) => [d.id, d.defaultKey]),
);

function loadBindings(): Record<string, string> {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, string>;
      return { ...DEFAULT_BINDINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_BINDINGS };
}

function saveBindings(b: Record<string, string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(b)); } catch {}
}

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const ignore = ["Control", "Shift", "Alt", "Meta", "CapsLock", "Dead", "Unidentified"];
  if (ignore.includes(e.key)) return null;
  if (e.key === "Escape")     return null;

  const parts: string[] = [];
  if (e.ctrlKey)  parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey)   parts.push("Alt");

  const keyMap: Record<string, string> = {
    " ":                    "Space",
    "ArrowUp":              "Up",
    "ArrowDown":            "Down",
    "ArrowLeft":            "Left",
    "ArrowRight":           "Right",
    "MediaPlayPause":       "MediaPlayPause",
    "MediaTrackNext":       "MediaNextTrack",
    "MediaTrackPrevious":   "MediaPreviousTrack",
    "AudioVolumeMute":      "VolumeUp",
  };

  const key = keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(key);
  return parts.join("+");
}

function displayKey(acc: string): string {
  if (!acc) return "–";
  const partMap: Record<string, string> = {
    MediaPlayPause:     "⏯",
    MediaNextTrack:     "⏭",
    MediaPreviousTrack: "⏮",
    Shift:              "⇧",
    Up:                 "↑",
    Down:               "↓",
    Left:               "←",
    Right:              "→",
  };
  return acc
    .split("+")
    .map((p) => partMap[p] ?? p)
    .join("+");
}

interface ShortcutsDialogProps {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const [bindings,   setBindings]   = useState<Record<string, string>>(loadBindings);
  const [recording,  setRecording]  = useState<string | null>(null);
  const [conflict,   setConflict]   = useState<string | null>(null);

  const api = window.electronAPI;

  function applyBindings(next: Record<string, string>) {
    setBindings(next);
    saveBindings(next);
    api?.registerGlobalShortcuts?.(next);
  }

  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(null);
        setConflict(null);
        return;
      }

      const acc = keyEventToAccelerator(e);
      if (!acc) return;

      const takenBy = Object.entries(bindings).find(
        ([id, k]) => id !== recording && k === acc,
      );
      if (takenBy) {
        const takenLabel = SHORTCUT_DEFS.find((d) => d.id === takenBy[0])?.label ?? takenBy[0];
        setConflict(`Already used by "${takenLabel}"`);
        setTimeout(() => setConflict(null), 2500);
        return;
      }

      applyBindings({ ...bindings, [recording]: acc });
      setRecording(null);
      setConflict(null);
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [recording, bindings]);

  function handleClose(v: boolean) {
    if (!v) setRecording(null);
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Global — work even when the player is minimized.
            Click any key badge to rebind it, then press your new combo.
          </DialogDescription>
        </DialogHeader>

        {conflict && (
          <p className="text-xs text-destructive -mt-1 px-0.5">{conflict}</p>
        )}

        <ul className="space-y-2 pt-1">
          {SHORTCUT_DEFS.map((def) => {
            const isRec = recording === def.id;
            const key   = bindings[def.id] ?? def.defaultKey;
            return (
              <li key={def.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{def.label}</span>
                <button
                  onClick={() => setRecording(isRec ? null : def.id)}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-mono border min-w-[3rem] text-center transition-all",
                    isRec
                      ? "bg-primary text-primary-foreground border-primary animate-pulse"
                      : "bg-muted text-foreground border-card-border hover:border-primary hover:text-primary cursor-pointer",
                  )}
                >
                  {isRec ? "…" : displayKey(key)}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="pt-2 flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {recording ? "Press Esc to cancel" : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              applyBindings({ ...DEFAULT_BINDINGS });
              setRecording(null);
              setConflict(null);
            }}
          >
            Reset to defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
