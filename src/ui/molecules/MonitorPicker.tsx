import { useTranslation } from "react-i18next";
import type { MonitorInfo } from "../../lib/types";

const BOX_W = 300;
const BOX_H = 110;
const GAP = 3;

/** The desktop layout to scale; click a screen to toggle it. Order of `selected` is kept (the first one plays the sound). */
export function MonitorPicker({ monitors, selected, onChange }: {
  monitors: MonitorInfo[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const { t } = useTranslation();
  if (!monitors.length) return null;
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const w = Math.max(...monitors.map((m) => m.x + m.width)) - minX;
  const h = Math.max(...monitors.map((m) => m.y + m.height)) - minY;
  const k = Math.min(BOX_W / w, BOX_H / h);
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  return (
    <div role="group" aria-label={t("monitors.label")} className="grid place-items-center rounded-2xl bg-paper p-3">
      <div className="relative" style={{ width: w * k, height: h * k }}>
        {monitors.map((m, i) => {
          const on = selected.includes(m.name);
          return (
            <button
              key={m.name} type="button" aria-pressed={on}
              title={`${m.name} · ${m.width}×${m.height}${m.primary ? ` · ${t("monitors.primary")}` : ""}`}
              aria-label={t("monitors.screen", { n: i + 1 })}
              onClick={() => toggle(m.name)}
              style={{ left: (m.x - minX) * k + GAP / 2, top: (m.y - minY) * k + GAP / 2, width: m.width * k - GAP, height: m.height * k - GAP }}
              className="absolute grid place-items-center rounded-lg bg-surface-2 font-semibold text-ink-2 tabular-nums transition-colors duration-200 ease-k hover:text-ink aria-pressed:bg-acc-soft aria-pressed:text-acc-ink aria-pressed:shadow-[inset_0_0_0_2px_var(--color-acc)]"
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
