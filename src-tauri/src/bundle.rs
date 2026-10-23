use crate::model::{Id, ScreamSet, Screamer, Sound};
use crate::store::Store;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const LIMIT: u64 = 1 << 30;
const MEDIA_EXT: &[&str] = &["gif", "png", "jpg", "jpeg", "webp", "mp4", "webm", "mp3", "ogg", "wav", "m4a"];

#[derive(Debug)]
pub enum BundleError {
    Io(io::Error),
    Zip(zip::result::ZipError),
    Json(serde_json::Error),
    Invalid(String),
    TooLarge,
    Newer,
}

impl From<io::Error> for BundleError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}
impl From<zip::result::ZipError> for BundleError {
    fn from(e: zip::result::ZipError) -> Self {
        Self::Zip(e)
    }
}
impl From<serde_json::Error> for BundleError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

impl std::fmt::Display for BundleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "{e}"),
            Self::Zip(e) => write!(f, "bad archive: {e}"),
            Self::Json(e) => write!(f, "bad manifest: {e}"),
            Self::Invalid(s) => write!(f, "invalid archive: {s}"),
            Self::TooLarge => write!(f, "archive is larger than 1 GB unpacked"),
            Self::Newer => write!(f, "archive is from a newer version"),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(default)]
pub struct Manifest {
    pub format: u32,
    pub app: String,
    pub screamers: Vec<Screamer>,
    pub sets: Vec<ScreamSet>,
}

impl Default for Manifest {
    fn default() -> Self {
        Self { format: 1, app: "ScreamDeck".into(), screamers: Vec::new(), sets: Vec::new() }
    }
}

#[derive(Debug, PartialEq)]
pub enum EntryKind {
    Manifest,
    Media(String),
    Thumb(String),
}

fn bad(name: &str) -> BundleError {
    BundleError::Invalid(format!("entry '{name}'"))
}

pub fn classify_entry(name: &str) -> Result<EntryKind, BundleError> {
    if name == "manifest.json" {
        return Ok(EntryKind::Manifest);
    }
    let parts: Vec<&str> = name.split('/').collect();
    let [dir, file] = parts[..] else { return Err(bad(name)) };
    let stem = file.split('.').next().unwrap_or("").to_ascii_lowercase();
    // Windows device names (CON.png, COM1.gif, ...) would open a device instead of a file
    let reserved = ["con", "prn", "aux", "nul"].contains(&stem.as_str())
        || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4 && stem.ends_with(|c: char| c.is_ascii_digit()));
    let ext = Path::new(file).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if file.is_empty() || file.contains(['\\', ':', '\0']) || file.contains("..") || reserved || file.ends_with([' ', '.']) {
        return Err(bad(name));
    }
    match dir {
        "media" if MEDIA_EXT.contains(&ext.as_str()) => Ok(EntryKind::Media(file.into())),
        "thumbs" if ext == "jpg" => Ok(EntryKind::Thumb(file.into())),
        _ => Err(bad(name)),
    }
}

pub fn export(store: &Store, out: &Path, set_ids: &[Id], screamer_ids: &[Id]) -> Result<(), BundleError> {
    let lib = &store.library;
    let mut sets: Vec<ScreamSet> = lib.sets.iter().filter(|s| set_ids.contains(&s.id)).cloned().collect();
    sets.iter_mut().for_each(|s| s.enabled = false);
    let wanted: HashSet<&str> = screamer_ids
        .iter()
        .map(String::as_str)
        .chain(sets.iter().flat_map(|s| s.items.iter().map(|i| i.screamer_id.as_str())))
        .collect();
    let mut screamers: Vec<Screamer> = lib.screamers.iter().filter(|s| wanted.contains(s.id.as_str())).cloned().collect();
    for s in &mut screamers {
        if !store.thumbs_dir().join(format!("{}.jpg", s.id)).is_file() {
            s.thumb = None;
        }
    }

    let r = (|| -> Result<(), BundleError> {
        let mut zip = ZipWriter::new(File::create(out)?);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let manifest = Manifest { screamers: screamers.clone(), sets, ..Default::default() };
        zip.start_file("manifest.json", SimpleFileOptions::default().compression_method(CompressionMethod::Deflated))?;
        zip.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
        let mut done = HashSet::new();
        for s in &screamers {
            let sound = match &s.sound {
                Sound::File { file, .. } => Some(file.as_str()),
                _ => None,
            };
            for f in std::iter::once(s.media.file.as_str()).chain(sound) {
                if done.insert(f.to_string()) {
                    zip.start_file(format!("media/{f}"), stored)?;
                    io::copy(&mut File::open(store.media_dir().join(f))?, &mut zip)?;
                }
            }
            if s.thumb.is_some() {
                zip.start_file(format!("thumbs/{}.jpg", s.id), stored)?;
                io::copy(&mut File::open(store.thumbs_dir().join(format!("{}.jpg", s.id)))?, &mut zip)?;
            }
        }
        zip.finish()?;
        Ok(())
    })();
    if r.is_err() {
        let _ = fs::remove_file(out);
    }
    r
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub new_screamers: usize,
    pub skipped_screamers: usize,
    pub sets: usize,
    pub total_bytes: u64,
}

struct Plan {
    zip: ZipArchive<File>,
    screamers: Vec<Screamer>,
    sets: Vec<ScreamSet>,
    skipped: usize,
    media: Vec<(String, usize)>,
    thumbs: Vec<(Id, usize)>,
    declared: u64,
    used: u64,
}

/// Copies at most the remaining budget (+1 byte to detect overflow); headers are never trusted.
fn read_capped(r: impl Read, used: &mut u64, limit: u64, out: &mut impl Write) -> Result<(), BundleError> {
    *used += io::copy(&mut r.take(limit.saturating_sub(*used) + 1), out)?;
    if *used > limit { Err(BundleError::TooLarge) } else { Ok(()) }
}

/// Validates every entry and the manifest; touches nothing on disk.
fn plan(path: &Path, store: &Store, limit: u64) -> Result<Plan, BundleError> {
    let mut zip = ZipArchive::new(File::open(path)?)?;
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut manifest_at = None;
    let mut declared = 0;
    let mut seen = HashSet::new();
    for i in 0..zip.len() {
        let e = zip.by_index_raw(i)?;
        let name = e.name()?.into_owned();
        if e.is_dir() && (name == "media/" || name == "thumbs/") {
            continue;
        }
        if !seen.insert(name.to_ascii_lowercase()) {
            return Err(BundleError::Invalid(format!("duplicate entry '{name}'")));
        }
        if classify_entry(&name)? == EntryKind::Manifest {
            manifest_at = Some(i);
        }
        declared += e.size();
        index.insert(name, i);
    }
    let mut used = 0;
    let mut buf = Vec::new();
    let at = manifest_at.ok_or_else(|| BundleError::Invalid("no manifest.json".into()))?;
    read_capped(zip.by_index(at)?, &mut used, limit, &mut buf)?;
    let manifest: Manifest = serde_json::from_slice(&buf)?;
    if manifest.format > 1 {
        return Err(BundleError::Newer);
    }

    let lib = &store.library;
    let mut known: HashSet<Id> = lib.screamers.iter().map(|s| s.id.clone()).collect();
    let mut ids_seen = HashSet::new();
    let (mut screamers, mut skipped, mut media, mut thumbs) = (Vec::new(), 0, Vec::new(), Vec::new());
    for mut s in manifest.screamers {
        if s.id.is_empty() || classify_entry(&format!("thumbs/{}.jpg", s.id)).is_err() {
            return Err(BundleError::Invalid(format!("screamer id '{}'", s.id)));
        }
        if !ids_seen.insert(s.id.clone()) || lib.screamers.iter().any(|x| x.id == s.id) {
            skipped += 1;
            continue;
        }
        s.volume = s.volume.min(100);
        let sound = match &s.sound {
            Sound::File { file, .. } => Some(file.clone()),
            _ => None,
        };
        for f in std::iter::once(s.media.file.clone()).chain(sound) {
            let key = format!("media/{f}");
            if !matches!(classify_entry(&key)?, EntryKind::Media(_)) {
                return Err(bad(&key));
            }
            let &i = index.get(&key).ok_or_else(|| BundleError::Invalid(format!("missing '{key}'")))?;
            if !media.iter().any(|(n, _)| *n == f) {
                media.push((f, i));
            }
        }
        match index.get(&format!("thumbs/{}.jpg", s.id)) {
            Some(&i) => thumbs.push((s.id.clone(), i)),
            None => s.thumb = None,
        }
        known.insert(s.id.clone());
        screamers.push(s);
    }
    let mut sets = manifest.sets;
    let mut set_ids: HashSet<Id> = lib.sets.iter().map(|s| s.id.clone()).collect();
    for set in &mut sets {
        set.items.retain(|it| known.contains(&it.screamer_id));
        set.enabled = false;
        if set.id.is_empty() || !set_ids.insert(set.id.clone()) {
            set.id.clear(); // write_all assigns a fresh id and the copy suffix
        }
    }
    Ok(Plan { zip, screamers, sets, skipped, media, thumbs, declared, used })
}

fn preview(p: &Plan, bytes: u64) -> ImportPreview {
    ImportPreview { new_screamers: p.screamers.len(), skipped_screamers: p.skipped, sets: p.sets.len(), total_bytes: bytes }
}

pub fn inspect(path: &Path, store: &Store) -> Result<ImportPreview, BundleError> {
    let p = plan(path, store, LIMIT)?;
    if p.declared > LIMIT {
        return Err(BundleError::TooLarge);
    }
    Ok(preview(&p, p.declared))
}

pub fn import(path: &Path, store: &mut Store, copy_suffix: &str) -> Result<ImportPreview, BundleError> {
    import_limited(path, store, copy_suffix, LIMIT)
}

fn write_new(p: &Path) -> io::Result<File> {
    OpenOptions::new().write(true).create_new(true).open(p)
}

fn import_limited(path: &Path, store: &mut Store, copy_suffix: &str, limit: u64) -> Result<ImportPreview, BundleError> {
    let mut p = plan(path, store, limit)?;
    let mut written: Vec<PathBuf> = Vec::new();
    let r = write_all(&mut p, store, &mut written, copy_suffix, limit);
    if r.is_err() {
        written.iter().for_each(|f| drop(fs::remove_file(f)));
    }
    r?;
    Ok(preview(&p, p.used))
}

fn write_all(p: &mut Plan, store: &mut Store, written: &mut Vec<PathBuf>, suffix: &str, limit: u64) -> Result<(), BundleError> {
    fs::create_dir_all(store.media_dir())?;
    fs::create_dir_all(store.thumbs_dir())?;
    let mut renamed: HashMap<String, String> = HashMap::new();
    for (name, i) in &p.media {
        let mut target = name.clone();
        if store.media_dir().join(&target).exists() {
            let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("bin");
            target = format!("{}.{ext}", uuid::Uuid::new_v4());
        }
        let dest = store.media_dir().join(&target);
        let mut out = write_new(&dest)?;
        written.push(dest);
        read_capped(p.zip.by_index(*i)?, &mut p.used, limit, &mut out)?;
        renamed.insert(name.clone(), target);
    }
    let mut no_thumb = HashSet::new();
    for (id, i) in &p.thumbs {
        let dest = store.thumbs_dir().join(format!("{id}.jpg"));
        if dest.exists() {
            no_thumb.insert(id.clone());
            continue;
        }
        let mut out = write_new(&dest)?;
        written.push(dest);
        read_capped(p.zip.by_index(*i)?, &mut p.used, limit, &mut out)?;
    }

    let backup = store.library.clone();
    for s in &mut p.screamers {
        s.media.file = renamed[&s.media.file].clone();
        if let Sound::File { file, .. } = &mut s.sound {
            *file = renamed[&*file].clone();
        }
        if no_thumb.contains(&s.id) {
            s.thumb = None;
        }
        store.upsert_screamer(s.clone());
    }
    for set in &mut p.sets {
        if set.id.is_empty() {
            set.id = uuid::Uuid::new_v4().to_string();
            set.name.push_str(suffix);
        }
        store.upsert_set(set.clone());
    }
    if let Err(e) = store.save_library() {
        store.library = backup;
        return Err(e.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Media, SetItem};
    use tempfile::{TempDir, tempdir};

    fn store() -> (TempDir, Store) {
        let d = tempdir().unwrap();
        let s = Store::load(d.path().to_path_buf());
        (d, s)
    }

    fn scr(id: &str, file: &str) -> Screamer {
        Screamer { id: id.into(), name: id.into(), media: Media { file: file.into(), ..Default::default() }, ..Default::default() }
    }

    fn set(id: &str, items: &[&str]) -> ScreamSet {
        let items = items.iter().map(|i| SetItem { screamer_id: (*i).into(), weight: 1 }).collect();
        ScreamSet { id: id.into(), name: "Хоррор".into(), items, enabled: true, ..Default::default() }
    }

    fn put_media(s: &Store, file: &str, bytes: &[u8]) {
        fs::create_dir_all(s.media_dir()).unwrap();
        fs::write(s.media_dir().join(file), bytes).unwrap();
    }

    fn zip_of(dir: &Path, m: &Manifest, files: &[(&str, &[u8])]) -> PathBuf {
        let p = dir.join("t.zip");
        let mut z = ZipWriter::new(File::create(&p).unwrap());
        let o = SimpleFileOptions::default();
        z.start_file("manifest.json", o).unwrap();
        z.write_all(&serde_json::to_vec(m).unwrap()).unwrap();
        for (n, b) in files {
            z.start_file(*n, o).unwrap();
            z.write_all(b).unwrap();
        }
        z.finish().unwrap();
        p
    }

    fn manifest(screamers: Vec<Screamer>, sets: Vec<ScreamSet>) -> Manifest {
        Manifest { screamers, sets, ..Default::default() }
    }

    fn count(dir: &Path) -> usize {
        fs::read_dir(dir).map_or(0, |r| r.count())
    }

    #[test]
    fn roundtrip_export_import_into_empty_store() {
        let (_a, mut src) = store();
        put_media(&src, "a.png", b"AAA");
        src.upsert_screamer(Screamer { thumb: Some("thumbs/a.jpg".into()), ..scr("a", "a.png") });
        src.save_thumbnail("a", b"JPG").unwrap();
        src.upsert_set(set("s", &["a"]));
        let out = tempdir().unwrap();
        let z = out.path().join("o.zip");
        export(&src, &z, &["s".into()], &[]).unwrap();

        let (b, mut dst) = store();
        let pv = import(&z, &mut dst, " (copy)").unwrap();
        assert_eq!((pv.new_screamers, pv.skipped_screamers, pv.sets), (1, 0, 1));
        assert_eq!(fs::read(dst.media_dir().join("a.png")).unwrap(), b"AAA");
        assert_eq!(fs::read(dst.thumbs_dir().join("a.jpg")).unwrap(), b"JPG");
        assert_eq!(dst.library.screamers[0].thumb.as_deref(), Some("thumbs/a.jpg"));
        assert!(!dst.library.sets[0].enabled);
        assert_eq!(dst.library.sets[0].id, "s");
        assert_eq!(Store::load(b.path().to_path_buf()).library.sets.len(), 1);
    }

    #[test]
    fn classify_rejects_traversal_and_absolute() {
        for bad in ["../x.png", "/x.png", "C:\\x.png", "media/../x.png", "media/a/b.png", "media/x.exe", "thumbs/x.png", "media/CON.png", "media/a:b.png", "media/x.png."] {
            assert!(classify_entry(bad).is_err(), "{bad}");
        }
        assert_eq!(classify_entry("media/a.PNG").unwrap(), EntryKind::Media("a.PNG".into()));
        assert_eq!(classify_entry("thumbs/a.jpg").unwrap(), EntryKind::Thumb("a.jpg".into()));
    }

    #[test]
    fn import_is_all_or_nothing() {
        let (d, mut st) = store();
        let m = manifest(vec![scr("a", "a.png"), scr("b", "b.png")], vec![]);
        let z = zip_of(d.path(), &m, &[("media/a.png", b"A"), ("media/b.png", b"B"), ("media/evil.exe", b"X")]);
        assert!(import(&z, &mut st, "").is_err());
        assert_eq!(count(&st.media_dir()), 0);
        assert!(st.library.screamers.is_empty());

        // failure after the first file was already written: limit hit on the second
        let z = zip_of(d.path(), &m, &[("media/a.png", b"A"), ("media/b.png", &[0; 100])]);
        assert!(matches!(import_limited(&z, &mut st, "", 80), Err(BundleError::TooLarge)));
        assert_eq!(count(&st.media_dir()), 0);
        assert!(st.library.screamers.is_empty());
    }

    #[test]
    fn import_enforces_real_size_limit() {
        let (d, mut st) = store();
        let m = manifest(vec![scr("a", "a.png")], vec![]);
        let z = zip_of(d.path(), &m, &[("media/a.png", &[7; 1000])]);
        assert!(matches!(import_limited(&z, &mut st, "", 500), Err(BundleError::TooLarge)));
        assert_eq!(count(&st.media_dir()), 0);
        assert!(import_limited(&z, &mut st, "", 100_000).is_ok());
    }

    #[test]
    fn existing_screamer_is_skipped() {
        let (d, mut st) = store();
        put_media(&st, "old.png", b"OLD");
        st.upsert_screamer(scr("a", "old.png"));
        let m = manifest(vec![scr("a", "a.png")], vec![set("s", &["a"])]);
        let z = zip_of(d.path(), &m, &[("media/a.png", b"NEW")]);
        let pv = import(&z, &mut st, "").unwrap();
        assert_eq!((pv.new_screamers, pv.skipped_screamers), (0, 1));
        assert_eq!(st.library.screamers[0].media.file, "old.png");
        assert_eq!(st.library.sets[0].items.len(), 1);
        assert!(!st.media_dir().join("a.png").exists());
    }

    #[test]
    fn existing_set_is_imported_as_copy() {
        let (d, mut st) = store();
        st.upsert_set(set("s", &[]));
        let m = manifest(vec![scr("a", "a.png")], vec![set("s", &["a", "ghost"])]);
        let z = zip_of(d.path(), &m, &[("media/a.png", b"A")]);
        import(&z, &mut st, " (копия)").unwrap();
        assert_eq!(st.library.sets.len(), 2);
        let c = &st.library.sets[1];
        assert_eq!(c.name, "Хоррор (копия)");
        assert_ne!(c.id, "s");
        assert_eq!(c.items.len(), 1);
    }

    #[test]
    fn media_name_collision_gets_new_name() {
        let (d, mut st) = store();
        put_media(&st, "a.png", b"OTHER");
        let m = manifest(vec![scr("x", "a.png")], vec![]);
        let z = zip_of(d.path(), &m, &[("media/a.png", b"MINE")]);
        import(&z, &mut st, "").unwrap();
        assert_eq!(fs::read(st.media_dir().join("a.png")).unwrap(), b"OTHER");
        let f = &st.library.screamers[0].media.file;
        assert_ne!(f, "a.png");
        assert_eq!(fs::read(st.media_dir().join(f)).unwrap(), b"MINE");
    }

    #[test]
    fn newer_format_is_rejected() {
        let (d, mut st) = store();
        let m = Manifest { format: 2, ..Default::default() };
        let z = zip_of(d.path(), &m, &[]);
        assert!(matches!(import(&z, &mut st, ""), Err(BundleError::Newer)));
    }

    #[test]
    fn inspect_writes_nothing() {
        let (d, st) = store();
        let m = manifest(vec![scr("a", "a.png")], vec![set("s", &["a"])]);
        let z = zip_of(d.path(), &m, &[("media/a.png", b"A")]);
        let pv = inspect(&z, &st).unwrap();
        assert_eq!((pv.new_screamers, pv.sets, pv.total_bytes > 0), (1, 1, true));
        assert!(!st.media_dir().exists());
        assert!(!st.data_dir().join("library.json").exists());
    }
}
