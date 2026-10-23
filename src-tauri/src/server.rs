use crate::model::{show_duration_ms, Target};
use crate::player::Source;
use crate::runtime::{self, AppState, OverlayEvent, ServerStatus, SetTriggerError};
use axum::extract::{Path, Request, State};
use axum::http::header::{CONTENT_TYPE, HOST, ORIGIN};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::net::{Ipv4Addr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};
use tower_http::services::ServeFile;

/// Debug builds read these from disk at run time: `pnpm build` must have run.
#[derive(RustEmbed)]
#[folder = "../dist"]
struct Dist;

impl From<SetTriggerError> for StatusCode {
    fn from(e: SetTriggerError) -> Self {
        match e {
            SetTriggerError::NotFound => StatusCode::NOT_FOUND,
            SetTriggerError::ApiDisabled => StatusCode::FORBIDDEN,
            SetTriggerError::Empty => StatusCode::CONFLICT,
            SetTriggerError::Rejected(_) => StatusCode::TOO_MANY_REQUESTS,
        }
    }
}

/// Only our own origin, or none; Host pins the request to loopback against DNS rebinding.
pub fn check_request(host: Option<&str>, origin: Option<&str>, port: u16) -> Result<(), StatusCode> {
    let local = |scheme: &str, v: &str| ["127.0.0.1", "localhost"].iter().any(|h| v == format!("{scheme}{h}:{port}"));
    if host.is_some_and(|h| local("", h)) && origin.is_none_or(|o| local("http://", o)) {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

async fn guard(State(port): State<u16>, req: Request, next: Next) -> Response {
    let allowed = {
        // A header that isn't valid text counts as present and foreign.
        let header = |name| req.headers().get(name).map(|v| v.to_str().unwrap_or(""));
        check_request(header(HOST), header(ORIGIN), port)
    };
    match allowed {
        Ok(()) => next.run(req).await,
        Err(s) => s.into_response(),
    }
}

pub fn router<R: Runtime>(app: AppHandle<R>, port: u16) -> Router {
    Router::new()
        .route("/overlay", get(|| async { embedded("overlay.html") }))
        .route("/assets/{*path}", get(|Path(path): Path<String>| async move { embedded(&format!("assets/{path}")) }))
        .route("/media/{file}", get(media::<R>))
        .route("/thumbs/{file}", get(thumb::<R>))
        .route("/api/events", get(events::<R>))
        .route("/api/screamers", get(screamers::<R>))
        .route("/api/sets", get(sets::<R>))
        .route("/api/trigger/screamer/{id}", post(trigger_screamer::<R>))
        .route("/api/trigger/set/{id}", post(trigger_set::<R>))
        .route("/api/stop", post(stop::<R>))
        .route("/api/sets/{id}/{action}", post(set_action::<R>))
        .with_state(app)
        .layer(middleware::from_fn_with_state(port, guard))
}

fn embedded(path: &str) -> Response {
    match Dist::get(path) {
        Some(f) => ([(CONTENT_TYPE, f.metadata.mimetype().to_string())], f.data).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn media<R: Runtime>(State(app): State<AppHandle<R>>, Path(file): Path<String>, req: Request) -> Response {
    let dir = app.state::<AppState>().store.lock().unwrap().media_dir();
    serve_file(dir, &file, req).await
}

async fn thumb<R: Runtime>(State(app): State<AppHandle<R>>, Path(file): Path<String>, req: Request) -> Response {
    let dir = app.state::<AppState>().store.lock().unwrap().thumbs_dir();
    serve_file(dir, &file, req).await
}

/// Stored names are `<uuid>.<ext>`: anything else (separators, `..`, `:` streams) is not ours.
async fn serve_file(dir: PathBuf, file: &str, req: Request) -> Response {
    if file.contains("..") || !file.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match ServeFile::new(dir.join(file)).try_call(req).await {
        Ok(r) => r.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn events<R: Runtime>(State(app): State<AppHandle<R>>) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    // Subscribe before reading the preload list, so a change in between still arrives.
    let rx = app.state::<AppState>().overlay_tx.subscribe();
    let first = to_sse(OverlayEvent::Preload { files: runtime::preload_files(&app) }, &mut HashSet::new(), true);
    let mut forwarded = HashSet::new();
    let rest = BroadcastStream::new(rx).filter_map(move |e| {
        let sound = app.state::<AppState>().store.lock().unwrap().settings.overlay_sound;
        to_sse(e.ok()?, &mut forwarded, sound)
    });
    Sse::new(tokio_stream::iter(first).chain(rest)).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

/// Overlay pages get shows aimed at them, and Play/End only for shows they were prepared for.
fn to_sse(e: OverlayEvent, forwarded: &mut HashSet<u64>, overlay_sound: bool) -> Option<Result<Event, axum::Error>> {
    let (name, data) = match e {
        OverlayEvent::Prepare(mut show) if show.target != Target::Pc => {
            forwarded.insert(show.show_id);
            if !overlay_sound {
                show.screamer.volume = 0;
            }
            ("prepare", json!(show))
        }
        OverlayEvent::Play { show_id } if forwarded.contains(&show_id) => ("play", json!({ "showId": show_id })),
        OverlayEvent::End { show_id } if forwarded.remove(&show_id) => ("end", json!({ "showId": show_id })),
        OverlayEvent::Preload { files } => ("preload", json!({ "files": files })),
        _ => return None,
    };
    Some(Event::default().event(name).json_data(data))
}

async fn screamers<R: Runtime>(State(app): State<AppHandle<R>>) -> Json<Vec<Value>> {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    let list = store.library.screamers.iter();
    Json(list.map(|s| json!({ "id": s.id, "name": s.name, "kind": s.media.kind, "durationMs": show_duration_ms(s) })).collect())
}

async fn sets<R: Runtime>(State(app): State<AppHandle<R>>) -> Json<Vec<Value>> {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    let list = store.library.sets.iter();
    Json(list.map(|s| json!({ "id": s.id, "name": s.name, "enabled": s.enabled, "api": s.api_enabled, "size": s.items.len() })).collect())
}

fn accepted(queued: bool) -> Response {
    (StatusCode::ACCEPTED, Json(json!({ "queued": queued }))).into_response()
}

async fn trigger_screamer<R: Runtime>(State(app): State<AppHandle<R>>, Path(id): Path<String>) -> Result<Response, StatusCode> {
    if !app.state::<AppState>().store.lock().unwrap().library.screamers.iter().any(|s| s.id == id) {
        return Err(StatusCode::NOT_FOUND);
    }
    let queued = runtime::request_show(&app, &id, Target::Both, Source::Api).map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    Ok(accepted(queued))
}

/// The set's `enabled`, if the API may touch the set.
fn api_set<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<bool, SetTriggerError> {
    let st = app.state::<AppState>();
    let store = st.store.lock().unwrap();
    match store.library.sets.iter().find(|s| s.id == id) {
        None => Err(SetTriggerError::NotFound),
        Some(s) if !s.api_enabled => Err(SetTriggerError::ApiDisabled),
        Some(s) => Ok(s.enabled),
    }
}

async fn trigger_set<R: Runtime>(State(app): State<AppHandle<R>>, Path(id): Path<String>) -> Result<Response, StatusCode> {
    api_set(&app, &id)?;
    Ok(accepted(runtime::request_from_set(&app, &id, Target::Both, Source::Api)?))
}

async fn stop<R: Runtime>(State(app): State<AppHandle<R>>) -> StatusCode {
    runtime::stop_all(&app);
    StatusCode::NO_CONTENT
}

async fn set_action<R: Runtime>(State(app): State<AppHandle<R>>, Path((id, action)): Path<(String, String)>) -> Result<Response, StatusCode> {
    let want = match action.as_str() {
        "enable" => Some(true),
        "disable" => Some(false),
        "toggle" => None,
        _ => return Err(StatusCode::NOT_FOUND),
    };
    let current = api_set(&app, &id)?;
    let enabled = want.unwrap_or(!current);
    match runtime::set_enabled(&app, &id, enabled) {
        Ok(()) => Ok(Json(json!({ "enabled": enabled })).into_response()),
        Err(e) => Ok((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()),
    }
}

/// Windows lets a 127.0.0.1 bind succeed over another program's wildcard listener (and then
/// takes its loopback traffic), so a port that accepts a connection counts as busy.
fn in_use(port: u16) -> bool {
    TcpStream::connect_timeout(&(Ipv4Addr::LOCALHOST, port).into(), Duration::from_millis(200)).is_ok()
}

/// Replaces the running server, if any. Every bind failure (in use, or a port Windows reserves)
/// is `PortBusy`: the remedy is the same, another port.
pub async fn start<R: Runtime>(app: AppHandle<R>, port: u16) -> ServerStatus {
    if let Some(old) = app.state::<AppState>().server_task.lock().unwrap().take() {
        // ponytail: the old server's open connections (SSE) live on until their clients drop them.
        old.abort();
    }
    if in_use(port) {
        return ServerStatus::PortBusy { port };
    }
    match tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await {
        Ok(listener) => {
            let router = router(app.clone(), port);
            let task = tauri::async_runtime::spawn(async move {
                if let Err(e) = axum::serve(listener, router).await {
                    eprintln!("screamdeck: server: {e}");
                }
            });
            *app.state::<AppState>().server_task.lock().unwrap() = Some(task);
            ServerStatus::Running { port }
        }
        Err(e) => {
            eprintln!("screamdeck: binding port {port}: {e}");
            ServerStatus::PortBusy { port }
        }
    }
}

/// First free port in `from..=from+100`.
pub fn find_free_port(from: u16) -> Option<u16> {
    (from..=from.saturating_add(100)).find(|&p| !in_use(p) && std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, p)).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DurationMode, Library, ScreamSet, Screamer, SetItem};
    use crate::store::Store;
    use axum::body::{to_bytes, Body};
    use axum::http::header::HOST;
    use axum::http::Request;
    use tauri::test::MockRuntime;
    use tauri::{App, Manager};
    use tower::ServiceExt;

    fn app_with(library: Library) -> (tempfile::TempDir, App<MockRuntime>) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::load(dir.path().to_path_buf());
        store.library = library;
        let app = tauri::test::mock_app();
        app.manage(AppState::new(store));
        (dir, app)
    }

    async fn call(app: &App<MockRuntime>, method: &str, uri: &str) -> (StatusCode, String) {
        let req = Request::builder().method(method).uri(uri).header(HOST, "127.0.0.1:7811").body(Body::empty()).unwrap();
        let res = router(app.handle().clone(), 7811).oneshot(req).await.unwrap();
        let status = res.status();
        (status, String::from_utf8(to_bytes(res.into_body(), usize::MAX).await.unwrap().to_vec()).unwrap())
    }

    fn long(id: &str) -> Screamer {
        Screamer { id: id.into(), duration: DurationMode::Custom { ms: 60_000 }, ..Default::default() }
    }

    fn set(id: &str, items: &[&str], api_enabled: bool) -> ScreamSet {
        let items = items.iter().map(|i| SetItem { screamer_id: i.to_string(), weight: 1 }).collect();
        ScreamSet { id: id.into(), items, api_enabled, ..Default::default() }
    }

    #[test]
    fn guard_accepts_local_host_without_origin() {
        assert!(check_request(Some("127.0.0.1:7811"), None, 7811).is_ok());
        assert!(check_request(Some("localhost:7811"), Some("http://localhost:7811"), 7811).is_ok());
        assert!(check_request(Some("127.0.0.1:7811"), Some("http://127.0.0.1:7811"), 7811).is_ok());
    }

    #[test]
    fn guard_rejects_foreign_origin() {
        assert_eq!(check_request(Some("127.0.0.1:7811"), Some("https://evil.example"), 7811), Err(StatusCode::FORBIDDEN));
        assert_eq!(check_request(Some("127.0.0.1:7811"), Some("http://127.0.0.1:7812"), 7811), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn guard_rejects_null_origin() {
        assert_eq!(check_request(Some("127.0.0.1:7811"), Some("null"), 7811), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn guard_rejects_rebound_host() {
        assert_eq!(check_request(Some("evil.example:7811"), None, 7811), Err(StatusCode::FORBIDDEN));
        assert_eq!(check_request(None, None, 7811), Err(StatusCode::FORBIDDEN));
        assert_eq!(check_request(Some("127.0.0.1"), None, 7811), Err(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn guard_applies_to_routes() {
        let (_dir, app) = app_with(Library::default());
        let req = Request::post("/api/stop").header(HOST, "127.0.0.1:7811").header("origin", "https://evil.example").body(Body::empty()).unwrap();
        assert_eq!(router(app.handle().clone(), 7811).oneshot(req).await.unwrap().status(), StatusCode::FORBIDDEN);
        assert_eq!(call(&app, "POST", "/api/stop").await.0, StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn trigger_unknown_screamer_is_404() {
        let (_dir, app) = app_with(Library::default());
        assert_eq!(call(&app, "POST", "/api/trigger/screamer/ghost").await.0, StatusCode::NOT_FOUND);
        assert_eq!(call(&app, "POST", "/api/trigger/set/ghost").await.0, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn trigger_set_with_api_disabled_is_403() {
        let (_dir, app) = app_with(Library { screamers: vec![long("a")], sets: vec![set("s", &["a"], false)], ..Default::default() });
        assert_eq!(call(&app, "POST", "/api/trigger/set/s").await.0, StatusCode::FORBIDDEN);
        assert_eq!(call(&app, "POST", "/api/sets/s/enable").await.0, StatusCode::FORBIDDEN);
        assert!(!app.state::<AppState>().store.lock().unwrap().library.sets[0].enabled);
    }

    #[tokio::test]
    async fn trigger_empty_set_is_409() {
        let (_dir, app) = app_with(Library { sets: vec![set("s", &[], true)], ..Default::default() });
        assert_eq!(call(&app, "POST", "/api/trigger/set/s").await.0, StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn eleventh_queued_trigger_is_429() {
        let (_dir, app) = app_with(Library { screamers: vec![long("a")], sets: vec![set("s", &["a"], true)], ..Default::default() });
        assert_eq!(call(&app, "POST", "/api/trigger/screamer/a").await, (StatusCode::ACCEPTED, r#"{"queued":false}"#.into()));
        for _ in 0..5 {
            assert_eq!(call(&app, "POST", "/api/trigger/screamer/a").await, (StatusCode::ACCEPTED, r#"{"queued":true}"#.into()));
            assert_eq!(call(&app, "POST", "/api/trigger/set/s").await, (StatusCode::ACCEPTED, r#"{"queued":true}"#.into()));
        }
        assert_eq!(call(&app, "POST", "/api/trigger/screamer/a").await.0, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(call(&app, "POST", "/api/trigger/set/s").await.0, StatusCode::TOO_MANY_REQUESTS);
        crate::runtime::stop_all(app.handle());
    }

    #[tokio::test]
    async fn set_toggle_and_lists() {
        let (_dir, app) = app_with(Library { screamers: vec![long("a")], sets: vec![set("s", &["a"], true)], ..Default::default() });
        assert_eq!(call(&app, "POST", "/api/sets/s/toggle").await, (StatusCode::OK, r#"{"enabled":true}"#.into()));
        assert_eq!(call(&app, "POST", "/api/sets/s/disable").await, (StatusCode::OK, r#"{"enabled":false}"#.into()));
        assert_eq!(call(&app, "POST", "/api/sets/s/explode").await.0, StatusCode::NOT_FOUND);
        assert_eq!(call(&app, "GET", "/api/sets").await.1, r#"[{"api":true,"enabled":false,"id":"s","name":"","size":1}]"#);
        assert_eq!(call(&app, "GET", "/api/screamers").await.1, r#"[{"durationMs":60000,"id":"a","kind":"image","name":""}]"#);
    }

    #[tokio::test]
    async fn media_path_traversal_is_404() {
        let (dir, app) = app_with(Library::default());
        std::fs::create_dir_all(dir.path().join("media")).unwrap();
        std::fs::write(dir.path().join("media").join("a.png"), b"png").unwrap();
        std::fs::write(dir.path().join("settings.json"), b"{}").unwrap();
        assert_eq!(call(&app, "GET", "/media/a.png").await, (StatusCode::OK, "png".into()));
        assert_eq!(call(&app, "GET", "/media/..%2Fsettings.json").await.0, StatusCode::NOT_FOUND);
        assert_eq!(call(&app, "GET", "/media/..%5Csettings.json").await.0, StatusCode::NOT_FOUND);
        assert_eq!(call(&app, "GET", "/thumbs/..%2Fsettings.json").await.0, StatusCode::NOT_FOUND);
    }

    #[test]
    fn sse_forwards_only_overlay_shows_and_mutes_them() {
        let show = |id, target| crate::model::Show { show_id: id, screamer: long("a"), duration_ms: 1, target };
        let mut fwd = HashSet::new();
        assert!(to_sse(OverlayEvent::Prepare(show(1, Target::Pc)), &mut fwd, false).is_none());
        assert!(to_sse(OverlayEvent::Play { show_id: 1 }, &mut fwd, false).is_none());
        assert!(to_sse(OverlayEvent::End { show_id: 1 }, &mut fwd, false).is_none());
        let sse = |e, fwd: &mut HashSet<u64>, sound| format!("{:?}", to_sse(e, fwd, sound).unwrap().unwrap());
        assert!(sse(OverlayEvent::Prepare(show(2, Target::Both)), &mut fwd, false).contains(r#"\"volume\":0"#));
        assert!(sse(OverlayEvent::Play { show_id: 2 }, &mut fwd, false).contains("event: play"));
        assert!(sse(OverlayEvent::End { show_id: 2 }, &mut fwd, false).contains("event: end"));
        assert!(fwd.is_empty());
        assert!(sse(OverlayEvent::Preload { files: vec!["x.png".into()] }, &mut fwd, false).contains("x.png"));
        assert!(sse(OverlayEvent::Prepare(show(3, Target::Overlay)), &mut fwd, true).contains(r#"\"volume\":100"#));
    }

    #[tokio::test]
    async fn start_reports_busy_port_and_restart_frees_the_old_one() {
        let (_dir, app) = app_with(Library::default());
        let busy = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = busy.local_addr().unwrap().port();
        assert!(matches!(start(app.handle().clone(), port).await, ServerStatus::PortBusy { port: p } if p == port));
        let a = find_free_port(port.saturating_add(1)).unwrap();
        assert!(matches!(start(app.handle().clone(), a).await, ServerStatus::Running { port: p } if p == a));
        assert!(in_use(a));
        let b = find_free_port(a.saturating_add(1)).unwrap();
        assert!(matches!(start(app.handle().clone(), b).await, ServerStatus::Running { port: p } if p == b));
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(!in_use(a));
        app.state::<AppState>().server_task.lock().unwrap().take().unwrap().abort();
    }

    #[test]
    fn find_free_port_skips_busy() {
        let busy = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = busy.local_addr().unwrap().port();
        let free = find_free_port(port).unwrap();
        assert_ne!(free, port);
        assert!((port..=port + 100).contains(&free));
    }
}
