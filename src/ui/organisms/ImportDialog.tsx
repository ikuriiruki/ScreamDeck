import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { importBundle, inspectBundle } from "../../lib/api";
import type { ImportPreview } from "../../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

/** Reads the zip, shows what it will add, imports on confirm. `onDone(null)`: cancelled. */
export function ImportDialog({ path, onDone }: { path: string; onDone: (imported: ImportPreview | null) => void }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    inspectBundle(path).then(
      (p) => alive && setPreview(p),
      (e) => alive && setError(t("import.failed", { error: String(e) })),
    );
    return () => { alive = false; };
  }, [path, t]);

  const run = () => {
    setBusy(true);
    setError(null);
    importBundle(path, t("import.copySuffix")).then(onDone, (e) => {
      setBusy(false);
      setError(String(e));
    });
  };

  return (
    <ConfirmDialog
      open title={t("import.title")} confirmLabel={t("import.action")} cancelLabel={t("cancel")}
      busy={busy} confirmDisabled={!preview || preview.newScreamers + preview.sets === 0} onConfirm={run} onCancel={() => onDone(null)}
      body={
        <>
          {preview ? (
            <>
              <p>{t("import.will", { screamers: t("count.screamers", { count: preview.newScreamers }), sets: t("count.sets", { count: preview.sets }) })}</p>
              {preview.skippedScreamers > 0 && <p>{t("import.skipped", { count: preview.skippedScreamers })}</p>}
            </>
          ) : !error && <p>{t("import.reading")}</p>}
          {error && <p className="mt-1 font-medium break-words text-err-ink">{error}</p>}
        </>
      }
    />
  );
}
