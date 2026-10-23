import { useTranslation } from "react-i18next";
import { thumbUrl } from "../../lib/api";
import { showDurationMs } from "../../lib/duration";
import type { Screamer, SetItem } from "../../lib/types";
import { weightPercents } from "../../lib/weights";
import { Icon } from "../atoms/Icon";
import { Thumb } from "../atoms/Thumb";
import { ListRow } from "../molecules/ListRow";
import { WeightStepper } from "../molecules/WeightStepper";

/** «видео · 3,2 с». */
export function useScreamerMeta() {
  const { t, i18n } = useTranslation();
  return (s: Screamer) => {
    const ms = showDurationMs(s);
    const kind = t(`kinds.${s.media.kind}`);
    return ms == null ? kind : `${kind} · ${t("units.seconds", { value: (ms / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1, useGrouping: false }) })}`;
  };
}

/** A set's screamers: thumb, name, kind · length, weight − N +, chance, remove. */
export function SetItems({ items, screamers, dataPath, onChange }: {
  items: SetItem[];
  screamers: Screamer[];
  dataPath: string;
  onChange: (items: SetItem[]) => void;
}) {
  const { t } = useTranslation();
  const meta = useScreamerMeta();
  const rows = items.flatMap((it) => {
    const s = screamers.find((x) => x.id === it.screamerId);
    return s ? [{ it, s }] : [];
  });
  const percents = weightPercents(rows.map((r) => r.it.weight));
  const set = (id: string, weight: number | null) =>
    onChange(weight == null ? items.filter((i) => i.screamerId !== id) : items.map((i) => (i.screamerId === id ? { ...i, weight } : i)));
  return (
    <div className="flex flex-col gap-0.5 rounded-3xl bg-surface p-1.5">
      {rows.length === 0 && <p className="px-3 py-4 text-center text-[15px] text-ink-2">{t("set.empty")}</p>}
      {rows.map(({ it, s }, i) => (
        <ListRow
          key={s.id}
          lead={<Thumb src={thumbUrl(dataPath, s.thumb)} kind={s.media.kind} />}
          title={s.name}
          meta={meta(s)}
          trail={
            <span className="-mr-1.5 flex shrink-0 items-center gap-1">
              <WeightStepper value={it.weight} onChange={(w) => set(s.id, w)} />
              <span className="w-[42px] text-right text-sm font-medium tabular-nums">{percents[i]}%</span>
              <button
                type="button" aria-label={t("set.remove")} title={t("set.remove")} onClick={() => set(s.id, null)}
                className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors duration-200 ease-k hover:bg-paper hover:text-acc-ink"
              >
                <Icon name="close" size={16} />
              </button>
            </span>
          }
        />
      ))}
    </div>
  );
}
