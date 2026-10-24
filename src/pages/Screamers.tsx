import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportBundle } from "../lib/api";
import type { Library, Status } from "../lib/types";
import { Button, ImportDialog, ScreamerGrid } from "../ui";
import type { Notify } from "./Sets";

/** `onOpen(null)`: a new screamer. */
export function Screamers({ library, status, notify, onOpen }: { library: Library; status: Status; notify: Notify; onOpen: (id: string | null) => void }) {
  const { t } = useTranslation();
  const [importPath, setImportPath] = useState<string | null>(null);
  /** Select mode: the picked ids. */
  const [picked, setPicked] = useState<string[] | null>(null);
  const fail = (e: unknown) => notify(String(e), "err");
  const pickZip = async () => {
    const path = await open({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (path) setImportPath(path);
  };
  const exportPicked = async (ids: string[]) => {
    const path = await save({ defaultPath: "screamers.zip", filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!path) return;
    await exportBundle(path, [], ids);
    setPicked(null);
    notify(t("screamers.exported"));
  };
  const toggle = (id: string) => setPicked((p) => p && (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      {picked ? (
        <div className="flex items-center gap-2 pt-1 pr-1 pl-3">
          <h2 className="mr-auto truncate text-sm font-medium text-ink-2">{t("screamers.selected", { count: picked.length })}</h2>
          <Button onClick={() => setPicked(null)}>{t("cancel")}</Button>
          <Button variant="primary" icon="download" disabled={!picked.length} onClick={() => void exportPicked(picked).catch(fail)}>{t("screamers.export")}</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1 pr-1 pl-3">
          <h2 className="mr-auto truncate text-sm font-medium text-ink-2">{t("count.screamers", { count: library.screamers.length })}</h2>
          {library.screamers.length > 0 && <Button round icon="check" aria-label={t("screamers.select")} onClick={() => setPicked([])} />}
          <Button round icon="upload" aria-label={t("sets.import")} onClick={() => void pickZip().catch(fail)} />
          <Button variant="primary" icon="plus" onClick={() => onOpen(null)}>{t("sets.new")}</Button>
        </div>
      )}
      <ScreamerGrid screamers={library.screamers} sets={library.sets} dataPath={status.dataPath} selected={picked ?? undefined} onOpen={picked ? toggle : onOpen} />
      {importPath && (
        <ImportDialog path={importPath} onDone={(r) => { setImportPath(null); if (r) notify(t("import.done")); }} />
      )}
    </>
  );
}
