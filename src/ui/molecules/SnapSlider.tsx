import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { snapDuration } from "../../lib/duration";
import { Slider } from "../atoms/Slider";

const MIN_MS = 100;

/** Duration slider that sticks to the marks (video / sound length) while dragged; Ctrl held = free. Arrow keys never snap. */
export function SnapSlider({ valueMs, onChange, maxMs, marks }: {
  valueMs: number;
  onChange: (ms: number) => void;
  maxMs: number;
  marks: { ms: number; label: string }[];
}) {
  const { t, i18n } = useTranslation();
  const free = useRef(false);
  const seconds = (ms: number) => t("units.seconds", { value: (ms / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 }) });
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
          onChange={(ms) => onChange(snapDuration(ms, marks.map((m) => m.ms), free.current))}
        />
        <output className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">{seconds(valueMs)}</output>
      </div>
      {marks.length > 0 && (
        <div className="relative mr-[68px] h-5">
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
