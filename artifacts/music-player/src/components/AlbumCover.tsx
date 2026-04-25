import { Music } from "lucide-react";
import { gradientFor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AlbumCoverProps {
  src?: string;
  seed: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  rounded?: boolean;
}

export function AlbumCover({
  src,
  seed,
  size = "md",
  className,
  rounded = true,
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
    </div>
  );
}
