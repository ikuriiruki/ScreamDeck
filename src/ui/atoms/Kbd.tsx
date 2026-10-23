import type { ReactNode } from "react";

/** A key combo or a short fixed value (port) on a surface field. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`rounded-lg bg-paper px-2 py-1 font-sans text-[13px] font-medium whitespace-nowrap tabular-nums text-ink ${className}`}>{children}</kbd>;
}
