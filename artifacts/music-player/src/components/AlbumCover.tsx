import { ImagePlus, Music } from "lucide-react";
import { gradientFor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AlbumCoverProps {
  src?: string;
  seed: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  rounded?: boolean;
  /** Show a small "fetch art" badge in the bottom-right corner */
  showFetchBadge?: boolean;
  onFetchBadgeClick?: () => void;
}

export function AlbumCover({
  src,
  seed,
  size = "md",
  className,
  rounded = true,
  showFetchBadge = false,
  onFetchBadgeClick,
}: AlbumCoverProps) {
  const sizeCls =
    size === "sm"
      ? "w-12 h-12"
      : size === "md"
        ? "w-16 h-16"
        : size === "lg"
          ? "w-32 h-32"
          : "w-full aspect-square";
  return (
    <div
      className={cn(
        "relative overflow-visible flex items-center justify-center shrink-0 shadow-lg",
        rounded ? "rounded-lg" : "",
        sizeCls,
        className,
      )}
    >
      {/* inner box clips the image */}
      <div
        className={cn(
          "absolute inset-0 overflow-hidden flex items-center justify-center",
          rounded ? "rounded-lg" : "",
        )}
        style={!src ? { background: gradientFor(seed) } : undefined}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <Music className="w-1/3 h-1/3 text-white/70" strokeWidth={1.5} />
        )}
      </div>

      {/* fetch-art badge */}
      {showFetchBadge && !src && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFetchBadgeClick?.();
          }}
          title="Fetch artwork"
          className={cn(
            "absolute -bottom-1 -right-1 z-10",
            "w-5 h-5 rounded-full flex items-center justify-center",
            "bg-primary text-primary-foreground shadow-md",
            "hover:scale-110 transition-transform",
            "focus:outline-none focus:ring-2 focus:ring-primary/60",
          )}
        >
          <ImagePlus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
