import { useTranslation } from "react-i18next";
import { formatInterval } from "../../lib/interval";
import type { ScreamSet } from "../../lib/types";
import { Switch } from "../atoms/Switch";
import { ListRow } from "../molecules/ListRow";

/** The sets field: K mark (solid = on, hollow = off), name, «5–15 мин · 6 скримеров», switch. */
export function SetList({ sets, onOpen, onToggle }: { sets: ScreamSet[]; onOpen: (id: string) => void; onToggle: (set: ScreamSet, on: boolean) => void }) {
  const { t } = useTranslation();
  const units = { min: t("units.minShort"), sec: t("units.secondsShort") };
  return (
    <div className="flex flex-col gap-0.5 rounded-3xl bg-surface p-1.5">
      {sets.length === 0 && <p className="px-3 py-4 text-center text-[15px] text-ink-2">{t("sets.empty")}</p>}
      {sets.map((s) => (
        <ListRow
          key={s.id}
          onClick={() => onOpen(s.id)}
          lead={<span aria-hidden="true" className={`w-[5px] shrink-0 -skew-x-12 rounded-[3px] ${s.enabled ? "h-[18px] bg-ok" : "h-[11px] shadow-[inset_0_0_0_2px_var(--color-ink-3)]"}`} />}
          title={s.name}
          meta={`${formatInterval(s.minIntervalMs, s.maxIntervalMs, units)} · ${s.items.length ? t("count.screamers", { count: s.items.length }) : t("sets.noItems")}`}
          trail={<Switch checked={s.enabled} onChange={(on) => onToggle(s, on)} label={s.name} />}
        />
      ))}
    </div>
  );
}
