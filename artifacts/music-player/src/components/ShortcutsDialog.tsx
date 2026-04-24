import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause"],
  ["→", "Next track"],
  ["←", "Previous track"],
  ["M", "Mute / unmute"],
  ["S", "Toggle shuffle"],
  ["R", "Cycle repeat mode"],
  ["?", "Show this dialog"],
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Move around without taking your hands off the keys.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 pt-2">
          {SHORTCUTS.map(([key, label]) => (
            <li
              key={key}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <kbd className="px-2 py-1 rounded-md bg-muted text-foreground text-xs font-mono border border-card-border min-w-[2rem] text-center">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
