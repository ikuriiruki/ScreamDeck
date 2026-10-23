use crate::model::{Id, Settings, Show, Sound, Target};
use crate::monitors;
use crate::pick::{next_delay_ms, pick_weighted};
use crate::player::{Effect, Player, Rejected, Source};
use crate::store::{DataDirStatus, Store};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::async_runtime::{spawn, JoinHandle};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tokio::sync::{broadcast, oneshot};
use tokio::time::{sleep, timeout};

const READY_TIMEOUT: Duration = Duration::from_secs(2);
// Lets the page render an empty frame after `end`, so the next show can't flash the old one.
const HIDE_DELAY: Duration = Duration::from_millis(100);

#[derive(Clone, Debug)]
#[allow(dead_code)] // read by the SSE feed (Task 6)
pub enum OverlayEvent {
    Prepare(Show),
    Play { show_id: u64 },
    End { show_id: u64 },
    Preload { files: Vec<String> },
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
#[allow(dead_code)] // Running/PortBusy come with the server (Task 6)
pub enum ServerStatus {
    Running { port: u16 },
    PortBusy { port: u16 },
    Stopped,
}

#[derive(Debug)]
#[allow(dead_code)] // ApiDisabled and the Rejected reason are for the API (Task 6), which alone checks `api_enabled`
pub enum SetTriggerError {
    NotFound,
    ApiDisabled,
    Empty,
    Rejected(Rejected),
}

pub struct SetRun {
    pub next_screamer: Option<Id>,
    pub task: JoinHandle<()>,
}

/// The show the driver is running; mirrors `Player`'s current show (updated under the player lock).
struct ActiveShow {
    id: u64,
    waiting: usize,
    ready: Option<oneshot::Sender<()>>,
    on_screen: bool,
}

// Lock order: store → sets → player → show.
pub struct AppState {
    pub store: Mutex<Store>,
    pub player: Mutex<Player>,
    pub sets: Mutex<HashMap<Id, SetRun>>,
    pub overlay_tx: broadcast::Sender<OverlayEvent>,
    pub server: Mutex<ServerStatus>,
    pub hotkey_error: Mutex<Option<String>>,
    show: Mutex<Option<ActiveShow>>,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            store: Mutex::new(store),
            player: Mutex::default(),
            sets: Mutex::default(),
            overlay_tx: broadcast::channel(64).0,
            server: Mutex::new(ServerStatus::Stopped),
            hotkey_error: Mutex::default(),
            show: Mutex::default(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled_sets: Vec<Id>,
    pub server: ServerStatus,
    pub data_dir: DataDirStatus,
    pub data_path: PathBuf,
    pub hotkey_error: Option<String>,
    pub version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShowRef {
    show_id: u64,
}

pub fn request_show<R: Runtime>(app: &AppHandle<R>, screamer_id: &str, target: Target, source: Source) -> Result<(), Rejected> {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    let mut player = st.player.lock().unwrap();
    let fx = player.request(screamer_id, target, source, &store.library)?;
    apply(app, fx);
    Ok(())
}

/// Timer requests show the set's preselected (preloaded) `next_screamer`; others pick now.
pub fn request_from_set<R: Runtime>(app: &AppHandle<R>, set_id: &str, target: Target, source: Source) -> Result<(), SetTriggerError> {
    let st = app.state::<AppState>();
    let id = {
        let store = st.store.lock().unwrap();
        let set = store.library.sets.iter().find(|s| s.id == set_id).ok_or(SetTriggerError::NotFound)?;
        if source == Source::Timer {
            st.sets.lock().unwrap().get(set_id).and_then(|r| r.next_screamer.clone())
        } else {
            pick_weighted(set, &store.library, rand::random())
        }
    }
    .ok_or(SetTriggerError::Empty)?;
    request_show(app, &id, target, source).map_err(SetTriggerError::Rejected)
}

pub fn stop_all<R: Runtime>(app: &AppHandle<R>) {
    let st = app.state::<AppState>();
    let mut player = st.player.lock().unwrap();
    let fx = player.stop();
    apply(app, fx);
}

pub fn set_enabled<R: Runtime>(app: &AppHandle<R>, set_id: &str, enabled: bool) {
    {
        let st = app.state::<AppState>();
        let mut store = st.store.lock().unwrap();
        let Some(set) = store.library.sets.iter_mut().find(|s| s.id == set_id) else { return };
        set.enabled = enabled;
        let _ = store.save_library();
    }
    on_library_changed(app);
}

pub fn player_ready<R: Runtime>(app: &AppHandle<R>, show_id: u64) {
    let st = app.state::<AppState>();
    let mut show = st.show.lock().unwrap();
    if let Some(s) = show.as_mut().filter(|s| s.id == show_id) {
        s.waiting = s.waiting.saturating_sub(1);
        if s.waiting == 0
            && let Some(tx) = s.ready.take()
        {
            let _ = tx.send(());
        }
    }
}

/// Starts/stops set timers to match `enabled` and re-picks every running set's next screamer,
/// keeping the time of its next firing.
pub fn on_library_changed<R: Runtime>(app: &AppHandle<R>) {
    let st = app.state::<AppState>();
    {
        let store = st.store.lock().unwrap();
        let mut sets = st.sets.lock().unwrap();
        sets.retain(|id, run| {
            let keep = store.library.sets.iter().any(|s| &s.id == id && s.enabled);
            if !keep {
                run.task.abort();
            }
            keep
        });
        for set in store.library.sets.iter().filter(|s| s.enabled) {
            let next_screamer = pick_weighted(set, &store.library, rand::random());
            match sets.get_mut(&set.id) {
                Some(run) => run.next_screamer = next_screamer,
                None => {
                    let task = spawn_set_timer(app.clone(), set.id.clone(), next_delay_ms(set, rand::random()));
                    sets.insert(set.id.clone(), SetRun { next_screamer, task });
                }
            }
        }
    }
    emit_preload(app);
    let _ = app.emit("app://library", &st.store.lock().unwrap().library);
    emit_status(app);
}

pub fn apply_settings<R: Runtime>(app: &AppHandle<R>, old: &Settings) {
    let new = app.state::<AppState>().store.lock().unwrap().settings.clone();
    if new.monitors != old.monitors || new.hide_from_capture != old.hide_from_capture {
        let _ = monitors::open_monitor_windows(app, &new.monitors, new.hide_from_capture);
    }
    if new.stop_hotkey != old.stop_hotkey {
        register_hotkey(app, &new.stop_hotkey);
    }
    if new.autostart != old.autostart {
        use tauri_plugin_autostart::ManagerExt;
        let _ = if new.autostart { app.autolaunch().enable() } else { app.autolaunch().disable() };
    }
    if new.language != old.language
        && let (Some(tray), Ok(menu)) = (app.tray_by_id("main"), crate::tray_menu(app, &new))
    {
        let _ = tray.set_menu(Some(menu));
    }
    // api_port: the server restart lands with the server itself (Task 6).
    let _ = app.emit("app://settings", &new);
    emit_status(app);
}

/// After the store (re)loaded a library: startup, retry, or a new data folder.
/// `keep_enabled == false` turns every set off first.
pub fn reload_library<R: Runtime>(app: &AppHandle<R>, keep_enabled: bool) {
    {
        let st = app.state::<AppState>();
        let mut store = st.store.lock().unwrap();
        if !keep_enabled && store.library.sets.iter().any(|s| s.enabled) {
            store.library.sets.iter_mut().for_each(|s| s.enabled = false);
            let _ = store.save_library();
        }
        let scope = app.asset_protocol_scope();
        let _ = scope.allow_directory(store.media_dir(), true);
        let _ = scope.allow_directory(store.thumbs_dir(), true);
        let _ = app.emit("app://settings", &store.settings);
    }
    on_library_changed(app);
}

pub fn register_hotkey<R: Runtime>(app: &AppHandle<R>, hotkey: &str) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let err = if hotkey.is_empty() {
        None
    } else {
        gs.on_shortcut(hotkey, |app, _, e| {
            if e.state == ShortcutState::Pressed {
                stop_all(app);
            }
        })
        .err()
        .map(|e| e.to_string())
    };
    *app.state::<AppState>().hotkey_error.lock().unwrap() = err;
}

pub fn status<R: Runtime>(app: &AppHandle<R>) -> Status {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    Status {
        enabled_sets: store.library.sets.iter().filter(|s| s.enabled).map(|s| s.id.clone()).collect(),
        server: st.server.lock().unwrap().clone(),
        data_dir: store.data_dir_status.clone(),
        data_path: store.data_dir(),
        hotkey_error: st.hotkey_error.lock().unwrap().clone(),
        version: app.package_info().version.to_string(),
    }
}

fn emit_status<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit("app://status", status(app));
}

/// Media and sound files of every running set's next screamer.
fn preload_files<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    let sets = st.sets.lock().unwrap();
    let mut files = vec![];
    for id in sets.values().filter_map(|r| r.next_screamer.as_ref()) {
        if let Some(s) = store.library.screamers.iter().find(|s| &s.id == id) {
            files.push(s.media.file.clone());
            if let Sound::File { file, .. } = &s.sound {
                files.push(file.clone());
            }
        }
    }
    files.sort();
    files.dedup();
    files
}

fn emit_preload<R: Runtime>(app: &AppHandle<R>) {
    let files = preload_files(app);
    let _ = app.emit("player://preload", serde_json::json!({ "files": files }));
    let _ = app.state::<AppState>().overlay_tx.send(OverlayEvent::Preload { files });
}

fn spawn_set_timer<R: Runtime>(app: AppHandle<R>, set_id: Id, first_delay_ms: u64) -> JoinHandle<()> {
    spawn(async move {
        let mut delay = first_delay_ms;
        loop {
            sleep(Duration::from_millis(delay)).await;
            let _ = request_from_set(&app, &set_id, Target::Both, Source::Timer);
            match repick(&app, &set_id) {
                Some(d) => delay = d,
                None => return,
            }
            emit_preload(&app);
        }
    })
}

/// Chooses the set's next screamer and delay; `None` once the set no longer runs.
fn repick<R: Runtime>(app: &AppHandle<R>, set_id: &str) -> Option<u64> {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    let set = store.library.sets.iter().find(|s| s.id == set_id)?;
    let mut sets = st.sets.lock().unwrap();
    sets.get_mut(set_id)?.next_screamer = pick_weighted(set, &store.library, rand::random());
    Some(next_delay_ms(set, rand::random()))
}

/// Runs effects returned by `Player`; the caller still holds the player lock, so the
/// driver's `show` always mirrors the player's current show.
fn apply<R: Runtime>(app: &AppHandle<R>, fx: Vec<Effect>) {
    for e in fx {
        match e {
            Effect::End { show_id } => end_show(app, show_id),
            Effect::Prepare(show) => prepare_show(app, show),
        }
    }
}

fn prepare_show<R: Runtime>(app: &AppHandle<R>, show: Show) {
    let st = app.state::<AppState>();
    let windows = if show.target == Target::Overlay { 0 } else { monitors::monitor_window_count(app) };
    let (tx, rx) = oneshot::channel();
    *st.show.lock().unwrap() = Some(ActiveShow { id: show.show_id, waiting: windows, ready: Some(tx), on_screen: false });
    if windows > 0 {
        let _ = app.emit("player://prepare", &show);
    }
    let _ = st.overlay_tx.send(OverlayEvent::Prepare(show.clone()));
    let app = app.clone();
    spawn(async move {
        if windows > 0 {
            // Err: every window acked (Ok) or the show was replaced (sender dropped) — both fine.
            let _ = timeout(READY_TIMEOUT, rx).await;
        }
        play_show(&app, show.show_id, show.duration_ms, windows > 0);
    });
}

fn play_show<R: Runtime>(app: &AppHandle<R>, show_id: u64, duration_ms: u64, to_pc: bool) {
    let st = app.state::<AppState>();
    match st.show.lock().unwrap().as_mut() {
        Some(s) if s.id == show_id => s.on_screen = to_pc,
        _ => return,
    }
    // Window show/hide happen on the main thread, in order; a cross-thread ShowWindow
    // would block on the main thread, which may be waiting on our locks.
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let st = a.state::<AppState>();
        let show = st.show.lock().unwrap();
        if show.as_ref().is_some_and(|s| s.id == show_id) {
            if to_pc {
                monitors::show_monitor_windows(&a);
            }
            let _ = a.emit("player://play", ShowRef { show_id });
        }
    });
    let _ = st.overlay_tx.send(OverlayEvent::Play { show_id });
    let app = app.clone();
    spawn(async move {
        sleep(Duration::from_millis(duration_ms)).await;
        finish_show(&app, show_id);
    });
}

fn finish_show<R: Runtime>(app: &AppHandle<R>, show_id: u64) {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    let mut player = st.player.lock().unwrap();
    if !st.show.lock().unwrap().as_ref().is_some_and(|s| s.id == show_id) {
        return;
    }
    let mut fx = vec![Effect::End { show_id }];
    fx.extend(player.finished(show_id, &store.library));
    apply(app, fx);
}

fn end_show<R: Runtime>(app: &AppHandle<R>, show_id: u64) {
    let st = app.state::<AppState>();
    {
        let mut show = st.show.lock().unwrap();
        if show.as_ref().is_some_and(|s| s.id == show_id) {
            *show = None;
        }
    }
    let _ = app.emit("player://end", ShowRef { show_id });
    let _ = st.overlay_tx.send(OverlayEvent::End { show_id });
    let app = app.clone();
    spawn(async move {
        sleep(HIDE_DELAY).await;
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            let st = a.state::<AppState>();
            let show = st.show.lock().unwrap();
            if !show.as_ref().is_some_and(|s| s.on_screen) {
                monitors::hide_monitor_windows(&a);
            }
        });
    });
}

pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let settings = app.state::<AppState>().store.lock().unwrap().settings.clone();
    let _ = monitors::open_monitor_windows(app, &settings.monitors, settings.hide_from_capture);
    register_hotkey(app, &settings.stop_hotkey);
    reload_library(app, settings.restore_enabled_sets);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DurationMode, Library, Screamer};
    use tauri::async_runtime::block_on;

    fn recv(rx: &mut broadcast::Receiver<OverlayEvent>) -> OverlayEvent {
        block_on(async { timeout(Duration::from_secs(2), rx.recv()).await.expect("no event").unwrap() })
    }

    #[test]
    fn driver_ends_by_timer_and_on_stop() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::load(dir.path().to_path_buf());
        let screamer = |id: &str, ms| Screamer { id: id.into(), duration: DurationMode::Custom { ms }, ..Default::default() };
        store.library = Library { screamers: vec![screamer("short", 100), screamer("long", 60_000)], ..Default::default() };
        let app = tauri::test::mock_app();
        app.manage(AppState::new(store));
        let h = app.handle();
        let mut rx = app.state::<AppState>().overlay_tx.subscribe();

        request_show(h, "short", Target::Overlay, Source::Test).unwrap();
        assert!(matches!(recv(&mut rx), OverlayEvent::Prepare(s) if s.show_id == 1));
        assert!(matches!(recv(&mut rx), OverlayEvent::Play { show_id: 1 }));
        assert!(matches!(recv(&mut rx), OverlayEvent::End { show_id: 1 }));

        request_show(h, "long", Target::Overlay, Source::Test).unwrap();
        assert!(matches!(recv(&mut rx), OverlayEvent::Prepare(s) if s.show_id == 2));
        assert!(matches!(recv(&mut rx), OverlayEvent::Play { show_id: 2 }));
        stop_all(h);
        assert!(matches!(recv(&mut rx), OverlayEvent::End { show_id: 2 }));
        assert!(app.state::<AppState>().show.lock().unwrap().is_none());
    }
}
