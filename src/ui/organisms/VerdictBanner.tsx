import type { ReactNode } from "react";

export type VerdictTone = "calm" | "alert" | "down" | "muted";

// Korai VerdictBanner at the compact window's scale.
// The field's colour is the answer; the numeral is always the tone's tint, never full ink.
const tones: Record<VerdictTone, { field: string; num: string; sub: string }> = {
  calm: { field: "bg-calm-bg text-calm-fg", num: "text-calm-num", sub: "text-calm-sub" },
  alert: { field: "bg-alert-bg text-alert-fg", num: "text-alert-num", sub: "text-alert-fg" },
  down: { field: "bg-down-bg text-down-fg", num: "text-down-num", sub: "text-down-fg" },
  muted: { field: "bg-surface-2 text-ink", num: "text-ink-2", sub: "text-ink" },
};

export function VerdictBanner({ tone, num, title, sub, action, wide }: {
  tone: VerdictTone;
  num: ReactNode;
  title: string;
  sub?: ReactNode;
  /** A button under the sentence, e.g. «Выбрать свободный порт». */
  action?: ReactNode;
  /** A long numeral: smaller. */
  wide?: boolean;
}) {
  const t = tones[tone];
  return (
    <section aria-live="polite" className={`grid grid-cols-[auto_1fr] items-center gap-x-4 rounded-3xl px-5 py-[18px] transition-colors duration-400 ease-k ${t.field}`}>
      <div aria-hidden="true" className={`${wide ? "text-[2.5rem] leading-none tracking-[-0.03em]" : "text-[4rem] leading-[0.82] tracking-[-0.04em]"} font-semibold whitespace-nowrap tabular-nums ${t.num}`}>{num}</div>
      <div className="min-w-0">
        <h2 className="text-[1.375rem] leading-[1.05] font-medium tracking-[-0.02em] text-balance">
          <span className="sr-only">{num} </span>{title}
        </h2>
        {sub && <p className={`mt-1 text-sm leading-snug ${t.sub}`}>{sub}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </section>
  );
}
