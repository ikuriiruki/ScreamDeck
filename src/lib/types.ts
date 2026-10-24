// Mirrors src-tauri/src/model.rs, runtime.rs and store.rs (serde camelCase).
export type MediaKind = "image" | "gif" | "video";
export type Fit = "cover" | "contain";

export interface Media {
  file: string;
  kind: MediaKind;
  durationMs: number | null;
  width: number;
  height: number;
}

export type Sound = { mode: "fromVideo" } | { mode: "file"; file: string; durationMs: number } | { mode: "none" };
export type DurationMode = { mode: "bySound" } | { mode: "custom"; ms: number };

export interface Screamer {
  id: string;
  name: string;
  media: Media;
  sound: Sound;
  duration: DurationMode;
  volume: number;
  fit: Fit;
  thumb: string | null;
}

export interface SetItem {
  screamerId: string;
  weight: number;
}

export interface ScreamSet {
  id: string;
  name: string;
  minIntervalMs: number;
  maxIntervalMs: number;
  items: SetItem[];
  enabled: boolean;
  apiEnabled: boolean;
}

export interface Library {
  version: number;
  screamers: Screamer[];
  sets: ScreamSet[];
}

export interface Settings {
  version: number;
  dataDir: string | null;
  monitors: string[];
  hideFromCapture: boolean;
  overlaySound: boolean;
  stopHotkey: string;
  apiPort: number;
  language: string | null;
  theme: string;
  autostart: boolean;
  restoreEnabledSets: boolean;
}

export type Target = "pc" | "overlay" | "both";

export interface Show {
  showId: number;
  screamer: Screamer;
  durationMs: number;
  target: Target;
}

export type ServerStatus = { state: "running"; port: number } | { state: "portBusy"; port: number } | { state: "stopped" };
export type DataDirStatus = { state: "ok" } | { state: "unavailable"; path: string } | { state: "corrupt"; backup: string };
export type DirState = "hasLibrary" | "empty" | "notWritable";

export interface Status {
  enabledSets: string[];
  server: ServerStatus;
  dataDir: DataDirStatus;
  dataPath: string;
  /** The stop hotkey that failed to register. */
  hotkeyError: string | null;
  mediaError: string | null;
  version: string;
}

export interface MonitorInfo {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

export interface ImportPreview {
  newScreamers: number;
  skippedScreamers: number;
  sets: number;
  totalBytes: number;
}
