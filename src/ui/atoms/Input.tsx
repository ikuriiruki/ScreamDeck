import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { Icon } from "./Icon";

/** `soft`: the control sits on a cream surface field, so it takes the paper tone (like Button's soft). */
type Soft = { soft?: boolean };

const field = (soft?: boolean) =>
  `border-0 ${soft ? "bg-paper" : "bg-surface"} text-ink placeholder:text-ink-2 transition-shadow duration-200 ease-k focus:outline-none focus:shadow-[0_0_0_2px_var(--color-acc)] aria-invalid:shadow-[0_0_0_2px_var(--color-err)] disabled:opacity-50`;

export function Input({ soft, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & Soft) {
  return <input className={`${field(soft)} h-10 min-w-0 rounded-full px-3.5 tabular-nums ${className}`} {...rest} />;
}

export function Select({ soft, className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & Soft) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select className={`${field(soft)} h-10 w-full cursor-pointer appearance-none rounded-full pr-10 pl-3.5 font-medium hover:bg-surface-2`} {...rest}>{children}</select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-2" />
    </span>
  );
}
