import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { deleteScreamer, discardMedia, exportBundle, importMedia, importSound, mediaUrl, saveScreamer, saveThumbnail, triggerTest } from "../lib/api";
import { durationMarks, formatSeconds, initialCustomDuration, showDurationMs, withValidModes } from "../lib/duration";
import { makeThumbnail, measureAudio, measureMedia } from "../lib/media";
import type { Library, Screamer, Status } from "../lib/types";
import { Button, ConfirmDialog, FormField, Icon, Input, Segmented, Slider, SnapSlider, SubScreen } from "../ui";
import type { Notify } from "./Sets";

const MEDIA = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov"];
const SOUND = ["mp3", "ogg", "wav", "m4a"];
const baseName = (path: string) => path.split(/[\\/]/).pop()!;
const soundFile = (s: Screamer | null) => (s?.sound.mode === "file" ? s.sound : null);

/**
 * New (`id` null) or stored screamer. Edits stay a draft until «Сохранить». «Проверить» needs the draft in the library,
 * so it stores it; «Назад» then puts the original back (or deletes a new one). Files copied in for the draft and
 * not kept are discarded — the core refuses to delete files a stored screamer still uses.
 */
export function ScreamerEdit({ id, library, status, notify, onBack }: {
  id: string | null;
  library: Library;
  status: Status;
  notify: Notify;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [original] = useState(() => library.screamers.find((s) => s.id === id) ?? null);
  const [draft, setDraft] = useState(original);
  /** What the library holds for this screamer right now. */
  const [stored, setStored] = useState(original);
  const [thumb, setThumb] = useState<Uint8Array | null>(null);
  const [names, setNames] = useState<{ media?: string; sound?: string }>({});
  const [lastSound, setLastSound] = useState(soundFile(original));
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const copied = useRef<string[]>([]);
  const menuId = useId();
  const anchor = `--more-${menuId.replace(/\W/g, "")}`;

  const url = (file: string) => mediaUrl(status.dataPath, file);
  const sec = (ms: number) => t("units.seconds", { value: formatSeconds(ms, i18n.language) });
  const fail = (e: unknown) => notify(String(e), "err");
  const run = (job: () => Promise<unknown>) => {
    setBusy(true);
    job().catch(fail).finally(() => setBusy(false));
  };
  const cleanup = () => discardMedia([...copied.current, ...(original ? [original.media.file] : []), ...(soundFile(original) ? [soundFile(original)!.file] : [])]);
  const track = (file: string) => (copied.current.push(file), file);

  const pickMedia = async () => {
    const path = await open({ filters: [{ name: t("screamer.mediaFiles"), extensions: MEDIA }] });
    if (!path) return;
    const { file, kind } = await importMedia(path);
    track(file);
    const m = await measureMedia(url(file), kind).catch((e) => {
      void discardMedia([file]);
      throw e;
    });
    const bytes = await makeThumbnail(url(file), kind).catch((e) => (console.error("thumbnail:", e), null));
    if (draft) void discardMedia([draft.media.file]);
    const media = { file, kind, ...m };
    setThumb(bytes);
    setNames((n) => ({ ...n, media: baseName(path) }));
    setDraft(withValidModes(draft ? { ...draft, media } : {
      id: "", name: baseName(path).replace(/\.[^.]+$/, ""), media,
      sound: kind === "video" ? { mode: "fromVideo" } : { mode: "none" },
      duration: { mode: "bySound" }, volume: 100, opacity: 100, fit: "cover", thumb: null,
    }));
  };
  const pickSound = async (s: Screamer) => {
    const path = await open({ filters: [{ name: t("screamer.soundFiles"), extensions: SOUND }] });
    if (!path) return;
    const file = track(await importSound(path));
    const durationMs = await measureAudio(url(file)).catch((e) => {
      void discardMedia([file]);
      throw e;
    });
    if (lastSound) void discardMedia([lastSound.file]);
    const sound = { mode: "file" as const, file, durationMs };
    setLastSound(sound);
    setNames((n) => ({ ...n, sound: baseName(path) }));
    setDraft({ ...s, sound });
  };

  const back = () => run(async () => {
    if (stored && !original) await deleteScreamer(stored.id);
    else if (original && stored !== original) await saveScreamer(original);
    await cleanup();
    onBack();
  });
  const test = (s: Screamer) => run(async () => {
    let target = stored;
    if (!target || JSON.stringify(target) !== JSON.stringify(s)) {
      target = await saveScreamer(s);
      setStored(target);
      setDraft(target);
    }
    await triggerTest("pc", { screamerId: target.id });
  });
  const save = (s: Screamer) => run(async () => {
    let next = { ...s, name: s.name.trim() };
    if (thumb) {
      if (!next.id) {
        next = await saveScreamer(next);
        // if the thumbnail fails, a retry updates this one and «Назад» removes it
        setStored(next);
        setDraft(next);
      }
      next = { ...next, thumb: await saveThumbnail(next.id, thumb) };
    }
    await saveScreamer(next);
    await cleanup();
    onBack();
  });
  // exports what the library holds, not unsaved edits
  const exportOne = (s: Screamer) => run(async () => {
    const path = await saveDialog({ defaultPath: `${s.name.replace(/[\\/:*?"<>|]/g, "_")}.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!path) return;
    await exportBundle(path, [], [s.id]);
    notify(t("screamer.exported"));
  });
  const remove = () => run(async () => {
    await deleteScreamer(original!.id);
    await cleanup();
    onBack();
  });

  const s = draft;
  const inSets = original ? library.sets.filter((x) => x.items.some((i) => i.screamerId === original.id)).length : 0;
  const soundMs = s && showDurationMs({ ...s, duration: { mode: "bySound" } });
  const marks = s ? durationMarks(s) : [];

  return (
    <SubScreen
      title={s?.name.trim() || t("screamer.new")} onBack={() => !busy && back()}
      footer={
        <>
          <Button icon="play" className="flex-1" disabled={!s || busy} onClick={() => s && test(s)}>{t("screamer.test")}</Button>
          <Button variant="primary" className="flex-1" disabled={!s || !s.name.trim() || busy} onClick={() => s && save(s)}>{t("screamer.save")}</Button>
          {original && (
            <>
              <Button round icon="more" aria-label={t("set.more")} popoverTarget={menuId} style={{ anchorName: anchor } as CSSProperties} />
              <div
                id={menuId} popover="auto"
                style={{ positionAnchor: anchor, inset: "auto", right: "anchor(right)", bottom: "anchor(top)", margin: "0 0 8px" } as CSSProperties}
                className="rounded-3xl border-0 bg-surface p-2 text-ink shadow-lift"
              >
                <button
                  type="button" popoverTarget={menuId} popoverTargetAction="hide" disabled={busy} onClick={() => exportOne(stored ?? original)}
                  className="flex h-10 items-center gap-3 rounded-full px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors duration-200 ease-k hover:bg-surface-2 focus-visible:bg-surface-2 disabled:opacity-50"
                >
                  <Icon name="download" />{t("screamer.export")}
                </button>
                <button
                  type="button" popoverTarget={menuId} popoverTargetAction="hide" onClick={() => setDeleting(true)}
                  className="flex h-10 items-center gap-3 rounded-full px-3.5 text-[15px] font-medium whitespace-nowrap text-err-ink transition-colors duration-200 ease-k hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <Icon name="trash" />{t("screamer.delete")}
                </button>
              </div>
            </>
          )}
        </>
      }
    >
      {!s ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl bg-surface p-4 text-center">
          <Button variant="primary" icon="upload" loading={busy} onClick={() => run(pickMedia)}>{t("screamer.pick")}</Button>
          <p className="text-[13px] leading-snug text-ink-2">{t("screamer.formats")}</p>
        </div>
      ) : (
        <>
          <div className="relative aspect-video shrink-0 overflow-hidden rounded-2xl bg-black">
            {s.media.kind === "video"
              ? <video key={s.media.file} src={url(s.media.file)} controls preload="metadata" style={{ opacity: s.opacity / 100 }} className={`size-full ${s.fit === "cover" ? "object-cover" : "object-contain"}`} />
              : <img key={s.media.file} src={url(s.media.file)} alt="" style={{ opacity: s.opacity / 100 }} className={`size-full ${s.fit === "cover" ? "object-cover" : "object-contain"}`} />}
            <div className="absolute inset-x-2.5 top-2.5 flex items-center gap-2">
              <span className="mr-auto min-w-0 truncate rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-[#f7f1e8]">
                {names.media ?? t(`kinds.${s.media.kind}`)}{s.media.durationMs != null && ` · ${sec(s.media.durationMs)}`}
              </span>
              <button
                type="button" disabled={busy} onClick={() => run(pickMedia)}
                className="shrink-0 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-[#f7f1e8] transition-colors duration-200 ease-k hover:bg-black/80 disabled:opacity-50"
              >
                {t("screamer.replace")}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 rounded-3xl bg-surface p-3.5">
            <FormField label={t("screamer.name")}>
              {(f) => <Input {...f} soft value={s.name} onChange={(e) => setDraft({ ...s, name: e.currentTarget.value })} />}
            </FormField>

            <Group label={t("screamer.sound.label")}>
              <Segmented
                soft label={t("screamer.sound.label")} value={s.sound.mode}
                onChange={(mode) => {
                  if (mode === "file") {
                    if (lastSound) setDraft({ ...s, sound: lastSound });
                    else run(() => pickSound(s));
                  } else setDraft(withValidModes({ ...s, sound: { mode } }));
                }}
                options={[
                  ...(s.media.kind === "video" ? [{ value: "fromVideo" as const, label: t("screamer.sound.fromVideo") }] : []),
                  { value: "file", label: t("screamer.sound.file") },
                  { value: "none", label: t("screamer.sound.none") },
                ]}
              />
              {s.sound.mode === "file" && (
                <div className="flex items-center gap-2 px-3 text-[13px] text-ink-2">
                  <span className="min-w-0 flex-1 truncate tabular-nums">{names.sound ?? t("screamer.sound.own")} · {sec(s.sound.durationMs)}</span>
                  <button type="button" disabled={busy} onClick={() => run(() => pickSound(s))} className="shrink-0 font-medium text-ink underline underline-offset-4 hover:text-acc-ink disabled:opacity-50">
                    {t("screamer.sound.replace")}
                  </button>
                </div>
              )}
            </Group>

            <Group label={t("duration.label")}>
              <Segmented
                soft label={t("duration.label")} value={s.duration.mode}
                onChange={(mode) => mode !== s.duration.mode && setDraft({ ...s, duration: mode === "custom" ? { mode, ms: initialCustomDuration(s) } : { mode } })}
                options={[
                  { value: "bySound", label: soundMs != null ? `${t("screamer.bySound")} · ${sec(soundMs)}` : t("screamer.bySound"), disabled: soundMs == null },
                  { value: "custom", label: t("screamer.custom") },
                ]}
              />
              {s.duration.mode === "custom" && (
                <SnapSlider
                  valueMs={s.duration.ms} onChange={(ms) => setDraft({ ...s, duration: { mode: "custom", ms } })}
                  maxMs={Math.ceil(Math.max(15_000, s.duration.ms, ...marks.map((m) => m.ms * 2)) / 1000) * 1000}
                  marks={marks.map((m) => ({ ms: m.ms, label: t(`screamer.marks.${m.label}`) }))}
                />
              )}
            </Group>

            <Group label={t("screamer.volumeValue", { value: s.volume })}>
              <Slider aria-label={t("screamer.volume")} value={s.volume} onChange={(volume) => setDraft({ ...s, volume })} className="my-2" />
            </Group>

            <Group label={t("screamer.opacityValue", { value: s.opacity })}>
              <Slider aria-label={t("screamer.opacity")} min={10} value={s.opacity} onChange={(opacity) => setDraft({ ...s, opacity })} className="my-2" />
            </Group>

            <Group label={t("screamer.fit.label")}>
              <Segmented
                soft label={t("screamer.fit.label")} value={s.fit} onChange={(fit) => setDraft({ ...s, fit })}
                options={[{ value: "cover", label: t("screamer.fit.cover") }, { value: "contain", label: t("screamer.fit.contain") }]}
              />
            </Group>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleting} danger title={t("screamer.deleteConfirm.title", { name: original?.name })}
        body={inSets ? t("screamer.deleteConfirm.body", { count: inSets }) : t("screamer.deleteConfirm.bodyNone")}
        confirmLabel={t("screamer.deleteConfirm.confirm")} cancelLabel={t("cancel")} busy={busy}
        onConfirm={remove} onCancel={() => setDeleting(false)}
      />
    </SubScreen>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-3 text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
