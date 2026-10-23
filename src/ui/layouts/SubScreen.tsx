import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../atoms/Icon";

/** An inner page (a set, a screamer): back and title on top, action buttons in `footer`, no bottom menu. */
export function SubScreen({ title, onBack, headerAction, footer, children }: {
  title: string;
  onBack: () => void;
  headerAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <button
          type="button" aria-label={t("back")} title={t("back")} onClick={onBack}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink-2 transition-colors duration-200 ease-k hover:bg-surface-2 hover:text-ink"
        >
          <Icon name="chevronLeft" />
        </button>
        <h1 className="mr-auto truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
        {headerAction}
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">{children}</main>
      {footer && <footer className="flex shrink-0 gap-2 px-4 py-3">{footer}</footer>}
    </div>
  );
}
