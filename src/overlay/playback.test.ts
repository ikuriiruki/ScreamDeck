import { expect, test } from "vitest";
import type { Screamer } from "../lib/types";
import { guessTag, planPlayback } from "./playback";

const base: Screamer = {
  id: "a",
  name: "a",
  media: { file: "m.mp4", kind: "video", durationMs: 2000, width: 1, height: 1 },
  sound: { mode: "none" },
  duration: { mode: "bySound" },
  volume: 100,
  opacity: 100,
  fit: "cover",
  thumb: null,
};
const with_ = (p: Partial<Screamer>): Screamer => ({ ...base, ...p });

test("image with custom duration does not loop anything", () => {
  const s = with_({ media: { ...base.media, kind: "image", durationMs: null }, duration: { mode: "custom", ms: 5000 } });
  const p = planPlayback(s, 5000);
  expect(p.loopVideo).toBe(false);
  expect(p.audioFile).toBeNull();
});

test("video shorter than duration loops", () => {
  expect(planPlayback(base, 5000).loopVideo).toBe(true);
  expect(planPlayback(base, 2000).loopVideo).toBe(false);
});

test("own sound file plays once", () => {
  const p = planPlayback(with_({ sound: { mode: "file", file: "snd.mp3", durationMs: 1000 } }), 5000);
  expect(p.audioFile).toBe("snd.mp3");
  expect(p.videoMuted).toBe(true);
});

test("sound from video is not muted on first pass", () => {
  expect(planPlayback(with_({ sound: { mode: "fromVideo" } }), 2000).videoMuted).toBe(false);
});

test("no sound mutes video", () => {
  expect(planPlayback(base, 2000).videoMuted).toBe(true);
});

test("volume maps 0..100 to 0..1", () => {
  expect(planPlayback(with_({ volume: 70 }), 2000).volume).toBe(0.7);
});

test("preload tag is guessed from extension", () => {
  expect(guessTag("a.MP4")).toBe("video");
  expect(guessTag("s.mp3")).toBe("audio");
  expect(guessTag("p.gif")).toBe("img");
});
