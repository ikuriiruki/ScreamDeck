import { expect, test } from "vitest";
import type { Screamer } from "./types";
import { durationMarks, initialCustomDuration, parseSeconds, snapDuration } from "./duration";

const video: Screamer = {
  id: "a",
  name: "a",
  media: { file: "m.mp4", kind: "video", durationMs: 3200, width: 1, height: 1 },
  sound: { mode: "none" },
  duration: { mode: "bySound" },
  volume: 100,
  fit: "cover",
  thumb: null,
};
const image: Screamer = { ...video, media: { file: "m.png", kind: "image", durationMs: null, width: 1, height: 1 } };

test("snap pulls within 300ms", () => expect(snapDuration(3400, [3200], false)).toBe(3200));
test("snap ignores far values", () => expect(snapDuration(3600, [3200], false)).toBe(3600));
test("ctrl disables snap", () => expect(snapDuration(3300, [3200], true)).toBe(3300));
test("snap picks nearest of two marks", () => expect(snapDuration(5000, [3200, 5100], false)).toBe(5100));

test("initial custom duration prefers sound", () =>
  expect(initialCustomDuration({ ...video, sound: { mode: "file", file: "s.mp3", durationMs: 5100 } })).toBe(5100));
test("initial custom duration falls back to video", () => expect(initialCustomDuration(video)).toBe(3200));
test("initial custom duration default 3000", () => expect(initialCustomDuration(image)).toBe(3000));

test("marks merge video and sound from video", () =>
  expect(durationMarks({ ...video, sound: { mode: "fromVideo" } })).toEqual([{ ms: 3200, label: "videoAndSound" }]));
test("marks list video and sound file in order", () =>
  expect(durationMarks({ ...video, sound: { mode: "file", file: "s.mp3", durationMs: 1500 } })).toEqual([
    { ms: 1500, label: "sound" },
    { ms: 3200, label: "video" },
  ]));
test("image without sound has no marks", () => expect(durationMarks(image)).toEqual([]));

test("parseSeconds takes comma or dot", () => {
  expect(parseSeconds("3,2")).toBe(3200);
  expect(parseSeconds(" 3.2 ")).toBe(3200);
  expect(parseSeconds("4")).toBe(4000);
  expect(parseSeconds("1.25")).toBe(1300);
});
test("parseSeconds rejects empty and junk", () => {
  expect(parseSeconds("")).toBeNull();
  expect(parseSeconds(".")).toBeNull();
  expect(parseSeconds("3s")).toBeNull();
  expect(parseSeconds("-1")).toBeNull();
  expect(parseSeconds("0")).toBeNull();
});
