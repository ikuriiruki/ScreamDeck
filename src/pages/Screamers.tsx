import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Library, Status } from "../lib/types";
import { Button, ImportDialog, ScreamerGrid } from "../ui";
import type { Notify } from "./Sets";

/** `onOpen(null)`: a new screamer. */
export function Screamers({ library, status, notify, onOpen }: { library: Library; status: Status; notify: Notify; onOpen: (id: string | null) => void }) {
  const { t } = useTranslation();
  const [importPath, setImportPath] = useState<string | null>(null);
  const pickZip = async () => {
    const path = await open({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (path) setImportPath(path);
  };
  return (
    <>
      <div className="flex items-center gap-2 pt-1 pr-1 pl-3">
        <h2 className="mr-auto truncate text-sm font-medium text-ink-2">{t("count.screamers", { count: library.screamers.length })}</h2>
        <Button round icon="upload" aria-label={t("sets.import")} onClick={() => void pickZip().catch((e) => notify(String(e), "err"))} />
        <Button variant="primary" icon="plus" onClick={() => onOpen(null)}>{t("sets.new")}</Button>
      </div>
      <ScreamerGrid screamers={library.screamers} sets={library.sets} dataPath={status.dataPath} onOpen={onOpen} />
      {importPath && (
        <ImportDialog path={importPath} onDone={(r) => { setImportPath(null); if (r) notify(t("import.done")); }} />
      )}
    </>
  );
}
