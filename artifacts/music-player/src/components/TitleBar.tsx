import { useEffect, useState } from "react";
import { Minus, PictureInPicture2, Square, X } from "lucide-react";
import { platformAPI } from "@/lib/platform-api";

export function TitleBar() {
  const api = platformAPI;
  const [widgetOpen, setWidgetOpen] = useState(false);

  useEffect(() => {
    const unsub = api?.onMiniWidgetVisibility?.((d) => setWidgetOpen(d.visible));
    return () => unsub?.();
  }, [api]);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-9 flex items-center justify-between px-3 z-50 select-none"
      style={{ WebkitAppRegion: "drag", background: "transparent" } as React.CSSProperties}
    >
      <span className="text-xs font-medium text-foreground/50">
        Splayer <span className="text-foreground/30">v0.1.0 · {__BUILD_DATE__}</span>
      </span>
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          data-testid="button-mini-player"
          onClick={() => api?.toggleMiniWidget?.()}
          title={widgetOpen ? "Hide mini player" : "Show mini player"}
          className={`w-8 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors ${widgetOpen ? "text-primary" : "text-foreground/50 hover:text-foreground"}`}
        >
          <PictureInPicture2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => api?.minimizeWindow?.()}
          className="w-8 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-foreground/50 hover:text-foreground"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => api?.maximizeWindow?.()}
          className="w-8 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-foreground/50 hover:text-foreground"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => api?.closeWindow?.()}
          className="w-8 h-7 flex items-center justify-center rounded hover:bg-red-500/80 transition-colors text-foreground/50 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
