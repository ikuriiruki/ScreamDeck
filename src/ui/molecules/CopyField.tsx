import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../atoms/Button";

/** A read-only value (the overlay URL) with a copy button; `children` adds more round buttons after it. */
export function CopyField({ value, children }: { value: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex h-10 items-center gap-1.5 rounded-full bg-paper pr-0.5 pl-3.5">
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 select-all">{value}</span>
      <Button
        round variant="pill" icon={copied ? "check" : "copy"} aria-label={copied ? t("copy.done") : t("copy.action")}
        onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
      />
      {children}
    </div>
  );
}
