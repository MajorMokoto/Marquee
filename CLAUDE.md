# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repo is **Marquee** (published as [MajorMokoto/Marquee](https://github.com/MajorMokoto/Marquee)), a plugin for [FeedBack](https://github.com/got-feedback/feedback) — a self-hosted note-highway music player/practice app. Marquee is an OBS Browser-Source overlay for streamers: now-playing info (album art, song title/artist, tuning, score, song time/progress, arrangement "path," custom text) rendered as a transparent, freely-positioned, fully-styleable graphic, edited through an in-app visual editor rather than hand-written CSS.

Marquee is currently the only plugin in this repo. There is no build step, package manager, or test runner — the plugin is plain HTML/CSS/JS on the frontend and a single Python (FastAPI) module on the backend, consumed directly by the host app.

## Repo layout

```
marquee/            the actual plugin — see below
backup/              local-only timestamped snapshots (gitignored) — never edit, never treat as live code
```

`marquee/design/` holds a distilled UI reference (`reference.md`: palette, type, layout patterns) for FeedBack's own host-app design language, built from Figma screenshot exports dropped in the gitignored `marquee/design/screenshots/` — read `reference.md` instead of re-processing screenshots when doing menu/settings-panel work; see `marquee/design/README.md` for the ingest workflow if new screenshots get added.

`marquee/` mirrors the layout the plugin's own release zip needs (everything nested under a folder named after the plugin id, for FeedBack's drag-and-drop install) and matches how it gets dropped into a real FeedBack install's `plugins/marquee/` directory:

```
marquee/plugin.json        manifest (id, script, settings.html, routes.py, nav/screen wiring)
marquee/routes.py          FastAPI backend: setup(app, context)
marquee/screen.js          runs inside FeedBack's own window — the only file that can reach window.feedBack
marquee/screen.html        the plugin's nav screen (an iframe onto the editor route)
marquee/settings.html      the Settings-page panel (OBS URL, live status)
marquee/assets/editor.html the visual layout/style editor (~6850 lines, single file)
marquee/assets/render.html the actual OBS output page (~2174 lines, single file)
```

`backup/marquee/` holds local git-checkpoint snapshots (see the commit convention below) plus any manual incident-recovery backups — distinct from git history, kept for fast rollback without touching `.git`.

A `feedback tester/` folder may exist at the repo root — a full local copy of the built FeedBack host app, dropped there so it can be worked on/tested directly instead of round-tripping through GitHub. It's gitignored (multi-GB, all app binaries); never suggest tracking or committing anything under it.

## Working conventions

- **No test suite, no linter, no build command.** Verify changes by actually loading the page (see "Live verification" below), not by running a command.
- **`editor.html` and `render.html` deliberately duplicate shared logic independently** rather than sharing a module — this is a conscious repo convention (see e.g. `editor.html`'s and `render.html`'s own comments on `OVERRIDABLE_SETTINGS`/`getEffectiveVisualsFor`). When fixing a bug or adding a setting that touches both editor and live output, port the change to **both** files — they will not silently drift into sync on their own, and `render.html` has genuinely had its own independent bugs from the editor before.
- **The "commit" trigger phrase**: when a user message starts with the word "commit," it means: first `git add`/`git commit` whatever's currently uncommitted with an auto-generated message, then create a timestamped full-folder snapshot copy under `backup/marquee/<YYYY-MM-DD_HHMM>_<short-commit-hash>/`, then carry out the rest of that prompt as a new task. This is **local-only** — never push to the `origin` remote as part of this trigger, or otherwise, without explicit separate confirmation.
- **Before any git command that discards uncommitted work** (`checkout`/`restore`/`reset`/`clean`), check `git status` first — this repo has had real incidents of uncommitted, unbacked-up work in flight.

## Live verification (no automated tests)

Since there's no test runner, verify frontend changes by actually driving the page via the Chrome DevTools Protocol:

1. Serve `marquee/assets/` with a plain static file server (e.g. Python's `http.server`) on a scratch port.
2. Launch an isolated Chrome instance: `chrome.exe --remote-debugging-port=<port> --user-data-dir=<throwaway temp dir> --incognito --no-first-run --no-default-browser-check <url>`. Keep the dedicated `--user-data-dir` — without it, the launch can silently get handed off to the user's already-running Chrome, which ignores `--remote-debugging-port`.
3. Fetch `http://localhost:<port>/json` for the page's `webSocketDebuggerUrl`, connect over `websockets`, and drive it with `Runtime.evaluate` (toggle controls via real DOM events like a user would, then read back computed styles/state — not just calling internal functions directly).
4. `Runtime.enable` replays exceptions buffered from *before* it was called — reload first, wait, *then* start listening for `Runtime.exceptionThrown`, or you'll get false-positive stale errors.
5. `editor.html` does a one-time `fetch(LAYOUT_URL)` on load that can resolve *after* a test script's own toggle/measure steps if a real FeedBack backend happens to be reachable, silently reverting state. Block it: after `Page.enable`, call `Network.enable` + `Network.setBlockedURLs` with `{"urls": ["*/api/plugins/marquee/layout*", "*ingest*"]}` before `Page.reload`.
6. On Windows, `python`/`node` may not be on `PATH` even when installed — resolve the full `python.exe` path first (e.g. under `%LOCALAPPDATA%\Programs\Python\`) rather than assuming the bare command resolves.
7. Clean up afterward: kill the Chrome process and static server by PID/port, not a blanket `taskkill` — other unrelated processes may be running.

**If `python`/`node` aren't available at all** (confirm with `which python`/`which node` first — don't assume), Chrome's own CLI has a zero-dependency fallback for a static visual check, no server or scripting runtime needed: `chrome.exe --headless=new --disable-gpu --no-sandbox --window-size=<W>,<H> --screenshot=<out.png> --virtual-time-budget=<ms> "file:///<path-to-editor.html>"`. It can't click/type/drag, so it only proves initial render (layout, CSS, console errors via `--enable-logging=stderr --v=1`) — for anything needing interaction (Customize tab, a dragged slider), either fall back to the full CDP method above, or patch a throwaway scratch copy of the file with an injected `<script>` that fires the needed clicks/`dispatchEvent`s on load, screenshot that, then discard it — never the real file.

## Architecture

### Data flow (live song → OBS overlay)

`screen.js` runs inside FeedBack's own Electron window (the only place `window.feedBack` is reachable) and POSTs a normalized snapshot (`song` / `position` / `score` / `preview` / `ended` / `clear`) to `POST /api/plugins/marquee/ingest`. `routes.py` holds the latest snapshot in memory (`state`) and fans it out over `WS /ws/plugins/marquee/live` to every connected client — both the live OBS Browser Source (`render.html`, served at `GET /api/plugins/marquee/render`) and the editor's own live-preview traffic. Layout/visuals are a separate concern: `GET`/`POST /api/plugins/marquee/layout`, persisted to `<config_dir>/marquee_layout.json`, broadcast the same way so an already-open Browser Source updates within ~1s of an editor save with no refresh.

`state["preview"]` vs `state["song"]`: the editor sends synthetic `preview` pings (~2s heartbeat) so a streamer can see real positioning/styling in OBS without a real song playing; a real `song` always takes priority, and a watchdog (`PREVIEW_TIMEOUT_SECONDS`) clears a stale preview if the editor tab goes away without sending `preview-stop`.

### Per-element visual overrides (editor.html + render.html)

Each layout element can override a fixed, declarative list of visual settings (`OVERRIDABLE_SETTINGS` — same array, independently defined in both files) instead of inheriting the global ("Global" tab) values. The whole mechanism is gated by a single flag per element, `layout[id].useCustomStyles`, not a per-setting toggle:

- `getEffectiveVisualsFor(id)` — resolves each key in `OVERRIDABLE_SETTINGS` to `layout[id].styleOverrides[key]` if `useCustomStyles` is on and that key is present, else `globalFallbackFor(key)` (normally just `visuals[key]`; `marqueeBulbs` is a special case with no direct global counterpart). Read this whenever you need "what should this element actually look like right now" — never read `visuals[key]` directly for anything that's in `OVERRIDABLE_SETTINGS`.
- `applyElementStyleOverrides(id)` — writes the resolved values onto the element's own inline style/CSS custom properties (e.g. `--chip-rgb`, `--accent`, `--edge-rounding`). Per-element inline styles winning over inherited `:root` values is what makes overrides work with zero extra CSS — the one exception is Bold, which needs scoped `.style-override-bold-on/off` classes since the global version is a body-level class reaching every element via a descendant selector.
- Disabling customization (`disableElementCustomization`) is a *soft* clear — `styleOverrides` is kept so re-enabling restores prior values. Only the Customize tab's "Reset to Global" button (`resetElementToGlobal`) actually deletes the stored overrides.
- Ticker/bulb-ring code (`setupTicker`, `setBulbLoop`, `applyBulbFrame`, `applyDecorativeBulbs`, `resolveRollGroups`, etc.) all thread an `eff` parameter (the result of `getEffectiveVisualsFor`) through rather than reading `visuals` directly, so per-element overrides reach animation timing/speed too, not just static CSS.

When adding a new global visual setting, decide deliberately whether it belongs in `OVERRIDABLE_SETTINGS` (per-element-meaningful) or not (whole-canvas/whole-overlay concepts like Layout Size, Background, Confetti, Fade Out Time) — and if it does, wire it in **both** `editor.html` (with a `label`/UI control) and `render.html`'s copy of the array (no `label`, output-only).

### A migration in progress: `--vs-*` replacing the old theatrical palette in `editor.html`

`editor.html`'s chrome originally used one palette throughout — `--void`/`--curtain`/`--gold`/`--paper` etc., a warm near-black with gold interactive accents, shared by both the editor UI *and* the overlay's own default on-canvas content. The **Visual Settings panel** (Global/Customize tabs) was restyled first, to match FeedBack's own real host-app design language (near-black neutral charcoal, square checkboxes, filled sliders — see `marquee/design/reference.md`) instead, introducing its own five `--vs-*` tokens (below).

That restyle expanded outward from there: the top toolbar (`.toolbar-toggles`' Lock Layout/Zoom In/Element Outlines pills, `.toolbar-actions`' Reset to Defaults/Refresh Page/preset dropdown) and the Elements/Import-Export panels are now converted too, so `--vs-*` is no longer confined to `#visualSettingsPanel` — the two palettes now coexist by *area*, not by a hard id boundary. Elements/Import-Export got there largely for free: a block of generic `.panel`-scoped rules (`.panel .control-row`, `.panel .load-fonts-btn`, `.panel .file-input`, `.panel .toggle-row`, `.panel .vs-checkbox`, etc., starting a bit past the panel's own five-token `:root` block) targets shared component classes rather than per-panel ids, so any panel reusing those classes inherits the conversion automatically. The migration is now effectively done for interactive UI chrome — what's still on the old palette is deliberate, not unconverted: the overlay/marquee graphic's own on-canvas content (`.title`, `.artist`, `.stat-label`, `.time`, `.custom-text`, `.hero`) is a fixed near-black/ivory/gold "theatrical" look on purpose, unrelated to editor chrome, and must **not** be folded into `--vs-*` — converting it would make the actual OBS overlay output follow the editor's own UI theme, which is a different graphic entirely. Two small card backgrounds, `.color-input` and `.custom-text-row`, still read `var(--void)` directly rather than `var(--vs-card-bg)` — cosmetically close but won't react to a live FeedBack theme change like the rest of the panel; a known, low-priority gap, not yet done. When you touch a chrome area, check what its siblings currently use (grep for `--vs-` vs `--void`/`--gold`/`--paper` in that block) rather than assuming — don't mix both palettes within the same control, and if a component now only ever renders inside `.panel`, delete its old unscoped rule instead of leaving it as unreachable dead weight (this has already happened a few times as coverage grew: `.load-fonts-btn:hover`, `.fontsize-field .step-btn:hover`, `.file-input::file-selector-button:hover`, `.load-fonts-btn.danger:hover` were all removed once the `.panel`-scoped version made them unreachable). Two accidental couplings between the panel and the overlay's own `--accent`/a hardcoded orange were already found and fixed by keeping panel-only rules under `#visualSettingsPanel …`-prefixed selectors (id beats class, no `!important` needed) — that scoping habit is still worth keeping for panel-specific rules even as `--vs-*` itself spreads further.

The toolbar's Lock Layout/Zoom In pills each carry a small icon (padlock, magnifying glass) drawn from plain CSS shapes (`::before`/`::after` borders/radii), matching this file's existing no-SVG, no-icon-font convention (see `.vs-checkbox:checked::after`'s checkmark, `.preset-static-label::after`'s ▾). Two things worth knowing before touching them: the icon lives in a `.toggle-icon-group` positioned as its own fixed-width flex item next to the checkbox — *not* inline after the label text — so it doesn't visibly shift when the label's own text changes length (e.g. "Lock Layout:" ↔ "Unlock Layout:"); and a shape meant to look "closed" (the padlock shackle) needs its parts to actually overlap by a pixel or two, not just abut, or it reads as visibly disconnected at this size. `--toolbar-item-w` is sized to fit the longest label ("Unlock Layout:") plus this icon group without wrapping — re-check it if either grows.

The panel's five `--vs-*` tokens (`--vs-page-bg`/`--vs-card-bg`/`--vs-accent`/`--vs-border`/`--vs-text-dim`, defined once in a `:root` block near the top of `editor.html`) are no longer fixed hex values — each reads FeedBack's own live theme token (`--fbv-*`, injected by `/static/v3/theme-core.js`, loaded via a `<script>` tag same-origin only when `editor.html` is served for real through `GET /api/plugins/marquee/editor`) with a CSS fallback matching the original near-black/red look. This means the panel now follows whatever theme the user has equipped in FeedBack — same live mechanism used to make FeedBack's own plugin settings pages (e.g. Audio Engine's `settings.html`, via the compiled `fb-*` Tailwind classes) theme-reactive — while degrading to the original fixed look with zero behavior change when opened standalone (dev static server, `file://`), since `/static/v3/theme-core.js` 404s harmlessly there and every `var(--fbv-x, fallback)` just resolves to its fallback. Don't hardcode a new hex value into this block — read it from the matching `--fbv-*` role instead, with a fallback equal to today's default, so standalone/offline rendering never regresses.

### FeedBack host-app integration quirks

See `marquee/CLAUDE.md` for the detailed, individually-verified list of host-app contract quirks that aren't obvious from reading `screen.js`/`routes.py` alone — `window.feedBack` being a real `EventTarget` (payload lives at `event.detail`, not the callback arg directly), why live position comes from polling `window.highway.getTime()` instead of `song:position-changed`, how score data depends on the separate `note_detect` plugin, the local unpackaged copy of the host app at `C:\Program Files\Feedback` (useful for checking real plugin contracts instead of guessing), and more. Read it before making changes to the live-data path.
