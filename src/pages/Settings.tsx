import { open } from "@tauri-apps/plugin-dialog";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Language } from "../app/i18n";
import { changeDataDir, getSettings, inspectDataDir, listMonitors, openDataDir, resetSettings, triggerTest, updateSettings } from "../lib/api";
import type { Library, MonitorInfo, Settings as Config, Status } from "../lib/types";
import { Button, ConfirmDialog, CopyField, HotkeyInput, Input, MonitorPicker, Segmented, Switch } from "../ui";
import type { Notify } from "./Sets";

const samePath = (a: string, b: string) => {
  const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
  return norm(a) === norm(b);
};

export function Settings({ settings, status, library, language, notify }: {
  settings: Config;
  status: Status;
  library: Library;
  language: Language;
  notify: Notify;
}) {
  const { t } = useTranslation();
  const fail = (e: unknown) => notify(String(e), "err");

  // update_settings replaces everything but the data folder, so a patch goes onto the freshest settings
  // (app://settings), plus any patch still on its way — never onto an object this screen kept from earlier.
  const latest = useRef(settings);
  useEffect(() => { latest.current = settings; }, [settings]);
  const save = (patch: Partial<Config>) => {
    latest.current = { ...latest.current, ...patch };
    return updateSettings(latest.current).then(() => true, (e) => { fail(e); return false; });
  };

  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => { listMonitors().then(setMonitors, (e) => notify(String(e), "err")); }, [notify]);
  // Same rule as the core: saved monitors that are connected, else the primary one.
  const connected = settings.monitors.filter((n) => monitors.some((m) => m.name === n));
  const primary = monitors.find((m) => m.primary)?.name;
  const shownMonitors = connected.length ? connected : primary ? [primary] : [];
  const monitorsLost = settings.monitors.length > 0 && monitors.length > 0 && !connected.length;

  const test = () => (library.screamers.length ? triggerTest("both").catch(fail) : notify(t("settings.obs.testEmpty"), "err"));

  const [dirAsk, setDirAsk] = useState<{ path: string; move: boolean } | null>(null);
  const [dirBusy, setDirBusy] = useState(false);
  const pickDir = async () => {
    const path = await open({ directory: true });
    if (!path) return;
    if (samePath(path, status.dataPath)) return notify(t("settings.dataDir.same"));
    const state = await inspectDataDir(path);
    if (state === "notWritable") return notify(t("dataDirError.notWritable"), "err");
    setDirAsk({ path, move: state === "empty" });
  };
  const switchDir = (ask: { path: string; move: boolean }) => {
    setDirBusy(true);
    changeDataDir(ask.path, ask.move)
      .then(() => notify(t(ask.move ? "settings.dataDir.moved" : "settings.dataDir.opened")), (e) => notify(t(`dataDirError.${e}`, { defaultValue: String(e) }), "err"))
      .finally(() => { setDirBusy(false); setDirAsk(null); });
  };

  const [update, setUpdate] = useState<Update | null>(null);
  const [upToDate, setUpToDate] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const checkUpdate = () => {
    setUpdateBusy(true);
    check()
      .then((u) => { setUpdate(u); setUpToDate(!u); }, (e) => notify(t("settings.updates.failed", { error: String(e) }), "err"))
      .finally(() => setUpdateBusy(false));
  };
  // On Windows the installer closes the app and starts the new version itself.
  const install = (u: Update) => {
    setUpdateBusy(true);
    u.downloadAndInstall().catch((e) => { fail(e); setUpdateBusy(false); });
  };

  const [resetAsk, setResetAsk] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const reset = () => {
    const port = latest.current.apiPort;
    setResetBusy(true);
    resetSettings()
      .then(getSettings)
      .then((s) => notify(s.apiPort === port ? t("settings.reset.done") : t("settings.port.changed", { port: s.apiPort })), fail)
      .finally(() => { setResetBusy(false); setResetAsk(false); });
  };

  const server = status.server;
  const hint = "px-3 text-[13px] leading-snug text-ink-2";
  const error = "px-3 pb-1.5 text-[13px] leading-snug font-medium text-err-ink";

  return (
    <>
      <Heading>{t("settings.pc.title")}</Heading>
      <Panel>
        <MonitorPicker monitors={monitors} selected={shownMonitors} onChange={(m) => void save({ monitors: m })} />
        {monitorsLost && <p className={hint}>{t("settings.pc.lost")}</p>}
        <Row title={t("settings.pc.hide")} meta={t("settings.pc.hideHint")}>
          <Switch checked={settings.hideFromCapture} onChange={(hideFromCapture) => void save({ hideFromCapture })} label={t("settings.pc.hide")} />
        </Row>
        <p className={`${hint} pb-2`}>{t("settings.pc.fullscreen")}</p>
      </Panel>

      <Heading>{t("settings.obs.title")}</Heading>
      <Panel>
        <CopyField value={`http://127.0.0.1:${settings.apiPort}/overlay`}>
          <Button round icon="play" aria-label={t("settings.obs.test")} onClick={() => void test()} />
        </CopyField>
        <Row title={t("settings.obs.sound")}>
          <Segmented
            soft className="w-[150px]" label={t("settings.obs.sound")} value={settings.overlaySound ? "on" : "off"}
            onChange={(v) => void save({ overlaySound: v === "on" })}
            options={[{ value: "off", label: t("settings.obs.off") }, { value: "on", label: t("settings.obs.on") }]}
          />
        </Row>
        <p className={`${hint} pb-2`}>{t("settings.obs.soundHint")}</p>
      </Panel>

      <Heading>{t("settings.general")}</Heading>
      <Panel>
        <Row title={t("settings.hotkey")}>
          <HotkeyInput value={settings.stopHotkey} onChange={(stopHotkey) => void save({ stopHotkey })} />
        </Row>
        {status.hotkeyError && <p role="alert" className={error}>{t("settings.hotkeyError", { hotkey: status.hotkeyError })}</p>}
        <Row title={t("settings.port.label")}>
          <PortInput
            port={settings.apiPort} label={t("settings.port.label")}
            onCommit={(apiPort) => {
              if (apiPort === null) return notify(t("settings.port.range"), "err");
              void save({ apiPort }).then((ok) => ok && notify(t("settings.port.changed", { port: apiPort })));
            }}
          />
        </Row>
        {server.state === "portBusy" && <p role="alert" className={error}>{t("sets.portBusy.title", { port: server.port })}</p>}
        <Row title={t("settings.language")}>
          <Segmented
            soft className="w-[150px]" label={t("settings.language")} value={language} onChange={(language) => void save({ language })}
            options={[{ value: "ru", label: "RU" }, { value: "en", label: "EN" }]}
          />
        </Row>
        <Row title={t("settings.theme.label")}>
          <Segmented
            soft className="w-[150px]" label={t("settings.theme.label")} value={settings.theme} onChange={(theme) => void save({ theme })}
            options={[
              { value: "light", label: t("settings.theme.light"), icon: "sun" },
              { value: "dark", label: t("settings.theme.dark"), icon: "moon" },
              { value: "system", label: t("settings.theme.system"), icon: "monitor" },
            ]}
          />
        </Row>
        <Row title={t("settings.autostart")} meta={t("settings.autostartHint")}>
          <Switch checked={settings.autostart} onChange={(autostart) => void save({ autostart })} label={t("settings.autostart")} />
        </Row>
        <Row title={t("settings.restoreSets")}>
          <Switch checked={settings.restoreEnabledSets} onChange={(restoreEnabledSets) => void save({ restoreEnabledSets })} label={t("settings.restoreSets")} />
        </Row>
        <Row title={t("settings.dataDir.label")} meta={<span className="break-all">{status.dataPath}</span>}>
          <Button round variant="soft" icon="folder" aria-label={t("settings.dataDir.open")} onClick={() => void openDataDir().catch(fail)} />
          <Button round variant="soft" icon="edit" aria-label={t("settings.dataDir.change")} onClick={() => void pickDir().catch(fail)} />
        </Row>
        <Row
          title={t("settings.updates.label")}
          meta={[status.version, update ? t("settings.updates.available", { version: update.version }) : upToDate && t("settings.updates.latest")].filter(Boolean).join(" · ")}
        >
          {update
            ? <Button variant="primary" loading={updateBusy} onClick={() => install(update)}>{t("settings.updates.install")}</Button>
            : <Button variant="soft" loading={updateBusy} onClick={checkUpdate}>{t("settings.updates.check")}</Button>}
        </Row>
      </Panel>

      <Button icon="refresh" className="self-center" onClick={() => setResetAsk(true)}>{t("settings.reset.action")}</Button>

      <ConfirmDialog
        open={resetAsk} danger busy={resetBusy} title={t("settings.reset.title")} body={t("settings.reset.body")}
        confirmLabel={t("settings.reset.confirm")} cancelLabel={t("cancel")} onConfirm={reset} onCancel={() => setResetAsk(false)}
      />
      {dirAsk && (
        <ConfirmDialog
          open busy={dirBusy}
          title={t(dirAsk.move ? "settings.dataDir.moveTitle" : "settings.dataDir.openTitle")}
          body={<><span className="block break-all font-medium text-ink">{dirAsk.path}</span>{t(dirAsk.move ? "settings.dataDir.moveBody" : "settings.dataDir.openBody")}</>}
          confirmLabel={t(dirAsk.move ? "settings.dataDir.moveConfirm" : "settings.dataDir.openConfirm")} cancelLabel={t("cancel")}
          onConfirm={() => switchDir(dirAsk)} onCancel={() => setDirAsk(null)}
        />
      )}
    </>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="pt-1 pl-3 text-sm font-medium text-ink-2">{children}</h2>;
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-1 rounded-3xl bg-surface p-1.5">{children}</section>;
}

function Row({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {meta && <span className="block text-[13px] leading-snug text-ink-2">{meta}</span>}
      </span>
      {children}
    </div>
  );
}

/** Commits on blur or Enter; `null` means out of range (the field goes back to the saved port). */
function PortInput({ port, label, onCommit }: { port: number; label: string; onCommit: (port: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const n = Number(draft);
    if (draft === "" || n === port) return;
    onCommit(Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null);
  };
  return (
    <Input
      soft inputMode="numeric" aria-label={label} className="w-24 text-center font-medium"
      value={draft ?? String(port)}
      onChange={(e) => setDraft(e.currentTarget.value.replace(/\D/g, "").slice(0, 5))}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
    />
  );
}
