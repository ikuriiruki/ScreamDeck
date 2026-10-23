import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

// Korai Button, compact (36px) for the 420px window.
// pill sits on paper, soft sits on a surface field, primary is the one main action, danger confirms loss, accent is «Стоп».
const variants = {
  pill: "bg-surface text-ink hover:bg-surface-2",
  soft: "bg-paper text-ink hover:bg-surface-2",
  primary: "bg-ink text-paper hover:bg-ink/85",
  danger: "bg-down-bg text-down-fg hover:bg-down-bg/88",
  ghost: "bg-transparent text-ink-2 hover:bg-paper hover:text-acc-ink",
  accent: "bg-acc-soft text-acc-ink hover:bg-acc-soft/70",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  icon?: IconName;
  /** Icon-only round button; pass aria-label. */
  round?: boolean;
  loading?: boolean;
};

const base = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-medium whitespace-nowrap no-underline transition-[background-color,color,transform] duration-200 ease-k active:scale-97";

export function Button({ variant = "pill", icon, round, loading, disabled, className = "", children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={round ? rest["aria-label"] : undefined}
      className={`${base} disabled:active:scale-100 aria-pressed:bg-acc-soft aria-pressed:text-acc-ink ${round ? "w-9" : "px-3.5"} ${loading ? "cursor-progress" : "disabled:opacity-50"} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Icon name="loader" size={16} className="animate-spin" /> : icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}
