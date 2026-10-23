import type { Screamer } from "../lib/types";

export function planPlayback(s: Screamer, durationMs: number) {
  const mediaMs = s.media.durationMs;
  return {
    loopVideo: s.media.kind === "video" && mediaMs != null && durationMs > mediaMs,
    // FromVideo: audible on the first pass only (Player mutes on the first `ended`).
    videoMuted: s.sound.mode !== "fromVideo",
    audioFile: s.sound.mode === "file" ? s.sound.file : null,
    volume: s.volume / 100,
  };
}
