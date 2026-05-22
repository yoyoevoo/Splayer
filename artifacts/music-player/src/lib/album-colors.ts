function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * col).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export interface AlbumPalette {
  bg: string;
  panel: string;
  text: string;
  accent: string;
}

export async function extractAlbumColors(imageUrl: string): Promise<AlbumPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        const SIZE = 64;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }

        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        type HSLPixel = { h: number; s: number; l: number };
        const pixels: HSLPixel[] = [];

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          if (max === min) continue;
          const d = max - min;
          const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (s < 0.18 || l < 0.06 || l > 0.94) continue;
          let h = 0;
          if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
          else if (max === g) h = ((b - r) / d + 2) * 60;
          else                h = ((r - g) / d + 4) * 60;
          pixels.push({ h, s, l });
        }

        if (pixels.length === 0) { resolve(null); return; }

        // Group by 30° hue buckets
        const buckets: Record<number, HSLPixel[]> = {};
        for (const p of pixels) {
          const key = Math.floor(p.h / 30) * 30;
          (buckets[key] ??= []).push(p);
        }

        // Pick the most-populated bucket
        const dominant = Object.entries(buckets).reduce<HSLPixel[]>(
          (best, [, ps]) => (ps.length > best.length ? ps : best),
          [],
        );

        // Most vibrant pixel in that bucket → accent
        const vibrant = dominant.reduce((a, b) => (b.s > a.s ? b : a));
        const h = vibrant.h;

        const accentHex = hslToHex(h, Math.min(vibrant.s, 1),      clamp(vibrant.l, 0.45, 0.65));
        const bgHex     = hslToHex(h, 0.20,  0.08);
        const panelHex  = hslToHex(h, 0.16,  0.13);
        const textHex   = "#E2E8F0";

        resolve({ bg: bgHex, panel: panelHex, text: textHex, accent: accentHex });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
