import { useTranslation } from "react-i18next";
import { Icon } from "../atoms/Icon";

/** − N + on a paper pill; the weight never goes below 1. */
export function WeightStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  const step = "grid size-[26px] place-items-center rounded-full text-ink-2 transition-colors duration-200 ease-k hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={t("weight.label")} className="flex shrink-0 items-center rounded-full bg-paper p-0.5">
      <button type="button" aria-label={t("weight.less")} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} className={step}><Icon name="minus" size={14} /></button>
      <output className="min-w-5 text-center font-medium tabular-nums">{value}</output>
      <button type="button" aria-label={t("weight.more")} onClick={() => onChange(value + 1)} className={step}><Icon name="plus" size={14} /></button>
    </div>
  );
}
