import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changeDataDir, pickFreePort, retryDataDir, saveSet, setEnabled } from "../lib/api";
import type { Library, ScreamSet, Status } from "../lib/types";
import { Button, ConfirmDialog, ImportDialog, SetList, VerdictBanner } from "../ui";

export type Notify = (message: string, tone?: "err") => void;

const fail = (notify: Notify) => (e: unknown) => notify(String(e), "err");

/** Turning a set on while others run asks first, naming the running ones. Used by the list and the set screen. */
export function useEnableSet(sets: ScreamSet[], notify: Notify) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState<ScreamSet | null>(null);
  const othersOn = (s: ScreamSet) => sets.filter((x) => x.enabled && x.id !== s.id);
  const apply = (s: ScreamSet, on: boolean) => void setEnabled(s.id, on).catch(fail(notify));
  const toggle = (s: ScreamSet, on: boolean) => (on && othersOn(s).length ? setAsking(s) : apply(s, on));
  const dialog = asking && (
    <ConfirmDialog
      open title={t("sets.confirmEnable.title")} confirmLabel={t("sets.confirmEnable.confirm")} cancelLabel={t("cancel")}
      body={t("sets.confirmEnable.body", { names: othersOn(asking).map((x) => x.name).join(t("sets.confirmEnable.separator")), name: asking.name })}
      onConfirm={() => { apply(asking, true); setAsking(null); }}
      onCancel={() => setAsking(null)}
    />
  );
  return { toggle, dialog };
}

export function Sets({ library, status, notify, onOpen }: { library: Library; status: Status; notify: Notify; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const enable = useEnableSet(library.sets, notify);
  const [importPath, setImportPath] = useState<string | null>(null);

  const pickZip = async () => {
    const path = await open({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (path) setImportPath(path);
  };
  // the other fields take the core's defaults (serde)
  const create = () => saveSet({ id: "", name: t("sets.newName") } as ScreamSet).then((s) => onOpen(s.id), fail(notify));

  return (
    <>
      <Verdict status={status} notify={notify} />
      <div className="flex items-center gap-2 pt-1 pr-1 pl-3">
        <h2 className="mr-auto text-sm font-medium text-ink-2">{t("sets.title")}</h2>
        <Button round icon="upload" aria-label={t("sets.import")} onClick={() => void pickZip().catch(fail(notify))} />
        <Button variant="primary" icon="plus" onClick={() => void create()}>{t("sets.new")}</Button>
      </div>
      <SetList sets={library.sets} onOpen={onOpen} onToggle={enable.toggle} />
      {enable.dialog}
      {importPath && (
        <ImportDialog path={importPath} onDone={(r) => { setImportPath(null); if (r) notify(t("import.done")); }} />
      )}
    </>
  );
}

/** Each problem gets its own banner (data folder, media access, busy port), so none hides another's fix; with none, how many sets run. */
function Verdict({ status, notify }: { status: Status; notify: Notify }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const link = "text-[15px] font-medium underline decoration-[1.5px] underline-offset-4 transition-opacity duration-200 ease-k hover:opacity-75 disabled:opacity-50";
  const path = (p: string) => <span className="break-all">{p}</span>;
  const dir = status.dataDir;
  const server = status.server;

  const choose = async () => {
    const p = await open({ directory: true });
    if (p) await changeDataDir(p, false);
  };
  const pick = () => {
    setBusy(true);
    pickFreePort()
      .then((port) => notify(t("sets.portBusy.done", { port })), fail(notify))
      .finally(() => setBusy(false));
  };

  const problems = [
    dir.state === "unavailable" && (
      <VerdictBanner
        key="dir" tone="down" num="!" title={t("sets.dataDir.unavailable")} sub={path(dir.path)}
        action={
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" className={link} onClick={() => void retryDataDir().catch(fail(notify))}>{t("sets.dataDir.retry")}</button>
            <button type="button" className={link} onClick={() => void choose().catch((e) => notify(t(`dataDirError.${e}`, { defaultValue: String(e) }), "err"))}>{t("sets.dataDir.choose")}</button>
          </div>
        }
      />
    ),
    dir.state === "corrupt" && (
      <VerdictBanner key="dir" tone="down" num="!" title={t("sets.dataDir.corrupt")} sub={path(t("sets.dataDir.corruptSub", { backup: dir.backup }))} />
    ),
    status.mediaError && <VerdictBanner key="media" tone="down" num="!" title={t("sets.mediaError")} sub={status.mediaError} />,
    server.state === "portBusy" && (
      <VerdictBanner
        key="port" tone="alert" num="!" title={t("sets.portBusy.title", { port: server.port })}
        action={<button type="button" className={link} disabled={busy} onClick={pick}>{t("sets.portBusy.action")}</button>}
      />
    ),
  ].filter(Boolean);
  if (problems.length) return <>{problems}</>;

  const n = status.enabledSets.length;
  return n > 0
    ? <VerdictBanner tone="calm" num={n} title={t("sets.verdict.running", { count: n })} sub={t("sets.verdict.runningSub")} />
    : <VerdictBanner tone="muted" num={0} title={t("sets.verdict.off")} sub={t("sets.verdict.offSub")} />;
}
