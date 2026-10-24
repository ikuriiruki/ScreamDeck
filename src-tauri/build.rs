fn main() {
    // The comctl32 v6 manifest is linked into every binary, test executables included:
    // tauri-build would embed it in the app only, and tests then fail with STATUS_ENTRYPOINT_NOT_FOUND.
    let manifest = std::env::current_dir().unwrap().join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    println!("cargo:rustc-link-arg=/WX");
    // Listing the commands makes each one need an `allow-*` permission, so the overlay windows
    // (capabilities/overlay.json) get only the two they use. Keep in sync with lib.rs.
    let app = tauri_build::AppManifest::new().commands(&[
        "get_library", "get_settings", "get_status", "save_screamer", "delete_screamer", "import_media", "import_sound",
        "discard_media", "save_thumbnail", "save_set", "delete_set", "set_enabled", "trigger_test", "stop",
        "update_settings", "reset_settings", "list_monitors", "player_ready", "inspect_data_dir", "change_data_dir",
        "open_data_dir", "retry_data_dir", "pick_free_port", "export_bundle", "inspect_bundle", "import_bundle",
    ]);
    let attrs = tauri_build::Attributes::new()
        .app_manifest(app)
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
