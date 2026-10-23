import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../atoms/Icon";

export type Tab = "sets" | "screamers" | "settings";
const tabs: { id: Tab; icon: IconName }[] = [
  { id: "sets", icon: "sets" },
  { id: "screamers", icon: "screamers" },
  { id: "settings", icon: "settings" },
];

export function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("nav.label")} className="mx-3 mb-3 flex shrink-0 gap-1 rounded-3xl bg-surface p-1.5">
      {tabs.map(({ id, icon }) => (
        <button
          key={id} type="button" aria-current={id === active ? "page" : undefined} onClick={() => onChange(id)}
          className="flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] text-xs font-medium text-ink-2 transition-colors duration-200 ease-k hover:text-ink aria-[current=page]:bg-acc-soft aria-[current=page]:text-acc-ink"
        >
          <Icon name={icon} />
          <span className="max-w-full truncate px-1">{t(`nav.${id}`)}</span>
        </button>
      ))}
    </nav>
  );
}
