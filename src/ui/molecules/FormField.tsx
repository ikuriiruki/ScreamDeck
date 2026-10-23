import { useId, type ReactNode } from "react";

type Control = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

/** Label, control, hint or error. The control gets its wiring: `{(f) => <Input {...f} />}`. */
export function FormField({ label, hint, error, children }: {
  label: string;
  hint?: string;
  error?: string;
  children: (control: Control) => ReactNode;
}) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-3 text-sm font-medium text-ink">{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": note ? `${id}-note` : undefined })}
      {note && <p id={`${id}-note`} className={`px-3 text-[13px] leading-snug ${error ? "font-medium text-err-ink" : "text-ink-2"}`}>{note}</p>}
    </div>
  );
}
