import type { Screamer } from "./types";

export type DurationMark = { ms: number; label: "video" | "sound" | "videoAndSound" };

/** Lengths the custom duration slider sticks to: the video and the sound, merged when they are the same. */
export function durationMarks(s: Screamer): DurationMark[] {
  const video = s.media.durationMs;
  const sound = s.sound.mode === "file" ? s.sound.durationMs : s.sound.mode === "fromVideo" ? video : null;
  if (video != null && video === sound) return [{ ms: video, label: "videoAndSound" }];
  const marks: DurationMark[] = [];
  if (video != null) marks.push({ ms: video, label: "video" });
  if (sound != null) marks.push({ ms: sound, label: "sound" });
  return marks.sort((a, b) => a.ms - b.ms);
}

export function snapDuration(ms: number, marks: number[], disabled: boolean, thresholdMs = 300): number {
  if (disabled) return ms;
  let best = ms;
  let bestDist = thresholdMs;
  for (const m of marks) {
    const d = Math.abs(m - ms);
    if (d <= bestDist) [best, bestDist] = [m, d];
  }
  return best;
}

/** Where «Своя» starts: the sound's length, else the video's, else 3 s. */
export function initialCustomDuration(s: Screamer): number {
  return s.sound.mode === "file" ? s.sound.durationMs : (s.media.durationMs ?? 3000);
}
