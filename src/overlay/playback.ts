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

export type Tag = "img" | "video" | "audio";

// Preload events carry file names only, so the element kind is guessed from the extension.
export function guessTag(file: string): Tag {
  if (/\.(mp4|webm|mov|m4v|mkv)$/i.test(file)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file)) return "audio";
  return "img";
}
