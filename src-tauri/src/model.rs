use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub type Id = String;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MediaKind {
    #[default]
    Image,
    Gif,
    Video,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Fit {
    #[default]
    Cover,
    Contain,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Media {
    pub file: String,
    pub kind: MediaKind,
    pub duration_ms: Option<u64>,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(tag = "mode", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Sound {
    FromVideo,
    File { file: String, duration_ms: u64 },
    #[default]
    None,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum DurationMode {
    #[default]
    BySound,
    Custom { ms: u64 },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Screamer {
    pub id: Id,
    pub name: String,
    pub media: Media,
    pub sound: Sound,
    pub duration: DurationMode,
    pub volume: u8,
    pub opacity: u8,
    pub fit: Fit,
    pub thumb: Option<String>,
}

impl Default for Screamer {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            media: Media::default(),
            sound: Sound::default(),
            duration: DurationMode::default(),
            volume: 100,
            opacity: 100,
            fit: Fit::default(),
            thumb: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct SetItem {
    pub screamer_id: Id,
    pub weight: u32,
}

impl Default for SetItem {
    fn default() -> Self {
        Self { screamer_id: String::new(), weight: 1 }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ScreamSet {
    pub id: Id,
    pub name: String,
    pub min_interval_ms: u64,
    pub max_interval_ms: u64,
    pub items: Vec<SetItem>,
    pub enabled: bool,
    pub api_enabled: bool,
}

impl Default for ScreamSet {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            min_interval_ms: 300_000,
            max_interval_ms: 900_000,
            items: Vec::new(),
            enabled: false,
            api_enabled: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Library {
    pub version: u32,
    pub screamers: Vec<Screamer>,
    pub sets: Vec<ScreamSet>,
}

impl Default for Library {
    fn default() -> Self {
        Self { version: 1, screamers: Vec::new(), sets: Vec::new() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub data_dir: Option<PathBuf>,
    pub monitors: Vec<String>,
    pub hide_from_capture: bool,
    pub overlay_sound: bool,
    pub stop_hotkey: String,
    pub api_port: u16,
    pub language: Option<String>,
    pub theme: String,
    pub autostart: bool,
    pub restore_enabled_sets: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            data_dir: None,
            monitors: Vec::new(),
            hide_from_capture: true,
            overlay_sound: false,
            stop_hotkey: "Ctrl+Shift+End".into(),
            api_port: 7811,
            language: None,
            theme: "system".into(),
            autostart: false,
            restore_enabled_sets: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    Pc,
    Overlay,
    Both,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Show {
    pub show_id: u64,
    pub screamer: Screamer,
    pub duration_ms: u64,
    pub target: Target,
}

pub fn show_duration_ms(s: &Screamer) -> u64 {
    let ms = match &s.duration {
        DurationMode::Custom { ms } => *ms,
        DurationMode::BySound => match &s.sound {
            Sound::FromVideo => s.media.duration_ms,
            Sound::File { duration_ms, .. } => Some(*duration_ms),
            Sound::None => None,
        }
        .unwrap_or(3000),
    };
    ms.max(100)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Screamer {
        Screamer { id: "a".into(), ..Default::default() }
    }

    #[test]
    fn show_duration_ms_by_sound_from_video() {
        let mut s = base();
        s.sound = Sound::FromVideo;
        s.media.duration_ms = Some(3200);
        assert_eq!(show_duration_ms(&s), 3200);
    }

    #[test]
    fn show_duration_ms_by_sound_file() {
        let mut s = base();
        s.sound = Sound::File { file: "x.mp3".into(), duration_ms: 5100 };
        assert_eq!(show_duration_ms(&s), 5100);
    }

    #[test]
    fn show_duration_ms_missing_falls_back_to_3000() {
        let mut s = base();
        s.sound = Sound::FromVideo;
        assert_eq!(show_duration_ms(&s), 3000);
        s.sound = Sound::None;
        assert_eq!(show_duration_ms(&s), 3000);
    }

    #[test]
    fn show_duration_ms_custom() {
        let mut s = base();
        s.duration = DurationMode::Custom { ms: 1500 };
        assert_eq!(show_duration_ms(&s), 1500);
        s.duration = DurationMode::Custom { ms: 5 };
        assert_eq!(show_duration_ms(&s), 100);
    }

    #[test]
    fn tagged_enums_use_camel_case() {
        let j = serde_json::to_string(&Sound::File { file: "f".into(), duration_ms: 1 }).unwrap();
        assert_eq!(j, r#"{"mode":"file","file":"f","durationMs":1}"#);
        assert_eq!(serde_json::to_string(&Sound::FromVideo).unwrap(), r#"{"mode":"fromVideo"}"#);
        assert_eq!(serde_json::to_string(&DurationMode::BySound).unwrap(), r#"{"mode":"bySound"}"#);
        assert_eq!(serde_json::to_string(&Target::Both).unwrap(), r#""both""#);
    }
}
