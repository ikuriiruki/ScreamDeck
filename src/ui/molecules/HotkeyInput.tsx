import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Kbd } from "../atoms/Kbd";

const MODIFIERS = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);
// Keys that are fine alone as a global shortcut; anything else needs a modifier, or it would stop typing everywhere.
const ALONE = /^(F\d{1,2}|Pause)$/;

/** A pressed combo in Tauri's accelerator format, e.g. `Ctrl+Shift+End`; null while only modifiers are down. */
export function accelerator(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string | null {
  if (MODIFIERS.has(e.code) || !e.code) return null;
  const key = e.code.replace(/^Key|^Digit/, "");
  const mods = [e.ctrlKey && "Ctrl", e.shiftKey && "Shift", e.altKey && "Alt", e.metaKey && "Super"].filter(Boolean);
  if (!mods.length && !ALONE.test(key)) return null;
  return [...mods, key].join("+");
}

/** Click, then press the combo; Escape or clicking away keeps the old one. */
export function HotkeyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    if (e.code === "Escape" && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) return setRecording(false);
    const combo = accelerator(e);
    if (!combo) return;
    setRecording(false);
    if (combo !== value) onChange(combo);
  };
  return (
    <button
      type="button" aria-label={t("hotkey.change")} aria-pressed={recording}
      onClick={() => setRecording((r) => !r)} onKeyDown={onKeyDown} onBlur={() => setRecording(false)}
      className="shrink-0 rounded-lg transition-shadow duration-200 ease-k aria-pressed:shadow-[0_0_0_2px_var(--color-acc)]"
    >
      <Kbd className={recording ? "text-ink-2" : ""}>{recording ? t("hotkey.press") : value}</Kbd>
    </button>
  );
}
