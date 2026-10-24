**English** | [Русский](README.ru.md)

<h1 align="center">ScreamDeck</h1>

<p align="center">
  Jump scares for your stream.<br>
  An image, gif or video with sound pops up over everything — full screen for you, a neat overlay in OBS for your viewers.
</p>

<p align="center">
  <a href="https://github.com/ikuriiruki/ScreamDeck/releases/latest"><img alt="Download" src="https://img.shields.io/github/v/release/ikuriiruki/ScreamDeck?label=download&color=C65D3B"></a>
  <img alt="Windows" src="https://img.shields.io/badge/platform-Windows%2010%2B-2B2723">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-4F8A65"></a>
</p>

<p align="center">
  <img src="docs/screenshots/sets.png" width="240" alt="Sets">
  <img src="docs/screenshots/screamers.png" width="240" alt="Screamers">
  <img src="docs/screenshots/set.png" width="240" alt="Set">
</p>

## Features

- **Screamers** — an image, gif or video, with sound from the video, your own audio file, or none. Duration follows the sound or is set by hand; volume and fit (fill / whole) per screamer.
- **Sets** — a min/max interval and a list of screamers with weights, so rare ones stay rare. Several sets can run at once; screamers never overlap.
- **You and your viewers see different things** — full screen on the monitors you pick (hidden from screen capture), and a separate browser-source overlay that you size and place in OBS.
- **Local API** — trigger a screamer or a random one from a set, stop, toggle sets. Ready for Stream Deck today and Twitch later.
- **Import / export** — share sets as `.zip` files; foreign archives are validated before anything is written.
- **Stop hotkey**, tray icon, autostart, light & dark theme, English and Russian UI.

<p align="center">
  <img src="docs/screenshots/editor.png" width="240" alt="Screamer editor">
  <img src="docs/screenshots/settings.png" width="240" alt="Settings">
</p>

## Quick start

1. Download `ScreamDeck_*-setup.exe` from the [latest release](https://github.com/ikuriiruki/ScreamDeck/releases/latest). It isn't code-signed yet: on SmartScreen click **More info → Run anyway**.
2. Add a few screamers, put them into a set and turn the set on.
3. In OBS add a **Browser** source with `http://127.0.0.1:7811/overlay`. Run games in **borderless windowed** mode.

```bash
curl -X POST http://127.0.0.1:7811/api/trigger/set/<set-id>
```

Full guide — OBS setup, the API reference, development: **[docs](docs/README.md)**.

## License

[MIT](LICENSE) © 2026 ikuriiruki
