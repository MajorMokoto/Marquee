"""Marquee — native in-app plugin.

Data path: screen.js (running inside FeedBack's own window, so it can reach
window.feedBack) subscribes to song/position/note-judgment events and POSTs
each update to /api/plugins/marquee/ingest. This module holds the latest
snapshot in memory and fans it out to every connected WebSocket client via
/ws/plugins/marquee/live — the same pattern the multiplayer plugin uses
for its own @app.websocket route, registered on the real top-level FastAPI
app instance (confirmed live: plugin setup() receives the actual `app`, not a
sub-router, so @app.websocket works here exactly like it does in core code).

/api/plugins/marquee/render serves the OBS Browser-Source page itself,
so the only URL a streamer needs is this plugin's own render endpoint — no
separate static file to manage.

/api/plugins/marquee/editor serves the layout/visuals editor — a copy
of the standalone design tool this plugin is built on, with a small
integration appended that loads/saves via GET|POST /api/plugins/marquee/layout
instead of only the standalone tool's file export/import. It's reachable in-app via
this plugin's registered nav screen (screen.html, an iframe pointed at this
route) as well as directly by URL. Saved layout changes are pushed to any
connected render page over the same WebSocket /ingest already uses, so
editing while OBS is live updates it within ~1s without a Browser Source
refresh.
"""

import asyncio
import json
import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, Response

PLUGIN_ID = "marquee"
_ASSETS_DIR = Path(__file__).parent / "assets"

_EMPTY_STATE = {
    "song": None,
    "position": {"time": 0, "duration": 0},
    "score": None,
    "updatedAt": 0,
}

# Same shape exportState()/importState() in the editor use: {version, order,
# elements, visuals}. This is the Standard preset's built-in defaults, kept
# here so a fresh install (nobody's opened the editor / saved anything yet)
# still renders something reasonable instead of an empty stage. Once anyone
# saves via the editor, the on-disk file below always wins over this.
# Canonical source for these values is assets/presets/standard.js (loaded
# directly by editor.html/render.html) — Python can't execute a .js file,
# so this dict has to be kept in sync with that file by hand whenever
# Standard's defaults change.
_DEFAULT_LAYOUT = {
    "version": 1,
    "order": ["roll-1", "nowplaying", "tuning", "year", "path", "score", "album", "info", "progress", "art"],
    "elements": {
        "roll-1": {
            "x": 33.46153846153846, "y": 28.999999999999996,
            "width": 202.7109375, "height": 46.40625, "fontSize": 20, "visible": True,
            "isRoll": True, "name": "Marquee Roll 1",
            "useCustomStyles": True,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8400", "textColor": "#f3e9d8", "bold": False, "font": "Arial Black",
                "borderWidth": 1.2, "edgeRounding": 0, "elementHeadSize": 10,
                "marqueeScroll": True, "marqueeScrollSpeed": 60, "marqueeEdgeFade": True,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 1.5, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 132 0", "chipRgb": "0 0 0",
            },
        },
        "nowplaying": {
            "x": 33.46103374774639, "y": 0, "width": 202.72132873535156, "height": 57.99479675292969,
            "fontSize": 16, "visible": True, "name": "Now Playing",
            "useCustomStyles": True,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8200", "bold": False, "font": "Arial Black",
                "borderWidth": 0, "edgeRounding": 0, "elementHeadSize": 19,
                "marqueeScroll": False, "marqueeScrollSpeed": 10, "marqueeEdgeFade": False,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 1.5, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 130 0", "chipRgb": "0 0 0", "textColor": "#f3e9d8",
            },
        },
        "tuning": {
            "x": 33.46153846153846, "y": 29.5013033747673, "width": 78.46353149414062, "height": 45.00000762939453, "fontSize": 16, "visible": True, "name": "Tuning",
            "useCustomStyles": False,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8200", "bold": False, "font": "Arial Black",
                "borderWidth": 0, "edgeRounding": 0, "elementHeadSize": 10,
                "marqueeScroll": False, "marqueeScrollSpeed": 10, "marqueeEdgeFade": False,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 1.5, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 130 0", "chipRgb": "0 0 0",
            },
            "rollGroup": "roll-1", "rollSlot": 1,
        },
        "year": {
            "x": 48.55068280146672, "y": 29.5013033747673, "width": 47.833343505859375, "height": 45, "fontSize": 16, "visible": True, "name": "Year",
            "useCustomStyles": False,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8200", "bold": False, "font": "Arial Black",
                "borderWidth": 0, "edgeRounding": 0, "elementHeadSize": 10,
                "marqueeScroll": False, "marqueeScrollSpeed": 10, "marqueeEdgeFade": False,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 1.5, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 130 0", "chipRgb": "0 0 0",
            },
            "rollGroup": "roll-1", "rollSlot": 1,
        },
        "path": {
            "x": 57.74939977205717, "y": 29.5013033747673, "width": 76.41535949707031, "height": 45, "fontSize": 16, "visible": True, "name": "Path",
            "useCustomStyles": False,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8200", "bold": False, "font": "Arial Black",
                "borderWidth": 0, "edgeRounding": 0, "elementHeadSize": 10,
                "marqueeScroll": False, "marqueeScrollSpeed": 10, "marqueeEdgeFade": False,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 1.5, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 130 0", "chipRgb": "0 0 0",
            },
            "rollGroup": "roll-1", "rollSlot": 1,
        },
        "score": {
            "x": 72.44491577148438, "y": 0, "width": 143.2864227294922, "height": 104.40625, "fontSize": 20, "visible": True, "name": "Score",
            "useCustomStyles": True,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8200", "bold": False, "font": "Arial Black",
                "borderWidth": 1.2, "edgeRounding": 0, "elementHeadSize": 10,
                "marqueeScroll": False, "marqueeScrollSpeed": 10, "marqueeEdgeFade": False,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 2.8, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 130 0", "chipRgb": "0 0 0",
            },
        },
        "album": {
            "x": 40.38461538461539, "y": 38.75, "width": 100, "height": 45, "fontSize": 16, "visible": True, "name": "Album",
            "rollGroup": "roll-1", "rollSlot": 1,
        },
        "info": {
            "x": 33.46153919513409, "y": 52.00130081176758, "width": 346, "height": 70, "fontSize": 20, "visible": True, "name": "Song Title & Artist",
        },
        "progress": {
            "x": 0, "y": 87, "width": 519.9947967529297, "height": 26, "fontSize": 20, "visible": True, "name": "Song Time",
            "useCustomStyles": True,
            "styleOverrides": {
                "chipColor": "#000000", "chipAlpha": 0, "accent": "#ff8200", "bold": False, "font": "Arial Black",
                "borderWidth": 1.2, "edgeRounding": 0, "elementHeadSize": 10,
                "marqueeScroll": False, "marqueeScrollSpeed": 10, "marqueeEdgeFade": False,
                "marqueeSparkle": False, "marqueeSparkleSize": 4,
                "marqueeBulbs": False, "marqueeBulbSize": 2.8, "marqueeBulbGap": 5, "marqueeBulbSpeedElements": 10,
                "marqueeBulbScroll": False, "marqueeBulbFlicker": False, "marqueeBulbFlickerIntensity": 0,
                "marqueeBulbFlickerRandom": False,
                "accentRgb": "255 130 0", "chipRgb": "0 0 0",
            },
        },
        "art": {
            "x": 0, "y": 0, "scale": 2.0714286194698923, "visible": True, "name": "Album Art",
        },
    },
    "visuals": {
        "accent": "#ff8200", "accentRgb": "255 130 0", "chipColor": "#000000", "chipRgb": "0 0 0",
        "chipAlpha": 0, "borderWidth": 1.2, "bold": False, "font": "Arial Black", "textColor": "#f3e9d8",
        "stageWidth": 520, "stageHeight": 200, "canvasBgColor": "#000000", "canvasBgRgb": "0 0 0",
        "canvasBgAlpha": 1, "elementHeadSize": 10, "edgeRounding": 0,
        # Seconds the whole stage takes to fade to/from invisible when
        # playback starts/stops — see render.html's fade handling.
        "fadeSeconds": 10,
        "fadeEnabled": True,
        # Confetti — matching the editor's own defaultVisuals exactly.
        # Missing here (as it was before this comment existed) means
        # confettiEnabled reads as undefined, and fireConfetti()'s very
        # first line (`if (!visuals.confettiEnabled) return;`) bails out
        # silently — reported live as "confetti isn't displaying" on an
        # install that hadn't yet saved a layout via the editor (which DOES
        # carry these fields — this only ever bit the fallback path: a
        # fresh install, or render.html's own hardcoded LAYOUT_DATA before
        # anything's been fetched from the backend at all).
        "confettiEnabled": True,
        "confettiDuration": 7,
        "confettiVolume": 0.5,
        "confettiTriggerAt": 100,
        "marqueeScroll": False,
        "marqueeScrollSpeed": 10,
        "marqueeEdgeFade": True,
        "marqueeSparkle": False,
        "marqueeSparkleSize": 4,
        "marqueeBulbMode": "off",
        "marqueeBulbSize": 1.5,
        "marqueeBulbGap": 5,
        "marqueeBulbSpeedElements": 10,
        "marqueeBulbSpeedLayout": 10,
        "marqueeBulbScroll": False,
        "marqueeBulbFlicker": False,
        "marqueeBulbFlickerIntensity": 0,
        "marqueeBulbFlickerRandom": False,
    },
}

# How long a single "still editing" heartbeat from the editor keeps preview
# content showing before it's assumed stale (tab closed, navigated away,
# crashed) and cleared. The editor sends one roughly every 2s while its
# integration script is alive, so this gives a couple of missed beats of
# slack before the overlay actually goes blank again.
PREVIEW_TIMEOUT_SECONDS = 5.0


def setup(app: FastAPI, context: dict):
    log = context.get("log") or logging.getLogger(f"feedBack.plugin.{PLUGIN_ID}")
    config_dir = Path(context["config_dir"])
    layout_file = config_dir / "marquee_layout.json"
    # Pre-rename installs saved under the old plugin id ("marquee_a_ws") —
    # a one-time migration so upgrading doesn't silently reset everyone
    # back to the built-in default. Only ever read from, never written to;
    # the very next save lands at the new path and this becomes dead code
    # for that install from then on.
    _legacy_layout_file = config_dir / "marquee_a_ws_layout.json"

    def _read_layout() -> dict:
        if layout_file.exists():
            try:
                data = json.loads(layout_file.read_text(encoding="utf-8"))
                if isinstance(data, dict) and isinstance(data.get("elements"), dict):
                    return data
            except Exception:
                log.warning("%s: saved layout file unreadable, falling back to default", PLUGIN_ID)
        elif _legacy_layout_file.exists():
            try:
                data = json.loads(_legacy_layout_file.read_text(encoding="utf-8"))
                if isinstance(data, dict) and isinstance(data.get("elements"), dict):
                    log.info("%s: migrated saved layout from pre-rename marquee_a_ws_layout.json", PLUGIN_ID)
                    return data
            except Exception:
                log.warning("%s: legacy saved layout file unreadable, falling back to default", PLUGIN_ID)
        return _DEFAULT_LAYOUT

    def _write_layout(data: dict) -> None:
        config_dir.mkdir(parents=True, exist_ok=True)
        layout_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # User-created presets ("Save As") and any built-in presets the user has
    # removed from their own dropdown ("Delete") — deliberately stored here
    # in config_dir, NOT under assets/presets/ alongside the built-in
    # preset .js files. assets/ is code and gets overwritten wholesale by a
    # plugin update/reinstall; config_dir is this install's own persisted
    # state and is never touched by that, so a user's saved presets and
    # hidden-built-ins list survive updating Marquee the same way their
    # saved layout (layout_file, above) already does.
    preset_prefs_file = config_dir / "marquee_preset_prefs.json"

    def _read_preset_prefs() -> dict:
        if preset_prefs_file.exists():
            try:
                data = json.loads(preset_prefs_file.read_text(encoding="utf-8"))
                if isinstance(data, dict) and isinstance(data.get("custom"), dict) and isinstance(data.get("hiddenBuiltins"), list):
                    return data
            except Exception:
                log.warning("%s: saved preset prefs file unreadable, defaulting to empty", PLUGIN_ID)
        return {"custom": {}, "hiddenBuiltins": []}

    def _write_preset_prefs(data: dict) -> None:
        config_dir.mkdir(parents=True, exist_ok=True)
        preset_prefs_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # Marquee's own opt-in gate on top of FeedBack's app-wide "Network
    # sharing" toggle. That toggle only controls whether the server BINDS
    # to 0.0.0.0 at all — once it's on, every plugin's routes (all
    # unauthenticated) become reachable to anyone on the LAN, not just the
    # one PC a streamer actually meant to share with. This makes Marquee
    # opt out of that by default: a non-loopback request only gets served
    # if this is explicitly turned on too (Advanced tab), same defense in
    # depth as e.g. a router requiring both "guest wifi on" AND a
    # per-device allow. Persisted the same way the layout is, so it
    # survives restarts and defaults to off (safest) for anyone who never
    # visits the Advanced tab.
    network_access_file = config_dir / "marquee_network_access.json"

    def _read_network_access() -> bool:
        if network_access_file.exists():
            try:
                data = json.loads(network_access_file.read_text(encoding="utf-8"))
                return bool(data.get("enabled"))
            except Exception:
                log.warning("%s: saved network-access file unreadable, defaulting to off", PLUGIN_ID)
        return False

    def _write_network_access(enabled: bool) -> None:
        config_dir.mkdir(parents=True, exist_ok=True)
        network_access_file.write_text(json.dumps({"enabled": bool(enabled)}), encoding="utf-8")

    network_access = {"enabled": _read_network_access()}

    def _is_loopback(host: str | None) -> bool:
        # ::ffff:127.0.0.1 is the IPv4-mapped-IPv6 form some stacks report
        # for a loopback connection instead of the plain dotted form —
        # without this, a legitimately-local request could get treated as
        # remote and blocked depending on how uvicorn reports client host
        # in a given deployment.
        return host in ("127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1")

    def _network_allowed(client_host: str | None) -> bool:
        return _is_loopback(client_host) or network_access["enabled"]

    state: dict = dict(_EMPTY_STATE)
    state["layout"] = _read_layout()
    state["preview"] = None
    clients: set[WebSocket] = set()
    clients_lock = asyncio.Lock()
    preview_expires_at = {"t": 0.0}

    async def _send_to_all(payload_dict: dict) -> None:
        if not clients:
            return
        payload = json.dumps(payload_dict)
        dead = []
        async with clients_lock:
            targets = list(clients)
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with clients_lock:
                for ws in dead:
                    clients.discard(ws)

    async def _broadcast():
        await _send_to_all(state)

    async def _broadcast_event(event: dict) -> None:
        # A one-shot signal — e.g. "the song genuinely just ended, here's
        # the final score" for the confetti trigger — sent over the SAME
        # WebSocket as the persistent state snapshot but never folded into
        # `state` itself and never replayed. If it were just another state
        # field, a client that connects AFTER the moment it happened would
        # see it in its initial snapshot and misfire; a client connected
        # AT the moment would see it fire correctly but then need explicit
        # logic to not refire on every subsequent unrelated broadcast. As
        # a bare one-off message instead, it only ever reaches a client
        # that was actually listening at the moment it happened — exactly
        # the semantics an animation trigger needs. render.html's
        # WebSocket handler distinguishes these from state snapshots by
        # the presence of an "event" key.
        await _send_to_all(event)  # caller passes the full {"event": "...", ...} shape

    async def _preview_watchdog():
        # No explicit "editor closed" signal exists (the editor could be
        # closed by navigating away in FeedBack's own SPA, a crash, or just
        # closing the window — none of which reliably fire a beforeunload
        # in an iframe) — so this is a plain timeout instead: if a preview
        # heartbeat hasn't renewed preview_expires_at in PREVIEW_TIMEOUT_SECONDS,
        # assume the editor is gone and clear it so the overlay goes back to
        # invisible (its normal no-song state) rather than showing stale
        # placeholder content forever.
        while True:
            await asyncio.sleep(1.0)
            if state["preview"] is not None and time.time() > preview_expires_at["t"]:
                state["preview"] = None
                state["updatedAt"] = time.time()
                await _broadcast()

    @app.on_event("startup")
    async def _start_preview_watchdog():
        # NOT called directly from setup() — asyncio.create_task() requires
        # a running event loop, and setup() isn't guaranteed to run inside
        # one at the exact moment it's called (confirmed: it isn't, in a
        # standalone-harness test of this file — the real desktop app's own
        # plugin loader marshals setup() onto the event-loop thread via
        # call_soon_threadsafe, which likely does have a running loop by
        # then, but there's no reason to depend on that timing detail when
        # a startup hook guarantees it unconditionally).
        asyncio.create_task(_preview_watchdog())

    @app.post(f"/api/plugins/{PLUGIN_ID}/ingest")
    async def ingest(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        try:
            body = await req.json()
        except Exception:
            return JSONResponse({"error": "invalid json"}, status_code=400)
        if not isinstance(body, dict):
            return JSONResponse({"error": "expected an object"}, status_code=400)

        msg_type = body.get("type")
        if msg_type == "song":
            state["song"] = body.get("song")
            # A new song resets position/score to a clean slate;
            # screen.js also sends explicit updates right after, but this
            # keeps a race (song arriving before the first position tick)
            # from showing stale numbers from the previous song.
            state["position"] = {"time": 0, "duration": (body.get("song") or {}).get("duration", 0)}
            state["score"] = None
        elif msg_type == "position":
            state["position"] = body.get("position") or state["position"]
        elif msg_type == "score":
            state["score"] = body.get("score")
        elif msg_type == "preview":
            # From the editor, while it's open — placeholder content so a
            # streamer can see real positioning/styling in OBS without a
            # real song playing. Only ever shown by render.html when there's
            # no REAL song active (state["song"] is None) — see its
            # applyLiveState. A completely separate key from the real
            # song/position/score fields above, so a genuine live song
            # always wins and is never clobbered by editor preview traffic.
            state["preview"] = {
                "song": body.get("song"),
                "position": body.get("position") or {"time": 0, "duration": 0},
                "score": body.get("score"),
            }
            preview_expires_at["t"] = time.time() + PREVIEW_TIMEOUT_SECONDS
        elif msg_type == "preview-stop":
            # Instant clear, sent by the editor the moment it notices its
            # own screen is no longer the active one in FeedBack (see
            # editor.html's visibility check) — rather than only relying on
            # _preview_watchdog's timeout, which is a real safety net (the
            # editor could be killed outright, e.g. closing FeedBack, with
            # no chance to send anything) but on its own left a ~5s window
            # of a stale preview still showing in OBS after simply
            # navigating away normally, which is what was reported.
            state["preview"] = None
            preview_expires_at["t"] = 0.0
        elif msg_type == "clear":
            state.update(_EMPTY_STATE)
        elif msg_type == "ended":
            # The song genuinely finished (screen.js's song:ended handler
            # only — not a pause, not a stop) — a one-shot signal, not
            # persistent state, so it goes out via _broadcast_event()
            # instead of being folded into `state`. This is what drives
            # the confetti trigger in render.html: confettiTriggerAt is a
            # score THRESHOLD, and "the run just ended at this score" is
            # the actual trigger moment, not "score changed" (which fires
            # continuously mid-song) or "playing flipped to false" (which
            # also happens on a plain pause).
            await _broadcast_event({"event": "song-ended", "score": body.get("score")})
            return {"ok": True}
        else:
            return JSONResponse({"error": "unknown type"}, status_code=400)

        state["updatedAt"] = time.time()
        await _broadcast()
        return {"ok": True}

    @app.get(f"/api/plugins/{PLUGIN_ID}/state")
    def get_state(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        return state

    @app.get(f"/api/plugins/{PLUGIN_ID}/network-access")
    def get_network_access():
        # Deliberately NOT gated by _network_allowed itself — a second PC
        # needs to be able to tell WHY it's getting 403s from everything
        # else without already having network access. Only ever reveals a
        # single on/off bit, nothing state/layout-shaped.
        return {"enabled": network_access["enabled"]}

    @app.post(f"/api/plugins/{PLUGIN_ID}/network-access")
    async def set_network_access(req: Request):
        # Setting this ON remotely would defeat the entire point — only
        # loopback (the editor, running on this PC) may ever flip it.
        if not _is_loopback(req.client.host if req.client else None):
            return Response(status_code=403)
        try:
            data = await req.json()
        except Exception:
            return JSONResponse({"error": "invalid json"}, status_code=400)
        if not isinstance(data, dict) or not isinstance(data.get("enabled"), bool):
            return JSONResponse({"error": "expected {'enabled': bool}"}, status_code=400)
        network_access["enabled"] = data["enabled"]
        _write_network_access(data["enabled"])
        if not data["enabled"]:
            # _network_allowed is only ever checked at CONNECT time (see
            # the /live websocket handler) — an already-open connection
            # from a remote PC (e.g. OBS's Browser Source, already loaded
            # and streaming) just keeps receiving every future broadcast
            # forever otherwise, completely ignoring this toggle being
            # turned back off. Reported live: the render output stayed
            # reachable over the network even after switching this to
            # "Enable" (off) in the editor. Actively kick every currently-
            # connected non-loopback client the instant sharing goes off,
            # so "off" actually means off for connections that were
            # already established, not just new ones.
            async with clients_lock:
                targets = [ws for ws in clients if not _is_loopback(ws.client.host if ws.client else None)]
            for ws in targets:
                try:
                    await ws.close(code=4403)
                except Exception:
                    pass
            if targets:
                async with clients_lock:
                    for ws in targets:
                        clients.discard(ws)
        return {"enabled": network_access["enabled"]}

    @app.get(f"/api/plugins/{PLUGIN_ID}/network-info")
    def network_info(req: Request):
        # Best-effort LAN IP for the Advanced tab's "Network URL" box, so a
        # second PC's OBS can reach this one without the user having to look
        # up their own IP. UDP socket to a public address, never actually
        # sent (connect() on UDP just picks a local route) — the standard
        # no-network-required trick for asking the OS "what's my outbound
        # IP for a normal route" without depending on any external service
        # actually being reachable.
        #
        # Gated like every other data-bearing route (only network-info
        # itself was missed when the rest of these were added) — a remote,
        # unauthenticated caller has no legitimate reason to learn this
        # machine's LAN IP before Marquee's own sharing toggle is on.
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        import socket
        ip = "127.0.0.1"
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
        except OSError:
            pass
        finally:
            sock.close()
        return {"ip": ip}

    @app.websocket(f"/ws/plugins/{PLUGIN_ID}/live")
    async def live(websocket: WebSocket):
        client_host = websocket.client.host if websocket.client else None
        if not _network_allowed(client_host):
            await websocket.close(code=4403)
            return
        await websocket.accept()
        async with clients_lock:
            clients.add(websocket)
        try:
            await websocket.send_text(json.dumps(state))
            while True:
                # We never expect inbound frames, but await recv() so we
                # notice a disconnect (OBS closing/reloading the Browser
                # Source) instead of leaking the socket in `clients` forever.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception as e:
            # Anything other than a clean WebSocketDisconnect (a reset
            # connection, a malformed frame, etc.) — not fatal to the
            # plugin (the client just gets dropped, same as a clean
            # disconnect, via the `finally` below), but silently
            # swallowing it entirely left zero trace if something odd was
            # actually going wrong with a client's connection. Debug, not
            # warning/error — this can be routine noise (e.g. OBS closing
            # the Browser Source ungracefully), not something that needs
            # to alarm anyone by default.
            log.debug("%s: /live websocket closed unexpectedly: %s", PLUGIN_ID, e)
        finally:
            async with clients_lock:
                clients.discard(websocket)

    @app.get(f"/api/plugins/{PLUGIN_ID}/render")
    def render_page(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        target = _ASSETS_DIR / "render.html"
        if not target.is_file():
            return Response("render.html missing", status_code=404)
        return HTMLResponse(target.read_text(encoding="utf-8"))

    @app.get(f"/api/plugins/{PLUGIN_ID}/editor")
    def editor_page(req: Request):
        # The editor is where network-access itself gets turned on, and
        # loopback always passes _network_allowed regardless — so this
        # only ever actually blocks a REMOTE PC trying to open the editor
        # (never a legitimate reason to), not the local user.
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        target = _ASSETS_DIR / "editor.html"
        if not target.is_file():
            return Response("editor.html missing", status_code=404)
        return HTMLResponse(target.read_text(encoding="utf-8"))

    @app.get(f"/api/plugins/{PLUGIN_ID}/render-core.js")
    def render_core_js(req: Request):
        # Shared ticker/roll rendering engine used by BOTH editor.html's
        # canvas preview and render.html's actual OBS output — the single
        # source of truth these two pages were previously reimplementing
        # independently (and drifting out of sync with each other). See
        # render-core.js's own header comment.
        #
        # Gated for consistency with the pages that embed it (render/
        # editor are both gated) — not because this file itself is
        # sensitive (it's just rendering code, no live show data), but so
        # the access-control story is uniform rather than having one
        # unexplained gap in it.
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        target = _ASSETS_DIR / "render-core.js"
        if not target.is_file():
            return Response("render-core.js missing", status_code=404)
        return Response(target.read_text(encoding="utf-8"), media_type="application/javascript")

    @app.get(f"/api/plugins/{PLUGIN_ID}/presets/{{filename}}")
    def preset_asset(filename: str, req: Request):
        # One generic route for every file under assets/presets/ — each
        # preset (Standard, Small, Tall, User, CraftyGirls, TheMarquee,
        # UserOff — 7 files as of writing) is its own
        # <script src="presets/xxx.js"> loaded straight off disk here,
        # instead of a hand-written route per file (the render-core.js/
        # cover.jpg pattern above) — adding another preset later needs only
        # a new file, no routes.py change. filename comes straight from the
        # URL, so reject anything that isn't a bare filename before it ever
        # touches the filesystem. Gated the same as render-core.js above.
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        if "/" in filename or "\\" in filename or filename.startswith("."):
            return Response(status_code=404)
        target = _ASSETS_DIR / "presets" / filename
        if not target.is_file():
            return Response(status_code=404)
        media_type = "application/javascript" if filename.endswith(".js") else "application/octet-stream"
        return Response(target.read_text(encoding="utf-8"), media_type=media_type)

    @app.get(f"/api/plugins/{PLUGIN_ID}/cover.jpg")
    def cover_image(req: Request):
        # The editor's Album Art element (part of the original design tool
        # this page is built on, untouched — see editor.html's own note on
        # keeping the diff against that source to one appended block) uses a plain relative
        # `<img src="cover.jpg">`, which — served from
        # /api/plugins/marquee/editor — resolves to exactly this URL.
        # It's a design-time PLACEHOLDER for the editor canvas only (so
        # there's something to look at while positioning/scaling the art
        # element); the live OBS output (render.html) never shows this and
        # correctly stays blank until a real song's actual art loads.
        # Gated the same as render-core.js above, for the same reason.
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        target = _ASSETS_DIR / "cover.jpg"
        if not target.is_file():
            return Response(status_code=404)
        return Response(target.read_bytes(), media_type="image/jpeg")

    @app.get(f"/api/plugins/{PLUGIN_ID}/layout")
    def get_layout(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        return state["layout"]

    @app.post(f"/api/plugins/{PLUGIN_ID}/layout")
    async def set_layout(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        try:
            data = await req.json()
        except Exception:
            return JSONResponse({"error": "invalid json"}, status_code=400)
        # Full validation/sanitization of untrusted field VALUES already
        # happens client-side in the editor's importState() (same function
        # used for JSON-paste import); this only checks the request is
        # shaped like a layout at all, so a malformed POST can't corrupt the
        # saved file or crash a connected render page.
        if not isinstance(data, dict) or not isinstance(data.get("elements"), dict):
            return JSONResponse({"error": "expected an object with an 'elements' field"}, status_code=400)
        _write_layout(data)
        state["layout"] = data
        await _broadcast()
        return {"ok": True}

    @app.get(f"/api/plugins/{PLUGIN_ID}/preset-prefs")
    def get_preset_prefs(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        return _read_preset_prefs()

    @app.put(f"/api/plugins/{PLUGIN_ID}/preset-prefs")
    async def set_preset_prefs(req: Request):
        if not _network_allowed(req.client.host if req.client else None):
            return Response(status_code=403)
        try:
            data = await req.json()
        except Exception:
            return JSONResponse({"error": "invalid json"}, status_code=400)
        # Whole-object read/write, same trust model as /layout above — the
        # editor owns building the new full {custom, hiddenBuiltins} object
        # (adding/removing one entry) and PUTs the result; this only checks
        # it's shaped right, not each preset's individual field values.
        if (
            not isinstance(data, dict)
            or not isinstance(data.get("custom"), dict)
            or not isinstance(data.get("hiddenBuiltins"), list)
            or not all(isinstance(k, str) for k in data["hiddenBuiltins"])
        ):
            return JSONResponse({"error": "expected an object with a 'custom' object and a 'hiddenBuiltins' array of strings"}, status_code=400)
        _write_preset_prefs(data)
        return {"ok": True}

    log.info("%s: ready — render page at /api/plugins/%s/render, editor at /api/plugins/%s/editor", PLUGIN_ID, PLUGIN_ID, PLUGIN_ID)
