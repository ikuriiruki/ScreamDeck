const MIN_MS = 1000;
const MAX_MS = 86_400_000;

export type IntervalFix = "swapped" | "clamped" | null;

/** Mirrors pick.rs normalize_interval: min ≤ max, both within 1 s … 24 h. Says what it had to change. */
export function normalizeInterval(minMs: number, maxMs: number): { min: number; max: number; fix: IntervalFix } {
  const swapped = minMs > maxMs;
  const [a, b] = swapped ? [maxMs, minMs] : [minMs, maxMs];
  const clamp = (ms: number) => Math.min(MAX_MS, Math.max(MIN_MS, ms));
  const [min, max] = [clamp(a), clamp(b)];
  return { min, max, fix: swapped ? "swapped" : min !== a || max !== b ? "clamped" : null };
}

/** «5–15 мин», «30–45 с», else «1 мин 30 с – 15 мин». */
export function formatInterval(minMs: number, maxMs: number, units: { min: string; sec: string }): string {
  const s = (ms: number) => Math.round(ms / 1000);
  const [a, b] = [s(minMs), s(maxMs)];
  if (a % 60 === 0 && b % 60 === 0) return `${a / 60}–${b / 60} ${units.min}`;
  if (a < 60 && b < 60) return `${a}–${b} ${units.sec}`;
  const one = (x: number) => [x >= 60 && `${Math.floor(x / 60)} ${units.min}`, x % 60 && `${x % 60} ${units.sec}`].filter(Boolean).join(" ");
  return `${one(a)} – ${one(b)}`;
}
