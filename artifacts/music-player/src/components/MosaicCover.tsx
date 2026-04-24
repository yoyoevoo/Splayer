import { Music } from "lucide-react";
import { gradientFor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MosaicCoverProps {
  customCoverUrl?: string;
  trackCovers: (string | undefined)[];
  seed: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function MosaicCover({
  customCoverUrl,
  trackCovers,
  seed,
  size = "md",
  className,
}: MosaicCoverProps) {
  const sizeCls =
    size === "sm"
      ? "w-12 h-12"
      : size === "md"
        ? "w-14 h-14"
        : "w-20 h-20";

  if (customCoverUrl) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg shrink-0 shadow-md bg-muted",
          sizeCls,
          className,
        )}
      >
        <img
          src={customCoverUrl}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    );
  }

  const covers = trackCovers.filter(Boolean).slice(0, 4) as string[];

  if (covers.length === 0) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg shrink-0 shadow-md flex items-center justify-center",
          sizeCls,
          className,
        )}
        style={{ background: gradientFor(seed) }}
      >
        <Music className="w-1/3 h-1/3 text-white/70" strokeWidth={1.5} />
      </div>
    );
  }

  if (covers.length === 1) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg shrink-0 shadow-md bg-muted",
          sizeCls,
          className,
        )}
      >
        <img
          src={covers[0]}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    );
  }

  // 2-4 cells: pad to 4 by repeating
  const cells: string[] = [];
  for (let i = 0; i < 4; i++) cells.push(covers[i % covers.length]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg shrink-0 shadow-md grid grid-cols-2 grid-rows-2 gap-[1px] bg-background",
        sizeCls,
        className,
      )}
    >
      {cells.map((src, i) => (
        <div key={i} className="relative overflow-hidden bg-muted">
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
