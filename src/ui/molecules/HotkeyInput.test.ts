import { expect, test } from "vitest";
import { accelerator } from "./HotkeyInput";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) =>
  accelerator({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

test("combo in Tauri format", () => expect(key("End", { ctrlKey: true, shiftKey: true })).toBe("Ctrl+Shift+End"));
test("letters and digits drop the code prefix", () => {
  expect(key("KeyS", { altKey: true })).toBe("Alt+S");
  expect(key("Digit1", { ctrlKey: true })).toBe("Ctrl+1");
});
test("modifier alone is not a combo yet", () => expect(key("ShiftLeft", { shiftKey: true })).toBeNull());
test("plain key needs a modifier, F-keys do not", () => {
  expect(key("KeyA")).toBeNull();
  expect(key("F9")).toBe("F9");
});
