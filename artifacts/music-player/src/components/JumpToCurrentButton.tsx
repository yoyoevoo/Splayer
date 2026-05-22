import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentPlatform } from "@/lib/platform-api";
import { usePlayer } from "@/lib/player-context";

interface Props {
  onClick: () => void;
  visible: boolean;
  /** Shift up when SelectionActionBar is visible so they don't overlap */
  elevated?: boolean;
}

export function JumpToCurrentButton({ onClick, visible, elevated = false }: Props) {
  const { miniMode } = usePlayer();

  if (!visible) return null;

  // On Android in mini-mode the MiniPlayer card sits 24 px from the bottom and
  // is 80 px tall, so its top edge is 104 px from the bottom.  Add a 12 px gap
  // → 116 px.  When the SelectionActionBar is also visible, add another 48 px.
  const androidMini = currentPlatform === "android" && miniMode;
  const bottomClass = androidMini
    ? (elevated ? "bottom-[164px]" : "bottom-[116px]")
    : (elevated ? "bottom-[52px]"  : "bottom-3");

  return (
    <button
      onClick={onClick}
      title="Jump to playing song"
      aria-label="Jump to playing song"
      className={cn(
        "absolute right-3 z-20",
        "h-10 w-10 rounded-full",
        "bg-primary text-primary-foreground",
        "shadow-lg shadow-primary/30",
        "flex items-center justify-center",
        "hover:scale-110 hover:brightness-110 active:scale-95",
        "transition-[transform,filter,bottom] duration-200",
        bottomClass,
      )}
    >
      <Crosshair className="w-4 h-4" />
    </button>
  );
}

/**
 * Shared scroll-and-highlight logic.
 * Finds the row element by data-testid, scrolls the nearest scrollable
 * container to center it, then briefly adds a highlight ring.
 * Works with both Radix ScrollArea viewports and plain overflow-y-auto divs.
 */
export function scrollToRow(
  testId: string,
  onHighlight: (id: string) => void,
  highlightId: string,
) {
  const rowEl = document.querySelector(`[data-testid="${testId}"]`);
  if (!rowEl) return;

  // Prefer a Radix ScrollArea viewport if present; otherwise walk up to the
  // nearest element with overflow auto/scroll (covers plain overflow-y-auto).
  const radixViewport = rowEl.closest("[data-radix-scroll-area-viewport]");
  const scrollContainer: HTMLElement | null =
    radixViewport instanceof HTMLElement
      ? radixViewport
      : (() => {
          let el: HTMLElement | null = rowEl.parentElement;
          while (el && el !== document.body) {
            const ov = window.getComputedStyle(el).overflowY;
            if (ov === "auto" || ov === "scroll") return el;
            el = el.parentElement;
          }
          return null;
        })();

  if (scrollContainer) {
    const rr = rowEl.getBoundingClientRect();
    const vr = scrollContainer.getBoundingClientRect();
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + rr.top - vr.top - vr.height / 2 + rr.height / 2,
      behavior: "smooth",
    });
  } else {
    rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  onHighlight(highlightId);
  setTimeout(() => onHighlight(""), 1500);
}
