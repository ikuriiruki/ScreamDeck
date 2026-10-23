import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseSeconds, snapDuration } from "../../lib/duration";
import { Input } from "../atoms/Input";
import { Slider } from "../atoms/Slider";

const MIN_MS = 100;

/**
 * Duration slider plus a seconds field. Both stick to the marks (video / sound length); Ctrl held while dragging
 * or committing the field (Enter, leaving it) = free. Arrow keys on the slider never snap.
 */
export function SnapSlider({ valueMs, onChange, maxMs, marks }: {
  valueMs: number;
  onChange: (ms: number) => void;
  maxMs: number;
  marks: { ms: number; label: string }[];
}) {
  const { t, i18n } = useTranslation();
  const free = useRef(false);
  const ctrl = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const markMs = marks.map((m) => m.ms);
  const number = (ms: number) => (ms / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1, useGrouping: false });
  const seconds = (ms: number) => t("units.seconds", { value: number(ms) });
  const commit = (noSnap: boolean) => {
    const ms = draft === null ? null : parseSeconds(draft);
    setDraft(null);
    if (ms !== null) onChange(snapDuration(Math.min(maxMs, Math.max(MIN_MS, ms)), markMs, noSnap));
  };
  const frac = (ms: number) => (ms - MIN_MS) / (maxMs - MIN_MS);
  const pos = (ms: number) => `${frac(ms) * 100}%`;
  // labels near the ends hang inwards so they never stick out of the field
  const shift = (ms: number) => (frac(ms) < 0.2 ? "" : frac(ms) > 0.8 ? "-translate-x-full" : "-translate-x-1/2");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Slider
          aria-label={t("duration.label")} aria-valuetext={seconds(valueMs)}
          min={MIN_MS} max={maxMs} step={100} value={Math.min(valueMs, maxMs)}
          onPointerDown={(e) => (free.current = e.ctrlKey)}
          onPointerMove={(e) => (free.current = e.ctrlKey)}
          onKeyDown={() => (free.current = true)}
          onChange={(ms) => onChange(snapDuration(ms, markMs, free.current))}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
          <Input
            soft inputMode="decimal" aria-label={t("duration.seconds")} className="h-9 w-16 text-right font-medium"
            value={draft ?? number(valueMs)}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              ctrl.current = e.ctrlKey;
              if (e.key === "Enter") commit(e.ctrlKey);
              if (e.key === "Escape") setDraft(null);
            }}
            onKeyUp={(e) => (ctrl.current = e.ctrlKey)}
            onBlur={() => commit(ctrl.current)}
          />
          {t("units.secondsShort")}
        </label>
      </div>
      {marks.length > 0 && (
        <div className="relative mr-[100px] h-5">
          {marks.filter((m) => m.ms <= maxMs).map((m) => (
            <button
              key={m.ms} type="button" onClick={() => onChange(m.ms)} style={{ left: pos(m.ms) }}
              className={`absolute top-0 ${shift(m.ms)} rounded-full px-1.5 text-xs whitespace-nowrap text-ink-2 transition-colors duration-200 ease-k hover:text-acc-ink`}
            >
              {m.label} · {seconds(m.ms)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
