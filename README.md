# Marquee

A now-playing overlay plugin for [FeedBack](https://github.com/got-feedback/feedback), designed as an OBS Browser Source. It shows album art, song title/artist, tuning, year, arrangement, live score, and song progress, and stays in sync in real time as you play — fully positioned and styled through an in-app visual editor, not hand-edited CSS.

## Features

- **Live overlay** — song info updates in OBS as you play, pushed over a WebSocket the plugin owns (no polling, no extra process to run).
- **Visual editor** — drag, resize, and reorder every element directly on a live canvas. Configure:
  - Accent color, element/background color & transparency, border thickness, edge rounding
  - Font (including local system fonts), bold toggle, element header text size
  - Overlay size (px) and fade-out time
  - Custom text elements, added freely alongside the built-in ones
- **Four built-in presets** — Standard, Small, Tall, and User, each with its own layout and visuals. Switch between them, edit freely, and autosave keeps each preset's own state; "Reset to Defaults" restores a preset's original look at any time.
- **Confetti** — a configurable particle burst (corner cannons + falling rain) that fires automatically when a song ends with a score at or above a set threshold. Duration, amount, and trigger threshold are all adjustable; a "Test Confetti" button previews it instantly, both in the editor and on the live OBS output.
- **Live preview while editing** — the OBS output shows placeholder content while the editor is open and no song is playing, so you can position everything without needing a real song running.
- **Score** — reads live accuracy from FeedBack's Note Detection plugin when it's installed and enabled; the element simply stays blank otherwise, not an error state.
- **Import/export** — copy or download the current layout as JSON, or paste/upload one back in.
- **Settings panel** — shows the OBS Browser Source URL (one click to copy), current canvas size, and whether the overlay is currently receiving live data.

## Install

Copy this folder into FeedBack's `plugins/` directory (as `plugins/marquee/`) and restart FeedBack (plugins are only discovered at startup — there's no hot-reload). Then, in FeedBack:

1. Open **Marquee** from the Plugins page (or the button in its Settings panel) to lay out and style the overlay.
2. Copy the render URL shown there into an OBS **Browser Source**, matching its Width/Height to what's set in the editor for a pixel-perfect fit.

For plugin development without touching a real FeedBack install, FeedBack supports pointing it at an external folder via the `FEEDBACK_PLUGINS_DIR` environment variable — though on a packaged desktop build, that env var may not reach the app's Python backend regardless of how it's set before launch. If you hit that, drop the plugin folder directly into the real `plugins/` directory instead.

## How it works

`screen.js` runs inside FeedBack's own window (the only place that can reach `window.feedBack`) and forwards live song/position/score events to this plugin's own backend (`routes.py`). The backend fans that out to any connected OBS Browser Source over a WebSocket, and separately serves the editor (`assets/editor.html`) and the render page itself (`assets/render.html`) — both fetch and push through that same backend, so an already-open Browser Source updates live as you edit, with no refresh needed.

## Known limitations

- **Score requires FeedBack's separate Note Detection plugin** — without it, no live accuracy data exists to show.
- **"Previous score" is currently disabled** — the underlying FeedBack stats it reads from are expected to change; re-enabling it is a planned follow-up rather than something currently broken.
- **Year** comes from library metadata (`GET /api/song/{filename}`), not the live song payload — it renders blank if that lookup has nothing for a given track.
- **"Path"** shows the arrangement's name (e.g. "Lead Guitar"), not a filesystem path.

## License

AGPL-3.0-only — see [LICENSE](LICENSE).
