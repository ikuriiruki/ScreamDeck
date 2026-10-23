import type { ReactNode } from "react";

/** A main screen: logo, name and `action` (the «Стоп» button) on top, scrolling body, `nav` (BottomNav) at the bottom. */
export function TabScreen({ title, action, children, nav }: { title: string; action?: ReactNode; children: ReactNode; nav: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface">
          <i className="h-4 w-[5px] -skew-x-12 rounded-[3px] bg-acc" />
        </span>
        <h1 className="mr-auto truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
        {action}
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">{children}</main>
      {nav}
    </div>
  );
}
