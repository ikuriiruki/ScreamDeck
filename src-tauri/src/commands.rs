use crate::model::{Id, Library, MediaKind, ScreamSet, Screamer, Settings, Target};
use crate::monitors::{self, MonitorInfo};
use crate::player::Source;
use crate::runtime::{self, AppState, Status};
use crate::server;
use crate::store::{DirState, Store};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::MutexGuard;
use tauri::{AppHandle, Manager};

type CmdResult<T = ()> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedMedia {
    file: String,
    kind: MediaKind,
}

fn store(app: &AppHandle) -> MutexGuard<'_, Store> {
    app.state::<AppState>().inner().store.lock().unwrap()
}

fn new_id() -> Id {
    uuid::Uuid::new_v4().to_string()
}

/// Mutates and saves the library, then lets the runtime catch up (timers, preload, UI).
fn change_library(app: &AppHandle, f: impl FnOnce(&mut Store)) -> CmdResult {
    let r = {
        let mut s = store(app);
        f(&mut s);
        s.save_library()
    };
    runtime::on_library_changed(app);
    r.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_library(app: AppHandle) -> Library {
    store(&app).library.clone()
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    store(&app).settings.clone()
}

#[tauri::command]
pub fn get_status(app: AppHandle) -> Status {
    runtime::status(&app)
}

#[tauri::command]
pub fn save_screamer(app: AppHandle, mut screamer: Screamer) -> CmdResult<Screamer> {
    if screamer.id.is_empty() {
        screamer.id = new_id();
    }
    let s = screamer.clone();
    change_library(&app, |st| st.upsert_screamer(s))?;
    Ok(screamer)
}

#[tauri::command]
pub fn delete_screamer(app: AppHandle, id: Id) -> CmdResult {
    change_library(&app, |st| st.delete_screamer(&id))
}

#[tauri::command]
pub fn import_media(app: AppHandle, path: PathBuf) -> CmdResult<ImportedMedia> {
    let (file, kind) = store(&app).import_media(&path).map_err(|e| e.to_string())?;
    Ok(ImportedMedia { file, kind })
}

#[tauri::command]
pub fn import_sound(app: AppHandle, path: PathBuf) -> CmdResult<String> {
    store(&app).import_sound(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn discard_media(app: AppHandle, files: Vec<String>) {
    store(&app).discard_media(&files);
}

#[tauri::command]
pub fn save_thumbnail(app: AppHandle, id: Id, bytes: Vec<u8>) -> CmdResult<String> {
    store(&app).save_thumbnail(&id, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_set(app: AppHandle, mut set: ScreamSet) -> CmdResult<ScreamSet> {
    if set.id.is_empty() {
        set.id = new_id();
    }
    let s = set.clone();
    change_library(&app, |st| st.upsert_set(s))?;
    Ok(set)
}

#[tauri::command]
pub fn delete_set(app: AppHandle, id: Id) -> CmdResult {
    change_library(&app, |st| st.delete_set(&id))
}

#[tauri::command]
pub fn set_enabled(app: AppHandle, id: Id, enabled: bool) -> CmdResult {
    runtime::set_enabled(&app, &id, enabled).map_err(|e| e.to_string())
}

/// Neither id → a random screamer of the whole library, all equally likely.
#[tauri::command]
pub fn trigger_test(app: AppHandle, screamer_id: Option<Id>, set_id: Option<Id>, target: Target) -> CmdResult {
    let id = match (screamer_id, set_id) {
        (Some(id), _) => id,
        (None, Some(set)) => {
            return runtime::request_from_set(&app, &set, target, Source::Test).map(drop).map_err(|e| format!("{e:?}"));
        }
        (None, None) => {
            let s = store(&app);
            let all = &s.library.screamers;
            if all.is_empty() {
                return Err("library is empty".into());
            }
            all[rand::random_range(0..all.len())].id.clone()
        }
    };
    runtime::request_show(&app, &id, target, Source::Test).map(drop).map_err(|e| format!("{e:?}"))
}

#[tauri::command]
pub fn stop(app: AppHandle) {
    runtime::stop_all(&app);
}

// async: applying settings may create windows, which deadlocks in a sync command on Windows.
#[tauri::command]
pub async fn update_settings(app: AppHandle, settings: Settings) -> CmdResult {
    let (old, r) = {
        let mut s = store(&app);
        // the data folder changes only through change_data_dir
        let new = Settings { data_dir: s.settings.data_dir.clone(), ..settings };
        let old = std::mem::replace(&mut s.settings, new);
        (old, s.save_settings())
    };
    let applied = runtime::apply_settings(&app, &old);
    r.map_err(|e| e.to_string())?;
    applied
}

#[tauri::command]
pub async fn reset_settings(app: AppHandle) -> CmdResult {
    let (old, r) = {
        let mut s = store(&app);
        let old = s.settings.clone();
        s.reset_settings();
        (old, s.save_settings())
    };
    let applied = runtime::apply_settings(&app, &old);
    r.map_err(|e| e.to_string())?;
    applied
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    monitors::list_monitors(&app)
}

#[tauri::command]
pub fn player_ready(app: AppHandle, show_id: u64) {
    runtime::player_ready(&app, show_id);
}

#[tauri::command]
pub fn inspect_data_dir(path: PathBuf) -> DirState {
    Store::inspect_dir(&path)
}

/// Sets stop: the show ends and every set is turned off once the switch succeeded.
#[tauri::command]
pub async fn change_data_dir(app: AppHandle, path: PathBuf, mov: bool) -> CmdResult {
    runtime::stop_all(&app);
    store(&app).change_data_dir(path, mov).map_err(|e| e.to_string())?;
    runtime::reload_library(&app, false);
    Ok(())
}

#[tauri::command]
pub fn retry_data_dir(app: AppHandle) {
    store(&app).retry_data_dir();
    let keep = store(&app).settings.restore_enabled_sets;
    runtime::reload_library(&app, keep);
}

/// For a busy port: saves the first free one from the current port up and restarts the server there.
#[tauri::command]
pub async fn pick_free_port(app: AppHandle) -> CmdResult<u16> {
    let (old, r, port) = {
        let mut s = store(&app);
        let port = server::find_free_port(s.settings.api_port).ok_or("no free port")?;
        let old = s.settings.clone();
        s.settings.api_port = port;
        (old, s.save_settings(), port)
    };
    let applied = runtime::apply_settings(&app, &old);
    r.map_err(|e| e.to_string())?;
    applied.map(|_| port)
}
