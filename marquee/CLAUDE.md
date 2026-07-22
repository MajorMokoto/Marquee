# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repo is **Marquee**, a plugin for [FeedBack](https://github.com/got-feedback/feedback) — a self-hosted web app for playing/practicing interactive music notation (a note-highway player for guitar/bass/keys/drums, with tuner, MIDI input, and career-mode gamification). Marquee is an OBS Browser-Source overlay for streamers: now-playing info (album art, song title/artist, tuning, score, song time/progress, arrangement "path," custom text) rendered as a transparent, freely-positioned graphic.

This repo *is* the plugin — `plugin.json`, `routes.py`, `screen.js`, `screen.html`, `settings.html`, and `assets/` sit directly at the repo root, matching how FeedBack's own bundled plugins (e.g. `plugins/tuner/` in the host repo) are laid out. See `README.md` for features and install instructions.

FeedBack plugins live in a `plugins/<id>/` directory inside the host app, declared via a `plugin.json` manifest (schema: `docs/plugin-manifest.schema.json` in the host repo). A plugin typically provides:
- `routes.py` — Python backend entry point, exports `setup(app, context)` (FastAPI `app`, plus a `context` dict — confirmed fields in use elsewhere: `config_dir`, `log`, `register_tuning_provider`)
- `screen.js` (or an ES-module `src/` tree) — frontend entry point, loaded **inside FeedBack's own Electron window**, not a separate page
- Optionally a visualization contract (`window.feedBackViz_<id>` factory with `init`/`draw`/`resize`/`destroy`), an "Overlay" HUD contract, and/or a `capabilities`/`standards` block for cross-plugin command/event participation

The closest full reference implementation in the host repo is `plugins/tuner/` (manifest: `{id, name, version, bundled, private, script, settings: {html}, routes}`; routes.py registers `/api/plugins/tuner/...` endpoints via `@app.get`/`@app.post`, matching what `bongocat`, `virtuoso`, etc. do too). Per FeedBack's own `CONTRIBUTING.md`, plugins are typically their own repositories, loaded at runtime rather than merged into the main repo's tree — getting a plugin onto the official curated list is a separate conversation with the FeedBack maintainers, not a PR that adds a `plugins/<id>/` directory to their repo.

### Local copy of the host app

A built copy of FeedBack is installed at `C:\Program Files\Feedback` — not packaged/obfuscated, `current\resources\slopsmith\` is real readable Python + JS source, useful for checking the real plugin/event contracts directly instead of guessing. It's a nightly build (`packages\feedback-0.3.0-nightly.*-full.nupkg`) and may need updating (ask the user for a refreshed copy) if something referenced here has since changed upstream.

## Architecture notes: getting live data to the overlay

- **`window.feedBack` is a real `EventTarget`** (`static/app.js`: `emit(event, detail) { this.dispatchEvent(new CustomEvent(event, { detail })); }`, `on(event, fn) { this.addEventListener(event, fn); }`). A listener added via `.on()` receives the **`Event` object**, not the payload directly — the payload is `event.detail`. Not obvious from reading `emit()`'s call sites alone (e.g. `window.feedBack.emit('song:loaded', currentSong)` looks like a straight pass-through). Wrap every listener: `on(event, fn) { window.feedBack.on(event, (e) => fn(e?.detail ?? e)); }`.
- **Live score/accuracy** comes from the separate `note_detect` plugin, not core FeedBack — it emits `note:hit` / `note:miss` on `window.feedBack` per judged note, via the same `.detail`-wrapped mechanism above. `lib/song_score.py` gives the exact formula to mirror client-side: `accuracy = hits / max(1, hits + misses)`, `score = floor(hits * 100 * accuracy + 0.5)`. Check `GET /api/plugins` for whether it's installed; if absent, no note events fire at all and a Score element should just stay blank, not error.
- **`year`** is not in the `song:loaded`/`currentSong` payload — fetch it from `GET /api/song/{filename}` (library metadata; also has `album`, `genre`, etc.). Same endpoint's `/art` suffix (`GET /api/song/{filename}/art`) is the album art image URL.
- **Tuning display name**: `window.feedBack.displayTuningName(null, currentSong.tuning)` resolves an offsets array (e.g. all-zero) to a name (e.g. `"E Standard"`).
- **The desktop build's backend port is not a fixed default** — it's been observed as `18000` in one environment, hardcoded by the Electron wrapper's own spawn logic, not read from a `PORT` env var. Never hardcode a port in an overlay page — use `location.host`/relative URLs, or (for a process external to FeedBack) discover it from the first real request's own URL rather than guessing.
- **Plugin `routes.py` can register a real `@app.websocket(...)`** — `setup(app, context)` receives FastAPI's actual top-level `app` instance, not a sub-router, so this works exactly like `@app.get`/`@app.post` do (see `plugins/multiplayer/routes.py` for another example).
- **CDP works as a full external capture channel, with zero plugin cooperation needed.** Launch FeedBack with `--remote-debugging-port=<port>` and `window.feedBack` (the same `on`/`emit`/`currentSong`/`displayTuningName` a real `screen.js` would use) is fully reachable from an entirely separate process via `Runtime.evaluate`, and `Runtime.addBinding` + `Runtime.bindingCalled` gives genuine **push** notifications (not polling) out of the page — the Electron-app equivalent of what Rocksniffer does by reading Rocksmith's process memory.
- **`FEEDBACK_PLUGINS_DIR`-based dev-mode plugin installation** could not be made to reach the packaged desktop build's Python backend in this environment, regardless of how the env var was set before launch. If you hit the same thing, drop the plugin folder directly into the real `plugins/` directory instead.
- **A full, real, unpackaged copy of FeedBack's own Python interpreter** (3.12.9, with `fastapi`/`uvicorn`/`websockets`/`mido` already installed) lives at `C:\Program Files\Feedback\current\resources\python\python.exe` — useful for any dev-time Python scripting/testing against this repo without installing anything system-wide. Treat it as read/execute-only — don't `pip install` into it, that modifies the FeedBack install.
