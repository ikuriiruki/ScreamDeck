use crate::model::{Library, MediaKind, ScreamSet, Screamer, Settings, Sound};
use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum DataDirStatus {
    Ok,
    Unavailable { path: PathBuf },
    Corrupt { backup: PathBuf },
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DirState {
    HasLibrary,
    Empty,
    NotWritable,
}

#[derive(Debug)]
pub enum StoreError {
    Io(io::Error),
    UnsupportedExtension,
    NotWritable,
    DestinationNotEmpty,
}

impl From<io::Error> for StoreError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "{e}"),
            Self::UnsupportedExtension => write!(f, "unsupported file type"),
            Self::NotWritable => write!(f, "folder is not writable"),
            Self::DestinationNotEmpty => write!(f, "destination already contains a library"),
        }
    }
}

pub struct Store {
    pub config_dir: PathBuf,
    pub settings: Settings,
    pub library: Library,
    pub data_dir_status: DataDirStatus,
}

fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn ext_of(p: &Path) -> Option<String> {
    Some(p.extension()?.to_str()?.to_ascii_lowercase())
}

fn is_plain_name(n: &str) -> bool {
    !n.is_empty() && !n.contains(['/', '\\']) && !n.contains("..")
}

/// Reads `<dir>/library.json`; a corrupt file is renamed aside, never overwritten
/// (if it can't be renamed, the folder is `Unavailable` so nothing writes over it).
fn read_library(dir: &Path) -> (Library, DataDirStatus) {
    let path = dir.join("library.json");
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return (Library::default(), DataDirStatus::Ok),
        // unreadable is not empty: refuse writes so a later save cannot clobber it
        Err(_) => return (Library::default(), DataDirStatus::Unavailable { path: dir.to_path_buf() }),
    };
    match serde_json::from_str(&text) {
        Ok(lib) => (lib, DataDirStatus::Ok),
        Err(_) => {
            let backup = dir.join(format!("library.broken-{}.json", unix_now()));
            match fs::rename(&path, &backup) {
                Ok(()) => (Library::default(), DataDirStatus::Corrupt { backup }),
                Err(_) => (Library::default(), DataDirStatus::Unavailable { path: dir.to_path_buf() }),
            }
        }
    }
}

fn copy_files(src: &Path, dst: &Path, copied: &mut Vec<PathBuf>) -> io::Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for e in fs::read_dir(src)? {
        let e = e?;
        let to = dst.join(e.file_name());
        let n = fs::copy(e.path(), &to)?;
        copied.push(to);
        if n != e.metadata()?.len() {
            return Err(io::Error::other("copied size mismatch"));
        }
    }
    Ok(())
}

fn count_files(dir: &Path) -> usize {
    fs::read_dir(dir).map_or(0, |r| r.count())
}

impl Store {
    pub fn load(config_dir: PathBuf) -> Store {
        let settings: Settings = fs::read_to_string(config_dir.join("settings.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        let dir = settings.data_dir.clone().unwrap_or_else(|| config_dir.clone());
        let (library, data_dir_status) = if settings.data_dir.is_some() && !dir.is_dir() {
            (Library::default(), DataDirStatus::Unavailable { path: dir })
        } else {
            read_library(&dir)
        };
        Store { config_dir, settings, library, data_dir_status }
    }

    pub fn data_dir(&self) -> PathBuf {
        self.settings.data_dir.clone().unwrap_or_else(|| self.config_dir.clone())
    }
    pub fn media_dir(&self) -> PathBuf {
        self.data_dir().join("media")
    }
    pub fn thumbs_dir(&self) -> PathBuf {
        self.data_dir().join("thumbs")
    }

    pub fn save_library(&self) -> io::Result<()> {
        if matches!(self.data_dir_status, DataDirStatus::Unavailable { .. }) {
            return Ok(());
        }
        write_atomic(&self.data_dir().join("library.json"), &serde_json::to_vec_pretty(&self.library)?)
    }

    pub fn save_settings(&self) -> io::Result<()> {
        write_atomic(&self.config_dir.join("settings.json"), &serde_json::to_vec_pretty(&self.settings)?)
    }

    fn import(&self, src: &Path, allowed: &[&str]) -> Result<(String, String), StoreError> {
        let ext = ext_of(src).filter(|e| allowed.contains(&e.as_str())).ok_or(StoreError::UnsupportedExtension)?;
        fs::create_dir_all(self.media_dir())?;
        let name = format!("{}.{ext}", uuid::Uuid::new_v4());
        fs::copy(src, self.media_dir().join(&name))?;
        Ok((name, ext))
    }

    pub fn import_media(&self, src: &Path) -> Result<(String, MediaKind), StoreError> {
        let (name, ext) = self.import(src, &["gif", "png", "jpg", "jpeg", "webp", "mp4", "webm", "mov"])?;
        let kind = match ext.as_str() {
            "gif" => MediaKind::Gif,
            "mp4" | "webm" | "mov" => MediaKind::Video,
            _ => MediaKind::Image,
        };
        Ok((name, kind))
    }

    pub fn import_sound(&self, src: &Path) -> Result<String, StoreError> {
        Ok(self.import(src, &["mp3", "ogg", "wav", "m4a"])?.0)
    }

    fn is_referenced(&self, file: &str) -> bool {
        self.library.screamers.iter().any(|s| {
            s.media.file == file || matches!(&s.sound, Sound::File { file: f, .. } if f == file)
        })
    }

    pub fn discard_media(&self, files: &[String]) {
        for f in files {
            if is_plain_name(f) && !self.is_referenced(f) {
                let _ = fs::remove_file(self.media_dir().join(f));
            }
        }
    }

    pub fn save_thumbnail(&self, id: &str, jpeg: &[u8]) -> io::Result<String> {
        if !is_plain_name(id) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "bad thumbnail id"));
        }
        fs::create_dir_all(self.thumbs_dir())?;
        let name = format!("{id}.jpg");
        fs::write(self.thumbs_dir().join(&name), jpeg)?;
        Ok(format!("thumbs/{name}"))
    }

    pub fn upsert_screamer(&mut self, s: Screamer) {
        match self.library.screamers.iter_mut().find(|x| x.id == s.id) {
            Some(x) => *x = s,
            None => self.library.screamers.push(s),
        }
    }

    pub fn delete_screamer(&mut self, id: &str) {
        let Some(i) = self.library.screamers.iter().position(|s| s.id == id) else { return };
        let s = self.library.screamers.remove(i);
        for set in &mut self.library.sets {
            set.items.retain(|it| it.screamer_id != id);
        }
        let mut files = vec![s.media.file];
        if let Sound::File { file, .. } = s.sound {
            files.push(file);
        }
        self.discard_media(&files);
        if is_plain_name(id) {
            let _ = fs::remove_file(self.thumbs_dir().join(format!("{id}.jpg")));
        }
    }

    /// A stored set keeps its `enabled` (written back into `s`): only turning it on/off changes that.
    pub fn upsert_set(&mut self, s: &mut ScreamSet) {
        match self.library.sets.iter_mut().find(|x| x.id == s.id) {
            Some(x) => {
                s.enabled = x.enabled;
                *x = s.clone();
            }
            None => self.library.sets.push(s.clone()),
        }
    }

    pub fn delete_set(&mut self, id: &str) {
        self.library.sets.retain(|s| s.id != id);
    }

    pub fn reset_settings(&mut self) {
        self.settings = Settings { data_dir: self.settings.data_dir.take(), ..Default::default() };
    }

    pub fn inspect_dir(path: &Path) -> DirState {
        let probe = path.join(format!(".screamdeck-probe-{}", unix_now()));
        if !path.is_dir() || fs::write(&probe, b"").is_err() {
            return DirState::NotWritable;
        }
        let _ = fs::remove_file(&probe);
        if path.join("library.json").is_file() { DirState::HasLibrary } else { DirState::Empty }
    }

    pub fn change_data_dir(&mut self, path: PathBuf, mov: bool) -> Result<(), StoreError> {
        if Self::inspect_dir(&path) == DirState::NotWritable {
            return Err(StoreError::NotWritable);
        }
        let old = self.data_dir();
        let prev = self.settings.data_dir.clone();
        if !mov {
            self.settings.data_dir = Some(path.clone());
            if let Err(e) = self.save_settings() {
                self.settings.data_dir = prev;
                return Err(e.into());
            }
            let (lib, status) = read_library(&path);
            self.library = lib;
            self.data_dir_status = status;
            return Ok(());
        }
        if path == old {
            return Ok(());
        }
        if path.join("library.json").exists() || count_files(&path.join("media")) > 0 || count_files(&path.join("thumbs")) > 0 {
            return Err(StoreError::DestinationNotEmpty);
        }
        let mut copied = Vec::new();
        let r = (|| -> Result<(), StoreError> {
            self.save_library()?;
            if old.join("library.json").is_file() {
                fs::copy(old.join("library.json"), path.join("library.json"))?;
                copied.push(path.join("library.json"));
            }
            for sub in ["media", "thumbs"] {
                copy_files(&old.join(sub), &path.join(sub), &mut copied)?;
                if count_files(&old.join(sub)) != count_files(&path.join(sub)) {
                    return Err(io::Error::other("file count mismatch").into());
                }
            }
            self.settings.data_dir = Some(path.clone());
            self.save_settings()?;
            Ok(())
        })();
        if let Err(e) = r {
            self.settings.data_dir = prev;
            for f in copied {
                let _ = fs::remove_file(f);
            }
            return Err(e);
        }
        self.data_dir_status = DataDirStatus::Ok;
        let _ = fs::remove_file(old.join("library.json"));
        let _ = fs::remove_dir_all(old.join("media"));
        let _ = fs::remove_dir_all(old.join("thumbs"));
        Ok(())
    }

    pub fn retry_data_dir(&mut self) {
        *self = Store::load(self.config_dir.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Fit, Media, SetItem};
    use std::fs;
    use tempfile::tempdir;

    fn mk(id: &str, file: &str) -> Screamer {
        Screamer {
            id: id.into(),
            name: id.into(),
            media: Media { file: file.into(), ..Default::default() },
            ..Default::default()
        }
    }

    #[test]
    fn old_json_with_missing_fields_loads() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("library.json"), r#"{"screamers":[{"id":"a","name":"A","media":{"file":"a.png","kind":"image"}}],"sets":[{"id":"s","name":"S","items":[{"screamerId":"a"}]}]}"#).unwrap();
        let s = Store::load(d.path().to_path_buf());
        assert_eq!(s.library.screamers[0].volume, 100);
        assert_eq!(s.library.screamers[0].opacity, 100);
        assert_eq!(s.library.screamers[0].fit, Fit::Cover);
        assert!(s.library.sets[0].api_enabled);
        assert_eq!(s.library.sets[0].items[0].weight, 1);
        assert_eq!(s.library.sets[0].min_interval_ms, 300_000);
    }

    #[test]
    fn unknown_fields_are_ignored() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("library.json"), r#"{"version":1,"futureThing":42,"screamers":[],"sets":[]}"#).unwrap();
        let s = Store::load(d.path().to_path_buf());
        assert!(matches!(s.data_dir_status, DataDirStatus::Ok));
    }

    #[test]
    fn corrupt_library_is_preserved() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("library.json"), "{not json").unwrap();
        let s = Store::load(d.path().to_path_buf());
        let DataDirStatus::Corrupt { backup } = &s.data_dir_status else { panic!("not corrupt") };
        assert!(backup.file_name().unwrap().to_string_lossy().starts_with("library.broken-"));
        assert_eq!(fs::read_to_string(backup).unwrap(), "{not json");
        assert!(!d.path().join("library.json").exists());
    }

    #[test]
    #[cfg(windows)]
    fn corrupt_library_that_cannot_be_renamed_is_unavailable() {
        use std::os::windows::fs::OpenOptionsExt;
        let d = tempdir().unwrap();
        let path = d.path().join("library.json");
        fs::write(&path, "{not json").unwrap();
        // FILE_SHARE_READ only: readable, but the rename (needs delete access) fails
        let _held = fs::OpenOptions::new().read(true).share_mode(1).open(&path).unwrap();
        let s = Store::load(d.path().to_path_buf());
        assert!(matches!(s.data_dir_status, DataDirStatus::Unavailable { .. }), "{:?}", s.data_dir_status);
        s.save_library().unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{not json");
    }

    #[test]
    fn upsert_set_keeps_stored_enabled() {
        let d = tempdir().unwrap();
        let mut s = Store::load(d.path().to_path_buf());
        s.upsert_set(&mut ScreamSet { id: "s".into(), enabled: true, ..Default::default() });
        let mut edit = ScreamSet { id: "s".into(), name: "renamed".into(), enabled: false, ..Default::default() };
        s.upsert_set(&mut edit);
        assert!(edit.enabled);
        assert!(s.library.sets[0].enabled);
        assert_eq!(s.library.sets[0].name, "renamed");
    }

    #[test]
    fn unavailable_data_dir_writes_nothing() {
        let d = tempdir().unwrap();
        let gone = d.path().join("gone");
        fs::write(d.path().join("settings.json"), serde_json::json!({ "dataDir": gone }).to_string()).unwrap();
        let s = Store::load(d.path().to_path_buf());
        assert!(matches!(s.data_dir_status, DataDirStatus::Unavailable { .. }));
        s.save_library().unwrap();
        assert!(!gone.exists());
    }

    #[test]
    fn import_media_rejects_unsupported_extension() {
        let d = tempdir().unwrap();
        let s = Store::load(d.path().join("cfg"));
        let src = d.path().join("x.exe");
        fs::write(&src, "x").unwrap();
        assert!(s.import_media(&src).is_err());
        assert!(s.import_sound(&src).is_err());
        assert!(!s.media_dir().exists() || fs::read_dir(s.media_dir()).unwrap().count() == 0);
    }

    #[test]
    fn import_media_copies_and_detects_kind() {
        let d = tempdir().unwrap();
        let s = Store::load(d.path().join("cfg"));
        for (n, k) in [("a.GIF", MediaKind::Gif), ("a.jpeg", MediaKind::Image), ("a.webm", MediaKind::Video), ("a.MOV", MediaKind::Video)] {
            let src = d.path().join(n);
            fs::write(&src, "x").unwrap();
            let (name, kind) = s.import_media(&src).unwrap();
            assert_eq!(kind, k);
            assert!(s.media_dir().join(name).exists());
        }
    }

    #[test]
    fn delete_screamer_removes_set_items() {
        let d = tempdir().unwrap();
        let mut s = Store::load(d.path().to_path_buf());
        fs::create_dir_all(s.media_dir()).unwrap();
        fs::write(s.media_dir().join("a.png"), "x").unwrap();
        fs::write(s.media_dir().join("b.png"), "x").unwrap();
        s.upsert_screamer(mk("a", "a.png"));
        s.upsert_screamer(mk("b", "b.png"));
        s.upsert_set(&mut ScreamSet {
            id: "s".into(),
            items: vec![SetItem { screamer_id: "a".into(), weight: 3 }, SetItem { screamer_id: "b".into(), weight: 1 }],
            ..Default::default()
        });
        s.delete_screamer("a");
        assert_eq!(s.library.sets[0].items.len(), 1);
        assert_eq!(s.library.sets[0].items[0].screamer_id, "b");
        assert!(!s.media_dir().join("a.png").exists());
        assert!(s.media_dir().join("b.png").exists());
    }

    #[test]
    fn discard_media_keeps_referenced_and_ignores_traversal() {
        let d = tempdir().unwrap();
        let cfg = d.path().join("cfg");
        let mut s = Store::load(cfg.clone());
        fs::create_dir_all(s.media_dir()).unwrap();
        fs::write(cfg.join("settings.json"), "{}").unwrap();
        fs::write(s.media_dir().join("used.png"), "x").unwrap();
        fs::write(s.media_dir().join("free.png"), "x").unwrap();
        s.upsert_screamer(mk("a", "used.png"));
        s.discard_media(&["../settings.json".into(), r"..\settings.json".into(), "used.png".into(), "free.png".into()]);
        assert!(cfg.join("settings.json").exists());
        assert!(s.media_dir().join("used.png").exists());
        assert!(!s.media_dir().join("free.png").exists());
    }

    #[test]
    fn reset_settings_keeps_data_dir() {
        let d = tempdir().unwrap();
        let mut s = Store::load(d.path().to_path_buf());
        s.settings.data_dir = Some(d.path().join("data"));
        s.settings.api_port = 1;
        s.reset_settings();
        assert_eq!(s.settings.api_port, 7811);
        assert_eq!(s.settings.data_dir, Some(d.path().join("data")));
    }

    #[test]
    fn move_data_dir_copies_then_switches() {
        let d = tempdir().unwrap();
        let new = d.path().join("new");
        fs::create_dir_all(&new).unwrap();
        let mut s = Store::load(d.path().join("cfg"));
        let src = d.path().join("p.png");
        fs::write(&src, "pixels").unwrap();
        let (f, _) = s.import_media(&src).unwrap();
        s.upsert_screamer(mk("a", &f));
        let old_media = s.media_dir().join(&f);
        s.change_data_dir(new.clone(), true).unwrap();
        assert!(new.join("media").join(&f).exists());
        assert!(new.join("library.json").exists());
        assert!(!old_media.exists());
        assert!(!d.path().join("cfg").join("library.json").exists());
        assert_eq!(s.settings.data_dir, Some(new.clone()));
        assert_eq!(Store::load(d.path().join("cfg")).library.screamers.len(), 1);
    }

    #[test]
    fn open_existing_library_leaves_old_in_place() {
        let d = tempdir().unwrap();
        let other = d.path().join("other");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("library.json"), r#"{"screamers":[{"id":"z"}]}"#).unwrap();
        let mut s = Store::load(d.path().join("cfg"));
        s.upsert_screamer(mk("a", "a.png"));
        s.save_library().unwrap();
        assert!(matches!(Store::inspect_dir(&other), DirState::HasLibrary));
        s.change_data_dir(other.clone(), false).unwrap();
        assert_eq!(s.library.screamers[0].id, "z");
        assert!(d.path().join("cfg").join("library.json").exists());
        assert_eq!(s.settings.data_dir, Some(other));
    }

    #[test]
    fn unreadable_library_is_unavailable_and_untouched() {
        let d = tempdir().unwrap();
        fs::create_dir(d.path().join("library.json")).unwrap();
        let s = Store::load(d.path().to_path_buf());
        assert!(matches!(s.data_dir_status, DataDirStatus::Unavailable { .. }));
        s.save_library().unwrap();
        assert!(d.path().join("library.json").is_dir());
    }

    #[test]
    fn move_into_existing_library_is_refused() {
        let d = tempdir().unwrap();
        let new = d.path().join("new");
        fs::create_dir_all(new.join("media")).unwrap();
        fs::write(new.join("library.json"), "THEIRS").unwrap();
        fs::write(new.join("media").join("m.png"), "THEIRS").unwrap();
        let mut s = Store::load(d.path().join("cfg"));
        s.upsert_screamer(mk("a", "a.png"));
        s.save_library().unwrap();
        assert!(s.change_data_dir(new.clone(), true).is_err());
        assert_eq!(fs::read_to_string(new.join("library.json")).unwrap(), "THEIRS");
        assert_eq!(fs::read_to_string(new.join("media").join("m.png")).unwrap(), "THEIRS");
        assert!(d.path().join("cfg").join("library.json").exists());
        assert_eq!(s.settings.data_dir, None);
    }
}
