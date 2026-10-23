import { useEffect, useRef } from "react";
import { Icon } from "../atoms/Icon";

export type Toast = { id: string; message: string; tone?: "ok" | "err" };

/** Graphite pills at the bottom centre, above the bottom menu; each one leaves on its own after `ttl` ms. */
export function Toasts({ items, onDismiss, dismissLabel, ttl = 4000 }: {
  items: Toast[];
  onDismiss: (id: string) => void;
  dismissLabel: string;
  ttl?: number;
}) {
  return (
    <div role="status" className="fixed bottom-24 left-1/2 z-50 grid w-max max-w-[calc(100%-32px)] -translate-x-1/2 justify-items-center gap-2">
      {items.map((t) => <Item key={t.id} toast={t} ttl={ttl} onDismiss={onDismiss} dismissLabel={dismissLabel} />)}
    </div>
  );
}

function Item({ toast, ttl, onDismiss, dismissLabel }: { toast: Toast; ttl: number; onDismiss: (id: string) => void; dismissLabel: string }) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; });
  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(toast.id), ttl);
    return () => clearTimeout(timer);
  }, [toast.id, ttl]);
  return (
    <div className="flex items-center gap-2.5 rounded-full bg-ink py-1 pr-1 pl-4 text-sm font-medium text-paper shadow-lift transition-[opacity,translate] duration-200 ease-k starting:translate-y-2 starting:opacity-0">
      <Icon name={toast.tone === "err" ? "alert" : "check"} size={16} className={toast.tone === "err" ? "text-err" : "text-acc"} />
      <span className="py-1.5">{toast.message}</span>
      <button
        type="button" aria-label={dismissLabel} onClick={() => onDismiss(toast.id)}
        className="grid size-8 place-items-center rounded-full text-paper/60 transition-colors duration-200 ease-k hover:bg-paper/12 hover:text-paper"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
