import { useState } from "react";
import { useTranslation } from "react-i18next";
import { thumbUrl } from "../../lib/api";
import type { Screamer } from "../../lib/types";
import { Thumb } from "../atoms/Thumb";
import { ConfirmDialog } from "./ConfirmDialog";
import { useScreamerMeta } from "./SetItems";

/** Pick several library screamers that are not in the set yet. */
export function AddScreamersDialog({ screamers, libraryEmpty, dataPath, onAdd, onCancel }: {
  /** Only the ones not in the set. */
  screamers: Screamer[];
  libraryEmpty: boolean;
  dataPath: string;
  onAdd: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const meta = useScreamerMeta();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  return (
    <ConfirmDialog
      open title={t("addScreamers.title")} cancelLabel={t("cancel")}
      confirmLabel={picked.length ? `${t("addScreamers.confirm")} · ${picked.length}` : t("addScreamers.confirm")}
      confirmDisabled={!picked.length} onConfirm={() => onAdd(picked)} onCancel={onCancel}
      body={
        screamers.length === 0 ? (
          <p>{t(libraryEmpty ? "addScreamers.emptyLibrary" : "addScreamers.none")}</p>
        ) : (
          <div className="-mx-3 flex max-h-[50dvh] flex-col gap-0.5 overflow-y-auto">
            {screamers.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-[18px] px-3 py-2 text-ink transition-colors duration-200 ease-k hover:bg-surface-2">
                <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => toggle(s.id, e.currentTarget.checked)} className="size-4 shrink-0 accent-acc" />
                <Thumb src={thumbUrl(dataPath, s.thumb)} kind={s.media.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-[13px] text-ink-2 tabular-nums">{meta(s)}</span>
                </span>
              </label>
            ))}
          </div>
        )
      }
    />
  );
}
