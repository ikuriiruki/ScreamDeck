/** On/off toggle; `label` names it for screen readers (the visible text sits beside it in the row). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group relative h-[26px] w-11 shrink-0 rounded-full bg-surface-2 transition-colors duration-200 ease-k aria-checked:bg-acc-soft disabled:opacity-50"
    >
      <span className="absolute top-1 left-1 size-[18px] rounded-full bg-ink-3 transition-[translate,background-color] duration-200 ease-k group-aria-checked:translate-x-[18px] group-aria-checked:bg-acc" />
    </button>
  );
}
