mod bundle;
mod commands;
mod model;
mod monitors;
mod pick;
mod player;
mod runtime;
mod server;
mod store;

use model::Settings;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, Runtime, WebviewWindowBuilder};

fn is_ru(settings: &Settings) -> bool {
    match settings.language.as_deref() {
        Some(l) => l.starts_with("ru"),
        // LANG_RUSSIAN in the primary-language bits of the UI LANGID
        None => (unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() } & 0x3ff) == 0x19,
    }
}

pub(crate) fn tray_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Menu<R>> {
    let [open, stop, quit] = if is_ru(settings) { ["Открыть", "Стоп", "Выход"] } else { ["Open", "Stop", "Quit"] };
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", open, true, None::<&str>)?,
            &MenuItem::with_id(app, "stop", stop, true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", quit, true, None::<&str>)?,
        ],
    )
}

/// Focuses the main window, or recreates it: closing destroys it to free the webview.
fn open_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    } else if let Some(cfg) = app.config().app.windows.iter().find(|w| w.label == "main") {
        let _ = WebviewWindowBuilder::from_config(app, cfg).and_then(|b| b.build());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let store = store::Store::load(app.path().app_config_dir()?);
            let menu = tray_menu(app.handle(), &store.settings)?;
            app.manage(runtime::AppState::new(store));
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().ok_or("no app icon")?)
                .tooltip("ScreamDeck")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "open" => open_main(app),
                    "stop" => runtime::stop_all(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        open_main(tray.app_handle());
                    }
                })
                .build(app)?;
            runtime::init(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library,
            commands::get_settings,
            commands::get_status,
            commands::save_screamer,
            commands::delete_screamer,
            commands::import_media,
            commands::import_sound,
            commands::discard_media,
            commands::save_thumbnail,
            commands::save_set,
            commands::delete_set,
            commands::set_enabled,
            commands::trigger_test,
            commands::stop,
            commands::update_settings,
            commands::reset_settings,
            commands::list_monitors,
            commands::player_ready,
            commands::inspect_data_dir,
            commands::change_data_dir,
            commands::retry_data_dir,
            commands::pick_free_port,
            commands::export_bundle,
            commands::inspect_bundle,
            commands::import_bundle,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, e| {
            // Closing the last window keeps the app in the tray; only "Quit" (exit code set) exits.
            if let RunEvent::ExitRequested { code: None, api, .. } = e {
                api.prevent_exit();
            }
        });
}
