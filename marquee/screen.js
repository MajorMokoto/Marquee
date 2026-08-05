// Marquee — screen.js
//
// Runs inside FeedBack's own Electron window (per the plugin `script`
// contract), so it's the one piece of this plugin that can actually reach
// window.feedBack. It subscribes to the host's event bus and forwards a
// normalized snapshot to this plugin's own backend over POST, which then
// fans it out to any connected OBS Browser Source over WebSocket.
//
// Confirmed live against a running FeedBack instance (see README.md in this
// folder for what was checked and how):
//   - song:loaded gives currentSong {filename, title, artist, duration,
//     arrangement, arrangementSmartName, arrangementIndex, tuning, ...} —
//     no `year` or `album`; both come from GET /api/song/{filename}
//     (library metadata).
//   - song:position-changed does NOT reliably fire — confirmed live (CDP,
//     real playback) that it never fires at all for stems-based songs, so
//     live position comes from polling window.highway.getTime() instead
//     (the same clock FeedBack's own #hud-time display polls directly —
//     see the resync heartbeat below).
//   - note:hit / note:miss fire live IF the separate `note_detect` plugin is
//     installed & enabled — when present, window.noteDetect.getStats() is
//     the AUTHORITATIVE current score (see below for why this reads that
//     instead of tallying hit/miss events itself); when absent, Score
//     simply never updates (see README).
(function () {
    'use strict';
    const PLUGIN_ID = 'marquee';
    const INGEST_URL = `/api/plugins/${PLUGIN_ID}/ingest`;
    const RESYNC_INTERVAL_MS = 100; // was 500, before that 1000 — pushed as close to real-time as is reasonable over a local HTTP POST + WS fan-out without spamming needlessly (a real display refresh doesn't benefit from much faster than this)

    if (!window.feedBack || typeof window.feedBack.on !== 'function') {
        console.error('Marquee: window.feedBack not available, cannot wire live data.');
        return;
    }

    // window.feedBack is a real EventTarget (see app.js: emit() does
    // `this.dispatchEvent(new CustomEvent(event, { detail }))`), so a
    // listener registered via .on() — which is literally addEventListener —
    // receives the Event object, NOT the payload. The payload lives at
    // event.detail. Confirmed live: without this unwrap, every handler
    // below silently got `undefined`/an Event instead of real data (song
    // title/artist/tuning came through blank, position stuck at 0). This
    // wrapper does the unwrap once so every listener below can take the
    // payload directly, the way it looks like it should work.
    function on(event, fn) {
        window.feedBack.on(event, (e) => fn(e && 'detail' in e ? e.detail : e));
    }

    // ── scoring ────────────────────────────────────────────────────────
    // Earlier versions tallied hits/misses locally by counting note:hit /
    // note:miss events since song:loaded. That drifts from what FeedBack
    // itself shows the moment a user scrubs backward or restarts mid-song:
    // note_detect recalculates/resets its OWN internal score for the new
    // playhead position (confirmed live-observed — FeedBack's own score
    // display resets to match progress at the new position), but there's
    // no guarantee it re-emits a fresh note:hit/note:miss event pair for
    // every already-judged note in the process — so a purely event-driven
    // local tally could keep counting up from a stale total forever.
    // note_detect exposes its own authoritative running total instead
    // (plugins/notedetect/screen.js: `getStats() → {hits, misses, streak,
    // bestStreak, accuracy, score, ...}`, confirmed present in that file) —
    // reading THAT directly, on a poll rather than purely event-triggered,
    // means any internal recalculation note_detect does for ANY reason
    // (seek, restart, something not covered here) is picked up within
    // RESYNC_INTERVAL_MS regardless of whether it happened to emit an event
    // Marquee specifically listens for.
    let prevAccuracy = null; // last COMPLETED play's accuracy for this exact song+arrangement — see fetchPreviousAccuracy()

    // The most recent score reading that actually had real data
    // (hasCurrent: true) — used by song:ended below INSTEAD OF a fresh
    // currentScorePayload() call at that exact moment. Reason: note_detect
    // documents that isEnabled() "goes false on every song-switch... to
    // clear stale stats" — if it disables itself right around the song
    // genuinely ending (plausible; ending and advancing to the next song
    // are adjacent moments), a fresh read taken from INSIDE the
    // song:ended handler could already see isEnabled()===false and report
    // hasCurrent:false, which would make the confetti trigger's own gate
    // (render.html's handleServerEvent: `if (sc.hasCurrent ...)`) fail —
    // even though there was very much a real, current score just moments
    // earlier. This sidesteps that race entirely by never trusting a
    // score reading taken at the one moment note_detect is most likely to
    // be tearing itself down.
    let lastGoodScore = null;

    function currentScorePayload() {
        let hits = 0, misses = 0, scorePoints = 0, hasCurrent = false;
        if (window.noteDetect && typeof window.noteDetect.getStats === 'function'
            && typeof window.noteDetect.isEnabled === 'function' && window.noteDetect.isEnabled()) {
            const s = window.noteDetect.getStats();
            if (s) {
                hits = s.hits || 0;
                misses = s.misses || 0;
                scorePoints = typeof s.score === 'number' ? s.score : 0;
                hasCurrent = (hits + misses) > 0;
            }
        }
        if (!hasCurrent && prevAccuracy === null) return null; // truly nothing to show
        const accuracy = (hits + misses) > 0 ? hits / (hits + misses) : 0;
        // hasCurrent lets render.html show "—" for the live percentage
        // before any notes are judged this run, while still showing
        // "Prev X%" underneath from the moment the song loads.
        const payload = { hits, misses, accuracy, score: scorePoints, prevAccuracy, hasCurrent };
        if (hasCurrent) lastGoodScore = payload;
        return payload;
    }

    // ── networking ─────────────────────────────────────────────────────
    function send(body) {
        fetch(INGEST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch((e) => console.warn('Marquee: ingest failed', e && e.message ? e.message : e));
    }

    let lastScoreKey = null;
    // `payload` lets a caller that already has a fresh currentScorePayload()
    // reading (song:ended below) reuse it instead of triggering a second
    // note_detect read for the same instant.
    function pushScoreIfChanged(payload) {
        if (payload === undefined) payload = currentScorePayload();
        const key = payload ? JSON.stringify(payload) : null;
        if (key === lastScoreKey) return;
        lastScoreKey = key;
        send({ type: 'score', score: payload });
    }

    // Shared by both fetches below: same JSON-or-null-on-any-failure shape,
    // used to reach FeedBack's own endpoints (fetchPreviousAccuracy's
    // /api/stats/{filename}, buildSongPayload's /api/song/{filename}).
    async function fetchJson(url) {
        try {
            const r = await fetch(url);
            return r.ok ? await r.json() : null;
        } catch (e) {
            return null;
        }
    }

    // ── previous score (per song+arrangement — "path" in the overlay) ───
    // FeedBack persists best/last score PER ARRANGEMENT of a song (library
    // metadata db, exposed at GET /api/stats/{filename} as
    // {..., arrangements: [{arrangement, last_accuracy, best_accuracy, ...}]}),
    // keyed by the same integer index as currentSong.arrangementIndex. An
    // earlier version of this file only ever showed a "previous" score if
    // THIS browser session had already played that exact song earlier in
    // the same FeedBack run — never FeedBack's own persisted history — so
    // it was blank on every fresh launch. This reads the real thing.
    async function fetchPreviousAccuracy(filename, arrangementIndex) {
        if (!filename) return null;
        const data = await fetchJson(`/api/stats/${encodeURIComponent(filename)}`);
        if (!data || !Array.isArray(data.arrangements)) return null;
        const idx = (typeof arrangementIndex === 'number') ? arrangementIndex : 0;
        const row = data.arrangements.find((a) => a.arrangement === idx);
        return (row && typeof row.last_accuracy === 'number') ? row.last_accuracy : null;
    }

    // ── song metadata enrichment (year isn't in the live event payload) ──
    async function buildSongPayload(currentSong) {
        if (!currentSong) return null;
        const tuningName = (typeof window.feedBack.displayTuningName === 'function')
            ? window.feedBack.displayTuningName(null, currentSong.tuning)
            : '';
        const path = currentSong.arrangementSmartName || currentSong.arrangement || '';
        const artUrl = currentSong.filename
            ? `/api/song/${encodeURIComponent(currentSong.filename)}/art`
            : null;

        // Album — like `year`, not in the live song:loaded payload, only in
        // the library metadata fetch (GET /api/song/{filename}; see
        // lib/scan_worker.py's _extract_meta_for_file, which always
        // includes an "album" key — "" when genuinely unknown, same as
        // title/artist/year).
        let year = null;
        let album = '';
        if (currentSong.filename) {
            const meta = await fetchJson(`/api/song/${encodeURIComponent(currentSong.filename)}`);
            if (meta && meta.year) year = meta.year;
            if (meta && meta.album) album = meta.album;
        }

        return {
            filename: currentSong.filename || null,
            title: currentSong.title || '',
            artist: currentSong.artist || '',
            tuning: tuningName,
            path,
            year,
            album,
            artUrl,
            duration: currentSong.duration || 0,
        };
    }

    // ── live position tracking ────────────────────────────────────────
    // The resync heartbeat below is the only writer now (see its own
    // comment) — kept as module state rather than a local so send() always
    // has the latest known values even between ticks.
    let lastPosition = { time: 0, duration: 0 };

    // duration is never overwritten with a falsy/non-positive value — a
    // song's duration is constant for its whole playthrough, so the only
    // thing that should ever actually CHANGE it is a new song:loaded
    // (handled directly below, not through this function).
    function setPosition(time, duration) {
        lastPosition = {
            time: time || 0,
            duration: (typeof duration === 'number' && duration > 0) ? duration : lastPosition.duration,
        };
        send({ type: 'position', position: lastPosition });
    }

    // ── event wiring ──────────────────────────────────────────────────
    on('song:loaded', async (currentSong) => {
        lastScoreKey = null;
        const song = currentSong || window.feedBack.currentSong;
        // The one place duration is allowed to change unconditionally —
        // a genuinely new song, not a same-song event whose payload might
        // just be missing the field. Set directly (not via setPosition())
        // so a song with a momentarily-unknown duration (0) doesn't get
        // stuck carrying the PREVIOUS song's duration forward instead.
        lastPosition = { time: 0, duration: (song && song.duration) || 0 };
        // Independent of each other (previous-accuracy lookup vs. current
        // song's own metadata enrichment) — run concurrently rather than
        // waiting on one before starting the other.
        const [accuracy, builtSong] = await Promise.all([
            fetchPreviousAccuracy(song && song.filename, song && song.arrangementIndex),
            buildSongPayload(song),
        ]);
        prevAccuracy = accuracy;
        send({ type: 'song', song: builtSong });
        // Show "Prev X%" immediately rather than waiting for the first
        // note judgment of this run (server-side, a `type:'song'` ingest
        // resets score to null, so this needs to follow it, not precede it).
        pushScoreIfChanged();
    });

    // Scrubbing the song (forward OR backward) or restarting it from
    // within FeedBack doesn't always come with a fresh note:hit/note:miss
    // event for note_detect's score recalculation at the new playhead —
    // resync the score here directly rather than waiting for the next
    // judgment. Position needs no special handling on seek — the resync
    // heartbeat below picks up the new playhead within RESYNC_INTERVAL_MS
    // via window.highway.getTime().
    on('song:seek', () => pushScoreIfChanged());

    on('song:ended', () => {
        // Distinct from a plain score push: this is the confetti
        // trigger's actual moment (the run genuinely finished, not paused
        // or stopped early) — see routes.py's "ended" handling for why
        // it's a one-shot event rather than folded into the persistent
        // state. Prefer a FRESH reading if note_detect still confidently
        // has one at this exact instant, but fall back to lastGoodScore
        // (the last reading that genuinely had hasCurrent:true) if not —
        // see that variable's own comment for the race this guards
        // against. Without this fallback, a mistimed disable right at
        // song-end could report hasCurrent:false here and silently fail
        // the confetti trigger's own gate for a run that very much did
        // have a real, current score moments earlier. Read once and reuse
        // for both the regular score push and the ended payload below,
        // rather than triggering a second note_detect read for the same
        // instant.
        const freshScore = currentScorePayload();
        pushScoreIfChanged(freshScore);
        const endedScore = (freshScore && freshScore.hasCurrent) ? freshScore : lastGoodScore;
        console.log('Marquee: song:ended — fresh score =', freshScore, 'lastGoodScore =', lastGoodScore, 'sending =', endedScore);
        send({ type: 'ended', score: endedScore });
    });

    // note:hit / note:miss only fire if the `note_detect` plugin is present
    // and actively scoring the current run — see the file header comment.
    // These just trigger an immediate re-read of getStats() for snappy
    // feedback; the periodic resync below is what actually guarantees
    // correctness (see the scoring comment above).
    on('note:hit', () => pushScoreIfChanged());
    on('note:miss', () => pushScoreIfChanged());

    on('screen:changed', (evt) => {
        // Leaving the player screen entirely (library, settings, ...) —
        // clear the overlay rather than leaving a stale "now playing".
        if (evt && evt.id !== 'player') {
            send({ type: 'clear' });
        }
    });

    // ── periodic resync — the ONLY position source ──────────────────────
    // Live-tested (CDP, real playback against a stems-based song,
    // 2026-07-19): song:position-changed only ever fires via two host-side
    // paths — the HTML5 <audio> element's native 'timeupdate' event, or
    // JUCE's polling loop — and NEITHER covers stems playback (confirmed:
    // static/js/juce-audio.js's own renderer-bus diagnostics show
    // elementSong=false whenever a stems graph is active, and a raw
    // listener attached directly to the <audio> DOM element, bypassing all
    // FeedBack/Marquee JS, never fired once across 30+ seconds of verified
    // real playback). song:play/song:resume didn't help either — caught
    // live re-broadcasting a stale value instead of a real one, since
    // they never carried position data to begin with.
    //
    // window.highway.getTime() is the fix: it's the exact clock FeedBack's
    // own #hud-time display reads every 60Hz tick (static/app.js) via a
    // plain property read rather than any event, exposed publicly "for
    // plugins" (static/highway.js) and already used this way by
    // note_detect/metronome/fretboard/audio_engine. It's a proper
    // interpolating clock — smooth between audio's own ~23ms update
    // granularity, and correctly falls back to a frozen raw value once
    // audio genuinely pauses/stalls — so pause/seek/resume all just fall
    // out of polling it, with no dedicated handling needed for any of
    // them. Works identically across the element/JUCE/stems engines
    // because it sits above all three.
    //
    // pushScoreIfChanged() already no-ops when nothing changed, so this
    // doesn't spam the backend with redundant score writes even though
    // it's called every tick.
    setInterval(() => {
        if (!window.feedBack.currentSong) return;
        const liveTime = (window.highway && typeof window.highway.getTime === 'function')
            ? window.highway.getTime()
            : lastPosition.time;
        setPosition(liveTime, lastPosition.duration);
        pushScoreIfChanged();
    }, RESYNC_INTERVAL_MS);

    console.log('Marquee: live data bridge installed.');
})();
