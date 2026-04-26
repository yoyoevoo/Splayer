import { Minus, Square, X } from "lucide-react";

const isWin32 = window.electronAPI?.platform === "win32";

export function TitleBar() {
  if (!isWin32) return null;

  return (
    <div
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      className="fixed top-0 left-0 right-0 h-9 z-[9999] flex items-center justify-between select-none bg-[#0a0a0f] border-b border-white/[0.06]"
    >
      <div className="flex items-center gap-2 pl-3">
        <img
          src="icon.png"
          alt=""
          className="w-4 h-4 opacity-60"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span className="text-[11px] font-medium text-white/35 tracking-wide">
          Splayer
        </span>
      </div>

      <div
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="flex h-full"
      >
        <button
          onClick={() => window.electronAPI?.minimizeWindow?.()}
          className="h-full w-11 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.electronAPI?.maximizeWindow?.()}
          className="h-full w-11 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Maximize"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={() => window.electronAPI?.closeWindow?.()}
          className="h-full w-11 flex items-center justify-center text-white/40 hover:text-white hover:bg-red-500/75 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
