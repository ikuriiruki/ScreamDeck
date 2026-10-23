use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNOACTIVATE, SHOW_WINDOW_CMD, ShowWindow};

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

pub fn list_monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let name = m.name().cloned().unwrap_or_default();
            MonitorInfo {
                primary: primary.as_ref() == Some(&name),
                x: m.position().x,
                y: m.position().y,
                width: m.size().width,
                height: m.size().height,
                name,
            }
        })
        .collect()
}

/// One overlay window per selected (and connected) monitor, labels `mon-0..`.
/// Windows are created hidden and are shown only around a show (spike outcome: variant A, "hidden").
pub fn open_monitor_windows(app: &AppHandle, monitor_names: &[String], hide_from_capture: bool) -> tauri::Result<()> {
    let monitors = app.available_monitors()?;
    let targets: Vec<_> = monitor_names
        .iter()
        .filter_map(|n| monitors.iter().find(|m| m.name() == Some(n)))
        .collect();

    for (label, w) in app.webview_windows() {
        if mon_index(&label).is_some_and(|i| i >= targets.len()) {
            w.destroy()?;
        }
    }

    for (i, m) in targets.iter().enumerate() {
        let label = format!("mon-{i}");
        let w = match app.get_webview_window(&label) {
            Some(w) => w,
            None => {
                let url = format!("overlay.html?mode=pc&audio={}", u8::from(i == 0));
                WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
                    .title("ScreamDeck overlay")
                    .decorations(false)
                    .transparent(true)
                    .shadow(false)
                    .resizable(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .focused(false)
                    // WS_EX_NOACTIVATE, kept by tao across its own style updates.
                    .focusable(false)
                    .visible(false)
                    .build()?
            }
        };
        w.set_position(*m.position())?;
        w.set_size(*m.size())?;
        // WS_EX_TRANSPARENT | WS_EX_LAYERED: clicks go through to the game.
        w.set_ignore_cursor_events(true)?;
        w.set_content_protected(hide_from_capture)?;
    }
    Ok(())
}

pub fn show_monitor_windows(app: &AppHandle) {
    for_each_monitor_window(app, SW_SHOWNOACTIVATE);
}

/// Call after `player://end` has cleared the page and it had a frame to render (~100 ms),
/// otherwise the next show can flash the last frame of the previous screamer.
pub fn hide_monitor_windows(app: &AppHandle) {
    for_each_monitor_window(app, SW_HIDE);
}

// Win32 directly: tao's show() would use SW_SHOW and may activate the window.
fn for_each_monitor_window(app: &AppHandle, cmd: SHOW_WINDOW_CMD) {
    for (label, w) in app.webview_windows() {
        if mon_index(&label).is_some()
            && let Ok(hwnd) = hwnd(&w)
        {
            unsafe {
                let _ = ShowWindow(hwnd, cmd);
            }
        }
    }
}

pub(crate) fn hwnd(w: &WebviewWindow) -> tauri::Result<HWND> {
    Ok(HWND(w.hwnd()?.0))
}

fn mon_index(label: &str) -> Option<usize> {
    label.strip_prefix("mon-")?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::mon_index;

    #[test]
    fn only_monitor_labels_are_matched() {
        assert_eq!(mon_index("mon-0"), Some(0));
        assert_eq!(mon_index("mon-12"), Some(12));
        assert_eq!(mon_index("main"), None);
        assert_eq!(mon_index("mon-x"), None);
    }
}
