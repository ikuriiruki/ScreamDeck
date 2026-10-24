# ScreamDeck docs

[Русский](README.ru.md)

ScreamDeck is a Windows app that shows "screamers" (an image, gif or video with sound) over your screen and in OBS. Screamers are grouped into sets; a set fires on a random timer, and it can also be triggered over a local API (Stream Deck, Twitch rewards, etc.).

## Install

1. Download `ScreamDeck_*-setup.exe` from the [latest release](https://github.com/ikuriiruki/ScreamDeck/releases/latest) and run it.
2. The installer is not code-signed, so Windows SmartScreen shows "Windows protected your PC". Click **More info → Run anyway**.
3. Updates: Settings → Updates → **Check**. The app looks for a new version on GitHub Releases and installs it with **Install and restart** (the update signature is verified with a Tauri key).

A fresh install starts with all sets turned off: no screamer appears on its own. By default, enabled sets are not restored on launch ("Restore enabled sets on start" is off), so autostart never scares you when you're not streaming.

## OBS setup

1. ScreamDeck Settings → "OBS — “Browser” source" → copy the link (default `http://127.0.0.1:7811/overlay`).
2. In OBS add a **Browser** source, paste the link and set the canvas size (e.g. 1920×1080). The page background is transparent.
3. Overlay sound is off by default: the screamer plays on the PC and reaches the stream via **Desktop Audio**. Turn on "Overlay sound" only if you don't capture desktop audio, otherwise it plays twice.
4. The PC screen overlay is hidden from capture (Windows 10 2004+) so it doesn't duplicate the OBS overlay. Check it: the **Test** button in Settings shows a screamer both on the PC and in the overlay. The OBS scene preview should show exactly one (from the overlay), not a second one from screen capture.
5. Games must run in **borderless windowed** mode: in exclusive fullscreen Windows doesn't draw other programs' windows over the game.

## API

Bound to `127.0.0.1` only (default port 7811, configurable). Requests with a foreign `Origin` (any website in a browser) or a foreign `Host` (DNS rebinding) get 403; there are no CORS headers, so the API works for local programs but not for web pages.

| Method | Path | Response |
|---|---|---|
| GET | `/api/screamers` | 200, list of `{id, name, kind, durationMs}` |
| GET | `/api/sets` | 200, list of `{id, name, enabled, api, size}` |
| POST | `/api/trigger/screamer/{id}` | 202 `{"queued": bool}`; 404 unknown; 429 queue full |
| POST | `/api/trigger/set/{id}` | 202 `{"queued": bool}`; 404; 403 the set has "Available via API" off; 409 empty set; 429 queue full |
| POST | `/api/stop` | 204, closes the current screamer and clears the queue |
| POST | `/api/sets/{id}/enable` · `disable` · `toggle` | 200 `{"enabled": bool}`; 404; 403 if the set's API access is off |

`queued: true` means another screamer is showing and the call was queued (limit 10, then 429). Screamers never overlap. A random screamer from a set works for a disabled set too: "enabled" only controls the timer.

```bash
curl http://127.0.0.1:7811/api/sets
curl -X POST http://127.0.0.1:7811/api/trigger/screamer/ID
curl -X POST http://127.0.0.1:7811/api/trigger/set/ID
curl -X POST http://127.0.0.1:7811/api/sets/ID/toggle
curl -X POST http://127.0.0.1:7811/api/stop
```

## Development

Requires Node (LTS), pnpm, Rust stable, WebView2.

```bash
pnpm install
pnpm build                                        # required before cargo: rust-embed reads ../dist at compile time
pnpm tauri dev
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

A fresh clone has no `dist/`, so `cargo test`/`cargo build` won't compile without running `pnpm build` first.

### Adding a set field

1. Add the field to `ScreamSet` in `src-tauri/src/model.rs` (the struct already has `#[serde(default)]`; the new type needs a default value, and old files keep loading without migrations).
2. Add the type to `src/lib/types.ts`.
3. Add a control to `src/pages/SetDetail.tsx`.

### Adding an API endpoint

Add the route to `router()` and the handler in `src-tauri/src/server.rs` (the Origin/Host guard applies to every route automatically), a test next to it in `mod tests`, and a row to the table above and in [README.ru.md](README.ru.md).

### Adding a language

Copy `src/i18n/en.json` to `src/i18n/<code>.json`, translate it, register it in `resources` in `src/app/i18n.ts`, and add the language to the `Language` type (`src/app/i18n.ts`), to `languageOf`, and to the language switch in `src/pages/Settings.tsx`.
