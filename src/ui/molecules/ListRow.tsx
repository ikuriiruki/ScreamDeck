import type { ReactNode } from "react";

/** A row inside a surface field: lead (mark, thumb), name and meta, trailing controls. With `onClick` the left part opens the record. */
export function ListRow({ title, meta, lead, trail, onClick }: {
  title: ReactNode;
  meta?: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {meta && <span className="block truncate text-[13px] text-ink-2 tabular-nums">{meta}</span>}
      </span>
    </>
  );
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-[18px] px-3 py-2.5 transition-colors duration-200 ease-k hover:bg-surface-2">
      {onClick ? (
        <button type="button" onClick={onClick} className="-my-2.5 -ml-3 flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-[18px] py-2.5 pl-3 text-left">{body}</button>
      ) : body}
      {trail}
    </div>
  );
}
