import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { deleteSet, exportBundle, saveSet, triggerTest } from "../lib/api";
import { normalizeInterval, type IntervalFix } from "../lib/interval";
import type { Library, ScreamSet, Status } from "../lib/types";
import { AddScreamersDialog, Button, ConfirmDialog, FormField, Icon, Input, SetItems, SubScreen, Switch } from "../ui";
import { useEnableSet, type Notify } from "./Sets";

export function SetDetail({ id, library, status, notify, onBack }: {
  id: string;
  library: Library;
  status: Status;
  notify: Notify;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const saved = library.sets.find((s) => s.id === id);
  // edits show at once; the library push that follows each save brings the stored copy back
  const [set, setLocal] = useState(saved);
  useEffect(() => setLocal(saved), [saved]);
  const enable = useEnableSet(library.sets, notify);
  const [name, setName] = useState<string | null>(null);
  const [fix, setFix] = useState<IntervalFix>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuId = useId();
  if (!set) return null;

  const fail = (e: unknown) => notify(String(e), "err");
  const save = (patch: Partial<ScreamSet>) => {
    const next = { ...set, ...patch };
    setLocal(next);
    saveSet(next).catch(fail);
  };
  const commitName = () => {
    const n = name?.trim();
    setName(null);
    if (n && n !== set.name) save({ name: n });
  };
  const commitInterval = (min: number, max: number) => {
    const r = normalizeInterval(min, max);
    setFix(r.fix);
    if (r.min !== set.minIntervalMs || r.max !== set.maxIntervalMs) save({ minIntervalMs: r.min, maxIntervalMs: r.max });
  };
  const exportSet = async () => {
    const path = await saveDialog({ defaultPath: `${set.name.replace(/[\\/:*?"<>|]/g, "_")}.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!path) return;
    await exportBundle(path, [set.id], []);
    notify(t("set.exported"));
  };
  const inSet = new Set(set.items.map((i) => i.screamerId));
  const anchor = `--more-${menuId.replace(/\W/g, "")}`;

  return (
    <SubScreen
      title={set.name} onBack={onBack}
      headerAction={<Switch checked={set.enabled} onChange={(on) => enable.toggle(set, on)} label={t("set.enabled")} />}
      footer={
        <>
          <Button icon="play" className="flex-1" disabled={!set.items.length} onClick={() => void triggerTest("pc", { setId: set.id }).catch(fail)}>{t("set.random")}</Button>
          <Button icon="download" className="flex-1" onClick={() => void exportSet().catch(fail)}>{t("set.export")}</Button>
          <Button round icon="more" aria-label={t("set.more")} popoverTarget={menuId} style={{ anchorName: anchor } as CSSProperties} />
          <div
            id={menuId} popover="auto"
            style={{ positionAnchor: anchor, inset: "auto", right: "anchor(right)", bottom: "anchor(top)", margin: "0 0 8px" } as CSSProperties}
            className="rounded-3xl border-0 bg-surface p-2 text-ink shadow-lift"
          >
            <button
              type="button" popoverTarget={menuId} popoverTargetAction="hide" onClick={() => setDeleting(true)}
              className="flex h-10 items-center gap-3 rounded-full px-3.5 text-[15px] font-medium whitespace-nowrap text-err-ink transition-colors duration-200 ease-k hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <Icon name="trash" />{t("set.delete")}
            </button>
          </div>
        </>
      }
    >
      <FormField label={t("set.name")}>
        {(f) => (
          <Input
            {...f} value={name ?? set.name} onChange={(e) => setName(e.currentTarget.value)} onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        )}
      </FormField>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-2.5">
          <IntervalField label={t("set.min")} ms={set.minIntervalMs} onCommit={(ms) => commitInterval(ms, set.maxIntervalMs)} />
          <IntervalField label={t("set.max")} ms={set.maxIntervalMs} onCommit={(ms) => commitInterval(set.minIntervalMs, ms)} />
        </div>
        <p role="status" className="px-3 text-[13px] leading-snug text-ink-2 empty:hidden">{fix && t(`set.${fix}`)}</p>
      </div>
      <div className="flex items-center gap-3 rounded-3xl bg-surface px-4.5 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("set.api")}</span>
          <span className="block text-[13px] leading-snug text-ink-2">{t("set.apiHint")}</span>
        </span>
        <Switch checked={set.apiEnabled} onChange={(apiEnabled) => save({ apiEnabled })} label={t("set.api")} />
      </div>
      <div className="flex items-center gap-2 pt-1 pr-1 pl-3">
        <h2 className="mr-auto text-sm font-medium text-ink-2">{t("set.items")}</h2>
        <Button icon="plus" onClick={() => setAdding(true)}>{t("set.add")}</Button>
      </div>
      <SetItems items={set.items} screamers={library.screamers} dataPath={status.dataPath} onChange={(items) => save({ items })} />

      {enable.dialog}
      {adding && (
        <AddScreamersDialog
          screamers={library.screamers.filter((s) => !inSet.has(s.id))} libraryEmpty={!library.screamers.length} dataPath={status.dataPath}
          onAdd={(ids) => { save({ items: [...set.items, ...ids.map((screamerId) => ({ screamerId, weight: 1 }))] }); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        open={deleting} danger title={t("set.deleteConfirm.title", { name: set.name })} body={t("set.deleteConfirm.body")}
        confirmLabel={t("set.deleteConfirm.confirm")} cancelLabel={t("cancel")}
        onConfirm={() => void deleteSet(set.id).then(onBack, fail).finally(() => setDeleting(false))}
        onCancel={() => setDeleting(false)}
      />
    </SubScreen>
  );
}

/** «5 мин 00 с»: two number boxes in one pill; commits when focus leaves the pill or on Enter. */
function IntervalField({ label, ms, onCommit }: { label: string; ms: number; onCommit: (ms: number) => void }) {
  const { t } = useTranslation();
  const labelId = useId();
  const [draft, setDraft] = useState<{ m: string; s: string } | null>(null);
  const shown = draft ?? { m: String(Math.floor(ms / 60_000)), s: String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0") };
  const commit = () => {
    if (!draft) return;
    setDraft(null);
    const n = (x: string) => Number.parseInt(x, 10) || 0;
    onCommit((n(draft.m) * 60 + n(draft.s)) * 1000);
  };
  const box = (part: "m" | "s") => (
    <input
      inputMode="numeric" aria-label={t(part === "m" ? "set.minutes" : "set.seconds", { field: label })} value={shown[part]}
      onChange={(e) => setDraft({ ...shown, [part]: e.currentTarget.value.replace(/\D/g, "").slice(0, 5) })}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      onFocus={(e) => e.currentTarget.select()}
      className="min-w-[2ch] bg-transparent text-center font-medium tabular-nums outline-none [field-sizing:content]"
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="px-3 text-sm font-medium">{label}</span>
      <div
        role="group" aria-labelledby={labelId}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) commit(); }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.querySelector("input")?.focus(); } }}
        className="flex h-10 cursor-text items-center gap-1.5 rounded-full bg-surface px-3.5 text-ink transition-shadow duration-200 ease-k focus-within:shadow-[0_0_0_2px_var(--color-acc)]"
      >
        {box("m")}<span className="text-ink-2">{t("units.minShort")}</span>
        {box("s")}<span className="text-ink-2">{t("units.secondsShort")}</span>
      </div>
    </div>
  );
}
