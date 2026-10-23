import type { Screamer } from "./types";

/** «3,2» / «3.2»: seconds to one decimal, for `units.seconds`. */
export const formatSeconds = (ms: number, language: string) =>
  (ms / 1000).toLocaleString(language, { maximumFractionDigits: 1, useGrouping: false });

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

/** Typed seconds («3,2» or «3.2») to whole tenths in ms; null for empty or not a positive number. */
export function parseSeconds(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return null;
  const ms = Math.round(Number(s) * 10) * 100;
  return ms > 0 ? ms : null;
}

/** How long a show of this screamer lasts; null when it has no length (by sound, but no sound). */
export function showDurationMs(s: Screamer): number | null {
  if (s.duration.mode === "custom") return s.duration.ms;
  return s.sound.mode === "file" ? s.sound.durationMs : s.sound.mode === "fromVideo" ? s.media.durationMs : null;
}

/** Drops choices the media no longer allows: sound from a non-video, «by sound» without sound (→ «custom» at its start value). */
export function withValidModes(s: Screamer): Screamer {
  const sound = s.sound.mode === "fromVideo" && s.media.kind !== "video" ? { mode: "none" as const } : s.sound;
  const next = { ...s, sound };
  return next.duration.mode === "bySound" && showDurationMs(next) == null
    ? { ...next, duration: { mode: "custom", ms: initialCustomDuration(next) } }
    : next;
}
