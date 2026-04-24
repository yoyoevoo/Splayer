export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function gradientFor(seed: string): string {
  const h1 = hashString(seed) % 360;
  const h2 = (h1 + 60 + (hashString(seed + "x") % 120)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 55% 35%), hsl(${h2} 60% 22%))`;
}
