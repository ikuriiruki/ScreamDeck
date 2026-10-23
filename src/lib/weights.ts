/** Whole percents that add up to exactly 100 (largest remainder; ties go to the earlier item). */
export function weightPercents(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * 100) / total);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((_, i) => i).sort((a, b) => exact[b] - out[b] - (exact[a] - out[a]) || a - b);
  for (const i of byRemainder) {
    if (left-- <= 0) break;
    out[i]++;
  }
  return out;
}
