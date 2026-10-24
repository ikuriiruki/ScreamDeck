import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { DirState, ImportPreview, Library, MediaKind, MonitorInfo, ScreamSet, Screamer, Settings, Status, Target } from "./types";

// Typed wrappers of src-tauri/src/commands.rs; Tauri maps these camelCase args to the snake_case params.
export type ImportedMedia = { file: string; kind: MediaKind };

export const getLibrary = () => invoke<Library>("get_library");
export const getSettings = () => invoke<Settings>("get_settings");
export const getStatus = () => invoke<Status>("get_status");

/** An empty id creates a new screamer; the saved one (with its id) comes back. */
export const saveScreamer = (screamer: Screamer) => invoke<Screamer>("save_screamer", { screamer });
export const deleteScreamer = (id: string) => invoke<void>("delete_screamer", { id });
/** Copies the file into media/ right away; returns its new name. */
export const importMedia = (path: string) => invoke<ImportedMedia>("import_media", { path });
export const importSound = (path: string) => invoke<string>("import_sound", { path });
/** Drops media copied for a draft that was never saved. */
export const discardMedia = (files: string[]) => invoke<void>("discard_media", { files });
/** `thumb` is relative to the data folder (Status.dataPath). */
export const thumbUrl = (dataPath: string, thumb: string | null) => (thumb ? convertFileSrc(`${dataPath}/${thumb}`) : null);
export const mediaUrl = (dataPath: string, file: string) => convertFileSrc(`${dataPath}/media/${file}`);
export const saveThumbnail = (id: string, bytes: Uint8Array) => invoke<string>("save_thumbnail", { id, bytes: Array.from(bytes) });

export const saveSet = (set: ScreamSet) => invoke<ScreamSet>("save_set", { set });
export const deleteSet = (id: string) => invoke<void>("delete_set", { id });
export const setEnabled = (id: string, enabled: boolean) => invoke<void>("set_enabled", { id, enabled });

/** A screamer by id, a random one from a set, or (neither) a random one from the whole library. */
export const triggerTest = (target: Target, ids: { screamerId?: string; setId?: string } = {}) =>
  invoke<void>("trigger_test", { target, screamerId: ids.screamerId ?? null, setId: ids.setId ?? null });
export const stop = () => invoke<void>("stop");

export const updateSettings = (settings: Settings) => invoke<void>("update_settings", { settings });
/** Everything but the data folder goes back to defaults. */
export const resetSettings = () => invoke<void>("reset_settings");
export const listMonitors = () => invoke<MonitorInfo[]>("list_monitors");

export const inspectDataDir = (path: string) => invoke<DirState>("inspect_data_dir", { path });
/** `move`: copy the library over; otherwise open the one already in `path`. Fails with "notWritable",
 *  "destinationNotEmpty" (keys of `dataDirError` in i18n) or an I/O message. */
export const changeDataDir = (path: string, move: boolean) => invoke<void>("change_data_dir", { path, mov: move });
/** Opens the data folder in Explorer. */
export const openDataDir = () => invoke<void>("open_data_dir");
export const retryDataDir = () => invoke<void>("retry_data_dir");
/** Finds a free port, saves it and restarts the server; returns the port. */
export const pickFreePort = () => invoke<number>("pick_free_port");

export const exportBundle = (path: string, setIds: string[], screamerIds: string[]) => invoke<void>("export_bundle", { path, setIds, screamerIds });
export const inspectBundle = (path: string) => invoke<ImportPreview>("inspect_bundle", { path });
/** `copySuffix` marks sets imported as copies, e.g. « (копия)». */
export const importBundle = (path: string, copySuffix: string) => invoke<ImportPreview>("import_bundle", { path, copySuffix });

/** `get_*` once, then every `app://*` push; null until the first value arrives. */
function useLive<T>(command: string, event: string): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    let pushed = false;
    const unlisten = listen<T>(event, (e) => {
      pushed = true;
      if (alive) setValue(e.payload);
    });
    // subscribe first, so a change between the fetch and the subscription is not lost
    unlisten
      .then(() => invoke<T>(command))
      .then((v) => {
        if (alive && !pushed) setValue(v);
      })
      .catch((e) => console.error(`${command} / ${event}:`, e));
    return () => {
      alive = false;
      unlisten.then((f) => f()).catch(() => {}); // a failed listen was already logged above
    };
  }, [command, event]);
  return value;
}

export const useLibrary = () => useLive<Library>("get_library", "app://library");
export const useSettings = () => useLive<Settings>("get_settings", "app://settings");
export const useStatus = () => useLive<Status>("get_status", "app://status");
