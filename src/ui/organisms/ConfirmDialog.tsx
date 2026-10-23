import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "../atoms/Button";

/** Native modal <dialog>: focus trap, Escape and the top layer come from the browser; focus starts on cancel. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, danger, busy, confirmDisabled, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  /** Nothing to confirm yet (still loading, or failed). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      className="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-3xl bg-surface p-6 text-ink shadow-lift backdrop:bg-scrim"
    >
      <h2 id={titleId} className="text-xl font-semibold tracking-[-0.015em] text-balance">{title}</h2>
      {body && <div className="mt-2 text-[15px] text-ink-2">{body}</div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="soft" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}
