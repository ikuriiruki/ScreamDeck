import { describe, expect, it } from "vitest";
import { formatInterval, normalizeInterval } from "./interval";

describe("normalizeInterval", () => {
  it("keeps a valid range", () => expect(normalizeInterval(300_000, 900_000)).toEqual({ min: 300_000, max: 900_000, fix: null }));
  it("swaps min > max", () => expect(normalizeInterval(900_000, 300_000)).toEqual({ min: 300_000, max: 900_000, fix: "swapped" }));
  it("clamps to 1 s … 24 h", () => {
    expect(normalizeInterval(0, 5000)).toEqual({ min: 1000, max: 5000, fix: "clamped" });
    expect(normalizeInterval(1000, 100_000_000)).toEqual({ min: 1000, max: 86_400_000, fix: "clamped" });
  });
});

describe("formatInterval", () => {
  const u = { min: "мин", sec: "с" };
  it("whole minutes", () => expect(formatInterval(300_000, 900_000, u)).toBe("5–15 мин"));
  it("seconds only", () => expect(formatInterval(30_000, 45_000, u)).toBe("30–45 с"));
  it("mixed", () => expect(formatInterval(90_000, 900_000, u)).toBe("1 мин 30 с – 15 мин"));
  it("under a minute and minutes", () => expect(formatInterval(30_000, 120_000, u)).toBe("30 с – 2 мин"));
});
