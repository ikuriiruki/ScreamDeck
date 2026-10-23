import { Icon, type IconName } from "../atoms/Icon";

/** With an `icon` the segment shows only the icon; `label` becomes its accessible name. */
export type Segment<T extends string> = { value: T; label: string; icon?: IconName };

// Korai SegmentedFilter without counts.
export function Segmented<T extends string>({ options, value, onChange, label, soft, className = "" }: {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** On a cream surface field: paper track. */
  soft?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex gap-0.5 rounded-full ${soft ? "bg-paper" : "bg-surface"} p-[3px] ${className}`}>
      {options.map((o) => (
        <button
          key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          aria-label={o.icon ? o.label : undefined} title={o.icon ? o.label : undefined}
          className="grid h-8 min-w-0 flex-1 place-items-center rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-colors duration-200 ease-k hover:text-ink aria-pressed:bg-ink aria-pressed:text-paper"
        >
          {o.icon ? <Icon name={o.icon} size={16} /> : <span className="truncate">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
