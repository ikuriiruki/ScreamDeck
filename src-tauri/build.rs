fn main() {
    // The comctl32 v6 manifest is linked into every binary, test executables included:
    // tauri-build would embed it in the app only, and tests then fail with STATUS_ENTRYPOINT_NOT_FOUND.
    let manifest = std::env::current_dir().unwrap().join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    println!("cargo:rustc-link-arg=/WX");
    let attrs = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
