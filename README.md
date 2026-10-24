# ScreamDeck

Приложение для Windows, которое показывает «скримеры» (картинка, гифка или видео со звуком) поверх экрана и в OBS. Скримеры собираются в наборы; набор стреляет по таймеру в случайном интервале, а ещё его можно дёргать по локальному API (Stream Deck, награды Твича и т. п.).

## Установка

1. Скачайте `ScreamDeck_*-setup.exe` из [последнего релиза](https://github.com/ikuriiruki/ScreamDeck/releases/latest) и запустите.
2. Установщик не подписан кодом, поэтому Windows SmartScreen покажет «Windows защитила ваш компьютер». Нажмите **Подробнее → Выполнить в любом случае**.
3. Обновления: Настройки → «Обновления» → **Проверить**. Приложение ищет новую версию в GitHub Releases и ставит её по кнопке «Установить и перезапустить» (подпись обновления проверяется ключом Tauri).

После установки все наборы выключены: скримеры не появятся сами. Включённость наборов по умолчанию не восстанавливается при запуске (настройка «Восстанавливать включённые наборы при запуске» выключена), чтобы автозапуск не пугал, когда стрима нет.

## Настройка OBS

1. Настройки ScreamDeck → «OBS — источник «Браузер»» → скопируйте ссылку (по умолчанию `http://127.0.0.1:7811/overlay`).
2. В OBS добавьте источник **«Браузер»**, вставьте ссылку, задайте размер холста (например 1920×1080). Фон страницы прозрачный.
3. Звук оверлея по умолчанию выключен: скример звучит на ПК и попадает в стрим через **«Звук рабочего стола»**. Включайте «Звук в оверлее» только если не захватываете звук рабочего стола, иначе будет дважды.
4. Экран ПК скрыт от захвата (Windows 10 2004+), чтобы он не дублировал оверлей. Проверьте: кнопка «Тест» в настройках показывает скример и на ПК, и в оверлее. В превью сцены OBS скример должен быть один (из оверлея), без второго от захвата экрана.
5. Если в OBS захват игры/экрана всё же показывает окна ScreamDeck, используйте захват окна игры или режим игры **«оконный без рамки»** (borderless windowed): в «полноэкранном» эксклюзивном режиме Windows не рисует поверх игры окна других программ.

## API

Только `127.0.0.1` (порт по умолчанию 7811, меняется в настройках). Запросы с чужим `Origin` (любой сайт в браузере) и с чужим `Host` (DNS rebinding) получают 403; CORS-заголовков нет, так что API работает для локальных программ, но не для веб-страниц.

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/api/screamers` | 200, список `{id, name, kind, durationMs}` |
| GET | `/api/sets` | 200, список `{id, name, enabled, api, size}` |
| POST | `/api/trigger/screamer/{id}` | 202 `{"queued": bool}`; 404 нет такого; 429 очередь полна |
| POST | `/api/trigger/set/{id}` | 202 `{"queued": bool}`; 404; 403 у набора выключено «Доступен через API»; 409 набор пуст; 429 очередь полна |
| POST | `/api/stop` | 204, закрывает текущий скример и очищает очередь |
| POST | `/api/sets/{id}/enable` · `disable` · `toggle` | 200 `{"enabled": bool}`; 404; 403 если API у набора выключен |

`queued: true` значит, что показывается другой скример и вызов встал в очередь (лимит 10, дальше 429). Скримеры не накладываются. Случайный из набора работает и для выключенного набора: «включён» управляет только таймером.

```bash
curl http://127.0.0.1:7811/api/sets
curl -X POST http://127.0.0.1:7811/api/trigger/screamer/ID
curl -X POST http://127.0.0.1:7811/api/trigger/set/ID
curl -X POST http://127.0.0.1:7811/api/sets/ID/toggle
curl -X POST http://127.0.0.1:7811/api/stop
```

## Разработка

Нужны Node (LTS), pnpm, Rust stable, WebView2.

```bash
pnpm install
pnpm build                                        # обязательно до cargo: rust-embed читает ../dist при компиляции
pnpm tauri dev
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

В свежем клоне `dist/` нет, поэтому `cargo test`/`cargo build` без предварительного `pnpm build` не соберутся.

### Выпуск

1. Один раз создайте ключ подписи обновлений: `pnpm tauri signer generate -w ~/.tauri/screamdeck.key`.
2. Публичный ключ вставьте в `src-tauri/tauri.conf.json` вместо `REPLACE_WITH_PUBLIC_KEY`.
3. В секреты репозитория добавьте `TAURI_SIGNING_PRIVATE_KEY` (содержимое файла ключа) и `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Поднимите версию в `package.json`, `src-tauri/tauri.conf.json` и `src-tauri/Cargo.toml`, затем:

```bash
git tag v0.1.0 && git push --tags
```

Workflow `release.yml` прогонит тесты и опубликует релиз с NSIS-установщиком и `latest.json`.

### Как добавить поле в набор

1. Поле в структуре `ScreamSet` в `src-tauri/src/model.rs` (у структуры уже `#[serde(default)]`, у нового типа должно быть значение по умолчанию; старые файлы продолжат грузиться без миграций).
2. Тип в `src/lib/types.ts`.
3. Контрол на экране `src/pages/SetDetail.tsx`.

### Как добавить API-эндпоинт

Маршрут в `router()` и обработчик в `src-tauri/src/server.rs` (защита Origin/Host применяется ко всем маршрутам сама), тест рядом в `mod tests`, строка в таблицу выше.

### Как добавить язык

Скопируйте `src/i18n/en.json` в `src/i18n/<код>.json`, переведите, подключите файл в `resources` в `src/app/i18n.ts`, добавьте язык в тип `Language` (`src/app/i18n.ts`), в `languageOf` и в переключатель языка `src/pages/Settings.tsx`.

---

## English

ScreamDeck is a Windows app that shows "screamers" (image, gif or video with sound) over your screen and in OBS. Group them into sets that fire on a random timer, or trigger them over a localhost-only HTTP API (Stream Deck, Twitch rewards).

- **Install:** download the setup `.exe` from the latest release. It is not code-signed: on SmartScreen click *More info -> Run anyway*. Updates: Settings → Updates → *Check*, then *Install and restart*. A fresh install starts with all sets turned off.
- **OBS:** add a *Browser* source with `http://127.0.0.1:7811/overlay`, capture sound via *Desktop Audio* (overlay sound is off by default). The PC overlay is hidden from capture; check it with the Test button. Games must run in borderless windowed mode.
- **API:** see the table above. Localhost only; requests with a foreign `Origin`/`Host` get 403.
- **Dev:** `pnpm install && pnpm build && pnpm tauri dev`. Run `pnpm build` before `cargo test` (rust-embed needs `dist/`). Release: push a `v*` tag.

## Лицензия / License

[MIT](LICENSE) © 2026 ikuriiruki
