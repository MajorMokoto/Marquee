/*
 * Marquee — shared rendering core.
 *
 * The single source of truth for "how does an element actually animate and
 * display" — ticker setup (bounce/Marquee Scroll), Marquee Roll resolution,
 * and bulb/style-override logic. Loaded by BOTH editor.html's canvas preview
 * and render.html's real OBS output, so there is exactly one implementation
 * instead of two independently-maintained copies that drift apart every
 * time only one of them gets a bug fix.
 *
 * Loaded as a plain classic <script src> by each document separately — this
 * gives editor.html and render.html each their OWN independent
 * window.MarqueeCore object (they never share a live JS runtime), so
 * "shared" here means "one implementation, loaded twice," not shared state
 * between the two pages. Every function below takes layout/visuals as
 * explicit parameters rather than closing over module state, since
 * editor.html's layout/visuals are top-level globals while render.html's
 * are per-renderLayout()-call closure locals — passing them in is what lets
 * the same function body work correctly from both callers.
 *
 * Consolidation complete (batches 1-5, migrated one subsystem at a time,
 * each verified independently before the next moved): style overrides/
 * effective-visuals resolution, ticker setup/text-swap, bulb-mode
 * rendering, Marquee Roll resolution, and per-element name syncing +
 * the genuinely shared slice of the two files' DOM-building helpers.
 * Editor.html and render.html no longer have their own copies of any of
 * this — see each file's own "moved into render-core.js" comments at the
 * spots where the old duplicate code used to live.
 *
 * What's deliberately NOT here, and never will be: render.html's own
 * renderLayout() destroy/rebuild-per-call orchestration, and editor.html's
 * applyLayout()/wireObject() drag-resize interaction code. Those two
 * files' rendering ORCHESTRATION models are fundamentally different (one
 * throws away DOM every call, the other must never disturb an
 * in-progress drag) — merging them was explicitly out of scope; only the
 * leaf rendering-decision functions moved here.
 */
(function (global) {
  'use strict';
  const MarqueeCore = global.MarqueeCore = global.MarqueeCore || {};

  // Minimal key/alphaKey-only list — deliberately NOT the same array as
  // editor.html's own top-level OVERRIDABLE_SETTINGS, which does double
  // duty driving the Customize tab's UI (label/section/min/max/dependents)
  // and includes a textColor entry nothing here ever reads (eff.textColor
  // is never consumed anywhere — applyElementStyleOverrides reads the raw
  // override, ov.textColor, directly instead, same as this shared version
  // does below). This list only exists to feed getEffectiveVisualsFor's
  // merged `eff` object for ticker/bulb behavior — editor.html's UI-driving
  // array stays exactly where it is, untouched, serving a different job.
  const OVERRIDABLE_SETTINGS = [
    { key: 'chipColor', alphaKey: 'chipAlpha' },
    { key: 'accent' },
    { key: 'bold' },
    { key: 'italic' },
    { key: 'underline' },
    { key: 'font' },
    { key: 'borderWidth' },
    { key: 'edgeRounding' },
    { key: 'headerTextColor' },
    { key: 'elementHeadSize' },
    { key: 'elementTextSize' },
    { key: 'marqueeScroll' },
    { key: 'marqueeScrollSpeed' },
    { key: 'marqueeEdgeFade' },
    { key: 'marqueeSparkle' },
    { key: 'marqueeSparkleSize' },
    { key: 'marqueeBulbs' },
    { key: 'marqueeBulbSize' },
    { key: 'marqueeBulbGap' },
    { key: 'marqueeBulbSpeedElements' },
    { key: 'marqueeBulbScroll' },
    { key: 'marqueeBulbScrollClockwise' },
    { key: 'marqueeBulbFlicker' },
    { key: 'marqueeBulbFlickerIntensity' },
    { key: 'marqueeBulbFlickerRandom' },
  ];

  // Exposed (not just an internal helper) — editor.html's own
  // enableElementCustomization also needs this directly, to seed a
  // freshly-customized element's styleOverrides from whatever's currently
  // effective globally, not just as getEffectiveVisualsFor's own internal
  // fallback step.
  MarqueeCore.globalFallbackFor = function globalFallbackFor(visuals, key) {
    if (key === 'marqueeBulbs') return visuals.marqueeBulbMode === 'all' || visuals.marqueeBulbMode === 'elements';
    return visuals[key];
  };

  // Mirrors editor.html's own hexToRgbChannels/render.html's own copy —
  // recomputes the RGB channel string from a hex color when a
  // styleOverrides entry has accent/chipColor but (e.g. from a hand-edited
  // or older layout JSON) is missing its accentRgb/chipRgb sibling, instead
  // of writing an empty --accent-rgb/--chip-rgb custom property (which
  // breaks the rgba(var(--accent-rgb), alpha) color functions that consume
  // it).
  MarqueeCore.hexToRgbChannels = function hexToRgbChannels(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return '0 0 0';
    const num = parseInt(m[1], 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(' ');
  };

  // ---- Score color gradient ----
  //
  // Score's own percentage figure (.stat-value-percent) reacts to the
  // live accuracy value instead of always sitting at a flat --accent — a
  // single dark-to-vivid sweep through red -> olive/yellow -> green, so a
  // glance at the number's own COLOR (not just its digits) reads as "how
  // am I doing," and how BRIGHT that color is reads as "how close to
  // done." Fixed stops for now (first pass, to see how the gradient
  // itself reads before adding a 3rd thing to theme) — SCORE_COLOR_STOPS
  // below is the only thing a future user-color-choice pass needs to
  // swap for visuals fields; everything downstream (the HSL
  // interpolation, where this gets applied) stays the same either way.
  //
  // Four stops, three unevenly-sized segments — not one even 0/50/100
  // split — per actual accuracy-reading conventions: 0-60% is all
  // "struggling," so it gets the widest segment (bright red darkening
  // down into dark olive); 60.1-84.9% is the "solid, unremarkable" zone,
  // an olive-to-bright-yellow brightening sweep; 85-100% is "doing
  // great," a comparatively narrow segment ending on the brightest, most
  // saturated color in the whole ramp — a perfect score should be the
  // single most eye-catching point on the scale, not a dim afterthought.
  const SCORE_COLOR_STOPS = [
    { pct: 0, hex: '#ff0000' },   // pure red
    { pct: 60, hex: '#b4a014' },  // dark yellow, rgb(180,160,20)
    { pct: 85, hex: '#ffff00' },  // bright yellow, rgb(255,255,0)
    { pct: 100, hex: '#00ff00' }, // pure green
  ];

  // Interpolated in HSL, not RGB — a straight RGB lerp between
  // near-opposite hues (red/green in particular) passes through a muddy
  // grey/brown at the midpoint, since their average desaturates; HSL's
  // hue channel instead sweeps smoothly, staying vivid the whole way.
  function hexToHsl(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    const num = m ? parseInt(m[1], 16) : 0;
    const r = ((num >> 16) & 255) / 255;
    const g = ((num >> 8) & 255) / 255;
    const b = (num & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  const SCORE_HSL_STOPS = SCORE_COLOR_STOPS.map((stop) => ({ pct: stop.pct, hsl: hexToHsl(stop.hex) }));
  function lerp(a, b, t) { return a + (b - a) * t; }
  // Hue is circular (0-360, wrapping back to 0) — a plain lerp between
  // e.g. red (~358°) and olive (~49°) would go the LONG way round through
  // 300/200/100° (blue/cyan/green) before reaching olive, instead of the
  // short 51° hop through orange. Picks whichever direction is shorter
  // and lerps that way, wrapping the result back into [0, 360).
  function lerpHue(a, b, t) {
    let diff = b - a;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    return (a + diff * t + 360) % 360;
  }

  // fraction is 0-1 (score.accuracy's own native range — see render.html's
  // fmtPct, which is the only other thing that reads this same value).
  // Finds which pair of SCORE_HSL_STOPS the percentage falls between and
  // lerps just that one segment — generalizes to however many stops
  // SCORE_COLOR_STOPS declares, not hardcoded to exactly 3.
  MarqueeCore.scoreColorForFraction = function scoreColorForFraction(fraction) {
    const pct = Math.max(0, Math.min(1, typeof fraction === 'number' ? fraction : 0)) * 100;
    let lo = SCORE_HSL_STOPS[0], hi = SCORE_HSL_STOPS[SCORE_HSL_STOPS.length - 1];
    for (let i = 0; i < SCORE_HSL_STOPS.length - 1; i++) {
      if (pct >= SCORE_HSL_STOPS[i].pct && pct <= SCORE_HSL_STOPS[i + 1].pct) {
        lo = SCORE_HSL_STOPS[i];
        hi = SCORE_HSL_STOPS[i + 1];
        break;
      }
    }
    const t = hi.pct > lo.pct ? (pct - lo.pct) / (hi.pct - lo.pct) : 0;
    const h = lerpHue(lo.hsl[0], hi.hsl[0], t);
    const s = lerp(lo.hsl[1], hi.hsl[1], t);
    const l = lerp(lo.hsl[2], hi.hsl[2], t);
    return 'hsl(' + h.toFixed(1) + ' ' + s.toFixed(1) + '% ' + l.toFixed(1) + '%)';
  };

  // Sets --score-color on Score's own .stat-value-percent element — scoped
  // to that one element (not root) so it can never leak into anything else
  // that happens to read a similarly-named var. el may be null (element
  // not on screen in the current layout, e.g. Score toggled off) — no-ops
  // rather than throwing, same tolerance every other DOM-touching helper
  // in this file already has.
  //
  // enabled is the Score Color Gradient checkbox (visuals.
  // marqueeScoreColorGradient) — off by default, keeping the old flat
  // --accent behavior until a user opts in. When off this REMOVES
  // --score-color rather than merely not setting it, so flipping the
  // checkbox off mid-song immediately reverts to --accent instead of
  // leaving the last-computed gradient color stuck (the CSS rule is
  // `color: var(--score-color, var(--accent))` — an inline custom
  // property from a previous "on" state would otherwise keep winning).
  MarqueeCore.applyScoreColor = function applyScoreColor(el, fraction, enabled) {
    if (!el) return;
    if (!enabled) {
      el.style.removeProperty('--score-color');
      return;
    }
    el.style.setProperty('--score-color', MarqueeCore.scoreColorForFraction(fraction));
  };

  // The single source of truth every override-aware code path reads from
  // instead of `visuals` directly. Every OVERRIDABLE_SETTINGS key is
  // present on the returned object, so callers never need their own
  // fallback logic. The alphaKey resolution (coloralpha rows — currently
  // just chipColor/chipAlpha — store their alpha under a SEPARATE key from
  // `key` itself) only matters to editor.html's Customize tab alpha slider
  // today; harmless extra work for render.html, which never reads
  // eff.chipAlpha.
  MarqueeCore.getEffectiveVisualsFor = function getEffectiveVisualsFor(layout, visuals, id) {
    const useCustom = !!(layout[id] && layout[id].useCustomStyles);
    const ov = (useCustom && layout[id].styleOverrides) || {};
    const eff = {};
    OVERRIDABLE_SETTINGS.forEach(({ key, alphaKey }) => {
      eff[key] = Object.prototype.hasOwnProperty.call(ov, key) ? ov[key] : MarqueeCore.globalFallbackFor(visuals, key);
      if (alphaKey) {
        eff[alphaKey] = Object.prototype.hasOwnProperty.call(ov, alphaKey) ? ov[alphaKey] : MarqueeCore.globalFallbackFor(visuals, alphaKey);
      }
    });
    return eff;
  };

  // Sets/clears the CSS custom properties + bold class this element's
  // customization state actually needs. Takes the element directly rather
  // than looking it up by id — both callers already have it in hand at
  // their own call sites, so there's no reason to duplicate that lookup
  // inside the shared function too.
  MarqueeCore.applyElementStyleOverrides = function applyElementStyleOverrides(el, layout, visuals, id) {
    if (!el) return;
    const useCustom = !!(layout[id] && layout[id].useCustomStyles);
    const ov = (useCustom && layout[id].styleOverrides) || {};
    if ('chipColor' in ov) {
      el.style.setProperty('--chip-rgb', ov.chipRgb || MarqueeCore.hexToRgbChannels(ov.chipColor));
      el.style.setProperty('--chip-alpha', String(typeof ov.chipAlpha === 'number' ? ov.chipAlpha : 1));
    } else {
      el.style.removeProperty('--chip-rgb');
      el.style.removeProperty('--chip-alpha');
    }
    if ('accent' in ov) {
      el.style.setProperty('--accent', ov.accent);
      el.style.setProperty('--accent-rgb', ov.accentRgb || MarqueeCore.hexToRgbChannels(ov.accent));
    } else {
      el.style.removeProperty('--accent');
      el.style.removeProperty('--accent-rgb');
    }
    if ('textColor' in ov) {
      el.style.setProperty('--text-color', ov.textColor);
      // Separate from --text-color on purpose: Global's own plain text
      // color is ALSO delivered through --text-color (set at the root,
      // inherited down), so a rule can't tell "this is the global
      // default" from "this element has a real per-element override"
      // just by reading --text-color — both look identical. Score's own
      // color rule (.stat-value-percent) needs exactly that distinction:
      // it's intentionally bound to --accent/the gradient rather than
      // --text-color, and Global's text color was never meant to touch
      // it — only an explicit Customize-tab override for Score
      // specifically should be able to beat the gradient/accent. This
      // var only ever gets set here, so its mere presence IS "a real
      // override exists."
      el.style.setProperty('--text-color-override', ov.textColor);
    } else {
      el.style.removeProperty('--text-color');
      el.style.removeProperty('--text-color-override');
    }
    if ('headerTextColor' in ov) {
      el.style.setProperty('--header-text-color', ov.headerTextColor);
    } else {
      el.style.removeProperty('--header-text-color');
    }
    if ('borderWidth' in ov) {
      el.style.setProperty('--border-width', ov.borderWidth + 'px');
    } else {
      el.style.removeProperty('--border-width');
    }
    if ('edgeRounding' in ov) {
      el.style.setProperty('--edge-rounding', ov.edgeRounding + 'px');
    } else {
      el.style.removeProperty('--edge-rounding');
    }
    if ('elementHeadSize' in ov) {
      el.style.setProperty('--element-head-size', ov.elementHeadSize + 'px');
    } else {
      el.style.removeProperty('--element-head-size');
    }
    if ('elementTextSize' in ov) {
      el.style.setProperty('--element-text-size', ov.elementTextSize + 'px');
    } else {
      el.style.removeProperty('--element-text-size');
    }
    if ('marqueeSparkleSize' in ov) {
      el.style.setProperty('--marquee-star-size', ov.marqueeSparkleSize + 'px');
    } else {
      el.style.removeProperty('--marquee-star-size');
    }
    if ('font' in ov) {
      el.style.setProperty('--font-display', `"${ov.font}", 'Segoe UI', Arial, sans-serif`);
    } else {
      el.style.removeProperty('--font-display');
    }
    el.classList.toggle('style-override-bold-on', 'bold' in ov && ov.bold === true);
    el.classList.toggle('style-override-bold-off', 'bold' in ov && ov.bold === false);
    // Same on/off-class pattern as Bold, for the same reason — Italic/
    // Underline are the other two settings that can't just be a CSS
    // custom property, since the global versions are body-level classes
    // reaching every .obj through a descendant selector, not an inherited
    // variable an inline style could cleanly out-rank.
    el.classList.toggle('style-override-italic-on', 'italic' in ov && ov.italic === true);
    el.classList.toggle('style-override-italic-off', 'italic' in ov && ov.italic === false);
    el.classList.toggle('style-override-underline-on', 'underline' in ov && ov.underline === true);
    el.classList.toggle('style-override-underline-off', 'underline' in ov && ov.underline === false);
  };

  MarqueeCore.applyAllElementStyleOverrides = function applyAllElementStyleOverrides(layout, visuals) {
    Object.keys(layout).forEach((id) => {
      const el = document.getElementById('obj-' + id);
      if (el) MarqueeCore.applyElementStyleOverrides(el, layout, visuals, id);
    });
  };

  // ---- Batch 2: ticker setup / text-swap ----

  const MARQUEE_SCROLL_PX_PER_SEC_DEFAULT = 80;

  MarqueeCore.resetTrackToPlainText = function resetTrackToPlainText(track) {
    const firstCopy = track.querySelector('.marquee-copy');
    const text = firstCopy ? firstCopy.textContent : track.textContent;
    if (track.children.length > 0) track.textContent = text;
    return text;
  };

  MarqueeCore.setupBounceTicker = function setupBounceTicker(ticker, track, eff) {
    MarqueeCore.resetTrackToPlainText(track);
    ticker.classList.remove('marquee-scroll-active');
    // Edge Fade no longer implies Marquee Scroll. eff is optional (Roll's
    // own call site doesn't always have a single element's effective
    // settings to hand); when omitted this just leaves the fade off, same
    // as before.
    ticker.classList.toggle('marquee-edge-fade-active', !!(eff && eff.marqueeEdgeFade));
    // Marquee Stars stays Marquee-Scroll-only — the Global/Customize
    // Marquee Sparkle checkbox is greyed out and force-unchecked whenever
    // Marquee Scroll is off (see updateMarqueeSparkleLockState) instead of
    // stars trying to also work over static/bounce text.
    ticker.classList.remove('marquee-stars-active');
    ticker.classList.remove('marquee-bulbs-active');
    track.style.removeProperty('--marquee-unit');
    track.style.removeProperty('--marquee-gap');
    track.style.removeProperty('--marquee-duration');
    ticker.classList.remove('is-overflowing');
    track.style.removeProperty('--ticker-shift');
    track.style.removeProperty('animation-duration');
    const overflow = track.scrollWidth - ticker.clientWidth;
    if (overflow > 2) {
      ticker.classList.add('is-overflowing');
      track.style.setProperty('--ticker-shift', '-' + overflow + 'px');
      track.style.setProperty('animation-duration', Math.max(4, overflow / 28).toFixed(2) + 's');
    }
  };

  // Shared core for every scrolling ticker — plain elements (Tuning,
  // custom text, ...) via setupMarqueeScrollTicker below, AND Marquee
  // Roll's multi-segment combined tickers via setupLinkScrollTicker
  // (Batch 4) — buildCopy() returns one fresh .marquee-copy node; called
  // once to measure, then again per duplicate, so every copy is built the
  // exact same way regardless of which caller it's for. Building the real
  // (possibly styled, for Roll) DOM once and cloning ITS measurement,
  // rather than measuring plain text and swapping in styled spans
  // afterward, is what keeps --marquee-unit matching what actually
  // renders — a stale/mismatched measurement is what a loop-boundary
  // hitch actually is. The rAF self-correction pass below (guarded by a
  // per-track generation counter, so a newer setup call's correction can
  // never be overwritten by a stale older one firing after it) catches
  // whatever sub-pixel drift remains after the initial synchronous
  // measurement — cheap insurance against exactly that class of bug for
  // every scrolling ticker, not just Roll's.
  MarqueeCore.runMarqueeScrollTicker = function runMarqueeScrollTicker(ticker, track, buildCopy, gapPxFn, eff, visuals) {
    // eff is the EFFECTIVE settings for whichever element this ticker
    // belongs to (global visuals merged with that element's own
    // styleOverrides, see getEffectiveVisualsFor) — defaults to plain
    // global visuals for any caller that doesn't know about per-element
    // overrides at all.
    eff = eff || visuals;
    ticker.classList.remove('is-overflowing');
    track.style.removeProperty('--ticker-shift');
    track.style.removeProperty('animation-duration');
    const containerWidth = ticker.clientWidth;
    const setupGen = (parseInt(track.dataset.scrollSetupGen || '0', 10) + 1);
    track.dataset.scrollSetupGen = String(setupGen);

    // marquee-scroll-active AND marquee-stars-active both have to be ON
    // *during* measurement, not just applied afterward: .marquee-copy
    // only gets flex-item layout (flex: none; white-space: nowrap) via
    // ".ticker.marquee-scroll-active .marquee-copy", and — for Roll's
    // separators specifically — .marquee-star-separator's own font-size
    // only shrinks to --marquee-star-size via ".ticker.marquee-stars-
    // active .marquee-star-separator"; measuring before either class is
    // on gives a reference width that doesn't match what actually
    // renders.
    ticker.classList.add('marquee-scroll-active');
    ticker.classList.toggle('marquee-stars-active', !!eff.marqueeSparkle);
    track.textContent = '';
    const referenceCopy = buildCopy();
    track.appendChild(referenceCopy);
    // getBoundingClientRect().width, NOT scrollWidth — scrollWidth
    // includes overflow from position:absolute descendants (Marquee
    // Stars' ::after star cluster is deliberately absolutely-positioned,
    // poking out past the copy's own right edge so it can sit in the
    // gap), but that overflow contributes NOTHING to the real flex/gap
    // distance between one copy and the next. getBoundingClientRect().width
    // reflects only the laid-out box, unaffected by descendant overflow.
    const singleWidth = referenceCopy.getBoundingClientRect().width;
    // gapPxFn (passed by setupLinkScrollTicker, Batch 4) measures a
    // Roll's own separator's real width instead of the generic fallback
    // (3 characters' worth of width) — a plain ticker has no such
    // separator concept, so it keeps the generic fallback.
    const customGapPx = typeof gapPxFn === 'function' ? gapPxFn(referenceCopy) : null;
    const gapPx = (typeof customGapPx === 'number' && customGapPx >= 0)
      ? customGapPx : parseFloat(getComputedStyle(track).fontSize) * 3;
    const unit = singleWidth + gapPx;
    const copiesNeeded = Math.max(2, Math.ceil(containerWidth / unit) + 1);

    track.textContent = '';
    for (let i = 0; i < copiesNeeded; i++) {
      track.appendChild(buildCopy());
    }

    const speed = (typeof eff.marqueeScrollSpeed === 'number' && eff.marqueeScrollSpeed > 0)
      ? eff.marqueeScrollSpeed : MARQUEE_SCROLL_PX_PER_SEC_DEFAULT;
    track.style.setProperty('--marquee-gap', gapPx + 'px');
    track.style.setProperty('--marquee-unit', unit + 'px');
    track.style.setProperty('--marquee-duration', Math.max(0.5, unit / speed).toFixed(2) + 's');
    // Restart the animation cleanly (rather than the browser carrying
    // over an in-flight position/duration from a previous run) —
    // remove+reflow+re-add rather than just updating the custom
    // properties on an already-running animation, so a text/size change
    // restarts cleanly instead of the browser carrying old positions
    // into new keyframe values.
    ticker.classList.remove('marquee-scroll-active');
    void track.offsetWidth;
    ticker.classList.add('marquee-scroll-active');
    ticker.classList.toggle('marquee-edge-fade-active', !!eff.marqueeEdgeFade);

    // Self-correction pass: measured in the wild, a copy's very first
    // measurement can come in narrower than the box actually on screen a
    // moment later (most reliably reproduced with Roll's mixed-font-size
    // separators, but cheap enough to run unconditionally for every
    // scrolling ticker as a safety net) — re-check one frame later and
    // patch just the two duration-driving custom properties, not a full
    // rebuild, if what's actually rendered turned out wider than what
    // was measured.
    requestAnimationFrame(() => {
      // A newer call has already rebuilt this same track — applying
      // this (now stale) correction on top would fight whatever that
      // newer call already set correctly.
      if (track.dataset.scrollSetupGen !== String(setupGen)) return;
      const liveCopy = track.querySelector('.marquee-copy');
      if (!liveCopy) return;
      const actualWidth = liveCopy.getBoundingClientRect().width;
      if (Math.abs(actualWidth - singleWidth) < 0.5) return;
      const correctedUnit = actualWidth + gapPx;
      track.style.setProperty('--marquee-unit', correctedUnit + 'px');
      track.style.setProperty('--marquee-duration', Math.max(0.5, correctedUnit / speed).toFixed(2) + 's');
    });
  };

  MarqueeCore.buildPlainScrollCopy = function buildPlainScrollCopy(text) {
    const span = document.createElement('span');
    span.className = 'marquee-copy';
    span.textContent = text;
    return span;
  };

  MarqueeCore.setupMarqueeScrollTicker = function setupMarqueeScrollTicker(ticker, track, eff, visuals) {
    const originalText = MarqueeCore.resetTrackToPlainText(track);
    MarqueeCore.runMarqueeScrollTicker(ticker, track, () => MarqueeCore.buildPlainScrollCopy(originalText), null, eff, visuals);
  };

  // Every ticker obeys Marquee Scroll — no per-element exceptions, no
  // eligibility check: any element with a ticker gets it the moment the
  // setting (or that element's own override — see getEffectiveVisualsFor)
  // is on. Album Art is the only element with no ticker at all (it's an
  // image, nothing to scroll) — it simply never reaches this function in
  // the first place, since setupAllTickers only calls it for what
  // querySelectorAll('.ticker') actually finds.
  //
  // Carries render.html's signature/dedup guard (editor.html's own
  // version never had one) — skips the rebuild entirely when nothing
  // this function actually reads has changed since the last call for
  // THIS ticker. Without this, setupTicker unconditionally tore down and
  // rebuilt the ticker (remove+reflow+re-add, restarting its CSS
  // animation from scratch) every single time setupAllTickers() ran, for
  // ANY reason, including ones having nothing to do with this element at
  // all. Reported live: Score/Song Time permanently stuck showing one
  // value, only via the live-render-preview iframe (never the real OBS
  // output) — the embedded preview's postMessage channel triggers a full
  // renderLayout() -> setupAllTickers() pass on every drag/resize/style
  // edit, and a rebuild interrupted by ANOTHER rebuild before the
  // browser committed the previous one's forced-reflow restart could
  // leave this ticker's own later text updates (setTextAndReticker) no
  // longer taking visible effect.
  MarqueeCore.setupTicker = function setupTicker(ticker, layout, visuals) {
    const track = ticker.querySelector('.ticker-track');
    if (!track) return;
    const objEl = ticker.closest('.obj');
    // Standardized on the id ATTRIBUTE (not dataset.id) — every .obj
    // element in both files, built-in or dynamically built, always has
    // id="obj-"+id, so this works identically for both callers.
    const eff = objEl ? MarqueeCore.getEffectiveVisualsFor(layout, visuals, objEl.id.replace(/^obj-/, '')) : visuals;
    const firstCopy = track.querySelector('.marquee-copy');
    const currentText = firstCopy ? firstCopy.textContent : track.textContent;
    // document.fonts.status included deliberately — a font-ready fix
    // re-runs setupAllTickers() once fonts finish loading specifically
    // so a measurement taken against the wrong fallback font gets a
    // second, correct pass; nothing else in this signature would
    // otherwise change purely from a font swap, which would let this
    // guard wrongly skip that necessary rebuild.
    const fontStatus = (typeof document !== 'undefined' && document.fonts) ? document.fonts.status : 'unknown';
    // Element Text Size (--element-text-size, global or per-element
    // override — see its own :root comment) changes the track's rendered
    // width without touching anything else in this signature (text,
    // marqueeScroll settings, and ticker.clientWidth, the BOX's width,
    // all stay the same) — reported live: growing the text past its box
    // didn't start bouncing until something unrelated (switching tabs,
    // resizing) happened to change one of the other signature inputs and
    // force a rebuild. objEl's own computed font-size is what the track
    // actually renders at, so it belongs in here alongside clientWidth.
    const fontSize = objEl ? getComputedStyle(objEl).fontSize : '';
    const signature = [
      currentText, eff.marqueeScroll, eff.marqueeScrollSpeed,
      eff.marqueeSparkle, eff.marqueeSparkleSize, eff.marqueeEdgeFade,
      ticker.clientWidth, fontStatus, fontSize,
    ].join('|');
    if (track.dataset.tickerSetupSignature === signature) return;
    track.dataset.tickerSetupSignature = signature;
    if (eff.marqueeScroll) {
      MarqueeCore.setupMarqueeScrollTicker(ticker, track, eff, visuals);
    } else {
      MarqueeCore.setupBounceTicker(ticker, track, eff);
    }
  };

  // ---- Batch 3: bulb-mode ----

  const MARQUEE_BULB_SIZE_DEFAULT = 2.8;
  const MARQUEE_BULB_GAP_DEFAULT = 11;
  // A fixed constant, deliberately not derived from Bulb Size or Bulb Gap
  // — see applyDecorativeBulbs' own comment for why.
  const MARQUEE_BULB_LAYOUT_FRAME_INSET_PX = 1;
  const MARQUEE_BULB_SPEED_DEFAULT = 80;
  // Matches @keyframes marquee-bulb-flicker's own fixed 2.2s duration —
  // kept as one source of truth here since the sync math below needs the
  // raw number, not just the CSS string.
  const MARQUEE_BULB_FLICKER_DURATION_MS = 2200;
  // Captured ONCE, when this script itself loads — the shared "epoch"
  // every element's bulb animations sync against (see setBulbLoop's own
  // comment). Both editor.html and render.html load render-core.js as a
  // fresh classic <script> exactly once per page load, so each document
  // still gets its own true one-time epoch, identical to how this
  // constant behaved before the move (render.html already had it at true
  // module scope, outside any repeatedly-invoked function; editor.html's
  // own copy was top-level for the same reason).
  MarqueeCore.BULB_EPOCH = performance.now();

  // Sizes the ring to the element's CURRENT rendered dimensions and
  // positions individual bulb-dot elements along ONE shared CSS
  // offset-path tracing its rectangle — see the CSS's own comment on
  // .marquee-bulb-dot for why this replaced 4 separately-tiled/clipped
  // edge strips. Also sets whether each of the two INDEPENDENT effects
  // (loop motion / flicker) is actually "on" — swapping an animation-name
  // var to "none" when its effect is off is what lets Bulb Scroll and
  // Bulb Flicker toggle independently without a combinatorial explosion
  // of CSS classes.
  //
  // Three bits of math happen here:
  //
  // 1. A plain tile of size+gap almost never divides evenly into the
  //    element's actual perimeter, which would leave one bulb crowded
  //    right where the loop closes on itself. Instead, this picks the
  //    whole number of bulbs closest to what the requested size+gap
  //    would produce, then divides the ACTUAL perimeter by that count to
  //    get the spacing that fits exactly — same idea as the old tile
  //    math, just in terms of a bulb COUNT now rather than a CSS
  //    background-tile size.
  //
  // 2. Every bulb is simply placed at its own even fraction (i / count)
  //    of the SAME path — unlike 4 independently-tiled edges, there's no
  //    separate continuity math needed at all: evenly spacing N points
  //    along one path is automatically "one continuous loop," including
  //    at the corners, with nothing to keep in step.
  //
  // 3. Direction (marqueeBulbScrollClockwise) is baked directly into
  //    which way the path's points are listed (clockwise vs
  //    counter-clockwise from the top-left corner) — offset-distance
  //    always increases in the direction the path was drawn, so this is
  //    simpler than the old per-edge animation-direction flip.
  //
  // eff is #stage's own (always-global) settings or the calling
  // element's getEffectiveVisualsFor() result; falls back to plain
  // global visuals for any caller that doesn't pass one. visuals is
  // needed explicitly (not just via eff) for #stage's own ring, which
  // always reads plain global marqueeBulbSpeedLayout regardless of what
  // eff resolved to.
  MarqueeCore.setBulbLoop = function setBulbLoop(container, eff, visuals) {
    const src = eff || visuals;

    const bulbSize = (typeof src.marqueeBulbSize === 'number' && src.marqueeBulbSize > 0)
      ? src.marqueeBulbSize : MARQUEE_BULB_SIZE_DEFAULT;
    const bulbGap = (typeof src.marqueeBulbGap === 'number' && src.marqueeBulbGap >= 0)
      ? src.marqueeBulbGap : MARQUEE_BULB_GAP_DEFAULT;
    // Album Art is the one element whose OWN box gets CSS transform:
    // scale()'d — dividing by that same scale here, in JS, is what keeps
    // its bulbs visually the same size as every other element's instead
    // of scaling up/down with the art. Every other element's artScale is
    // just 1 (a no-op).
    const artScale = container.id === 'obj-art'
      ? (parseFloat(container.style.getPropertyValue('--art-scale')) || 1) : 1;
    const size = bulbSize / artScale;
    const gapWanted = bulbGap / artScale;
    // Reads back whatever applyBulbFrame already set as this container's
    // own frame inset (nonzero only for #stage) so the path rectangle
    // shrinks by the same amount.
    const frameInset = parseFloat(container.style.getPropertyValue('--marquee-bulb-frame-inset')) || 0;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const rectW = Math.max(0, w - size - 2 * frameInset);
    const rectH = Math.max(0, h - size - 2 * frameInset);
    const perimeter = 2 * (rectW + rectH);
    const tileWanted = size + gapWanted;
    // Never fewer than 4 — a very small or very narrow element (or a
    // huge Bulb Size relative to it) shouldn't collapse to a handful of
    // giant dots; 4 keeps at least one bulb roughly per side.
    const tileCount = perimeter > 0 && tileWanted > 0 ? Math.max(4, Math.round(perimeter / tileWanted)) : 0;

    container.style.setProperty('--marquee-bulb-dot-size', size.toFixed(2) + 'px');

    // #stage's own ring always reads plain global
    // marqueeBulbScrollClockwiseLayout (no per-element concept for the
    // layout ring's own direction, same split as marqueeBulbScrollLayout
    // above); every other container reads its own EFFECTIVE
    // marqueeBulbScrollClockwise instead.
    const clockwise = container.id === 'stage'
      ? !!visuals.marqueeBulbScrollClockwiseLayout
      : !!src.marqueeBulbScrollClockwise;
    const x0 = size / 2 + frameInset;
    const y0 = size / 2 + frameInset;
    const x1 = size / 2 + frameInset + rectW;
    const y1 = size / 2 + frameInset + rectH;
    // Shares the element's own Edge Rounding setting (the same --edge-
    // rounding value the element's box-border-radius already uses) so the
    // bulb ring's corners visually match the box they trace, instead of
    // always being hard rectangle corners. Radius is capped at half the
    // shorter side so it can never overshoot into a self-intersecting path
    // on a small/narrow element.
    const r = Math.max(0, Math.min(
      typeof src.edgeRounding === 'number' ? src.edgeRounding : 0,
      rectW / 2, rectH / 2
    ));
    const pathStr = buildBulbRingPath(x0, y0, x1, y1, r, clockwise);
    container.style.setProperty('--marquee-bulb-ring-path', `path("${pathStr}")`);

    // #stage's own ring always reads plain global visuals.
    // marqueeBulbSpeedLayout (no per-element concept for the layout
    // ring's own speed); every other container reads its own EFFECTIVE
    // marqueeBulbSpeedElements.
    const bulbSpeedSetting = container.id === 'stage'
      ? visuals.marqueeBulbSpeedLayout : src.marqueeBulbSpeedElements;
    const speed = (typeof bulbSpeedSetting === 'number' && bulbSpeedSetting > 0)
      ? bulbSpeedSetting : MARQUEE_BULB_SPEED_DEFAULT;
    // The FULL lap around the whole path, not just one tile's worth — a
    // dot's motion has to cover the entire 0%-100% span and let that
    // wrap seamlessly (a closed path's 100% and 0% are the same point)
    // rather than resetting every tile, which is visually a snap-back
    // for an individual tracked element (unlike the old
    // repeating-background strips, where "reset every tile" was
    // invisible because one tile of a repeating pattern looks identical
    // to the next).
    const scrollDurationMs = perimeter > 0 && speed > 0 ? (perimeter / speed) * 1000 : 0;
    container.style.setProperty('--marquee-bulb-duration', (scrollDurationMs / 1000).toFixed(3) + 's');

    // #stage's own ring always reads plain global marqueeBulbScrollLayout
    // (no per-element concept for the layout ring's own scroll on/off,
    // same as marqueeBulbSpeedLayout above); every other container reads
    // its own EFFECTIVE marqueeBulbScroll instead — this used to be ONE
    // shared field for both, split per request so Layout/Elements scroll
    // can be turned on/off independently.
    const scrollOn = container.id === 'stage'
      ? visuals.marqueeBulbScrollLayout !== false
      : src.marqueeBulbScroll !== false;
    const flickerOn = !!src.marqueeBulbFlicker;
    // Orbit motion AND flicker are both driven by bulbOrbitTick (below),
    // NOT CSS @keyframes animations — see that function's own comment
    // for why flicker moved to the same mechanism orbit already used.
    // These flags are just what the tick reads to decide whether/how to
    // touch this container's dots each frame.
    container.style.setProperty('--marquee-bulb-orbit-on', scrollOn ? '1' : '0');
    container.style.setProperty('--marquee-bulb-flicker-on', flickerOn ? '1' : '0');
    container.style.setProperty('--marquee-bulb-flicker-random', src.marqueeBulbFlickerRandom ? '1' : '0');
    const rawIntensity = (typeof src.marqueeBulbFlickerIntensity === 'number' && Number.isFinite(src.marqueeBulbFlickerIntensity))
      ? src.marqueeBulbFlickerIntensity : 0.6;
    // The raw 0-1 slider value read as doing nothing until ~15% —
    // remapped so 0% stays genuinely off, but anything above 0 starts at
    // a 15%-equivalent dip and scales up to 100% from there.
    const intensity = rawIntensity > 0 ? (0.15 + rawIntensity * 0.85) : 0;
    container.style.setProperty('--marquee-bulb-flicker-intensity', String(intensity));

    // Reconcile the actual dot elements against the desired count —
    // added/removed at the end, existing ones otherwise left alone (see
    // the delay-guard below for why: a resize or unrelated visuals
    // change shouldn't perturb dots that are already correctly
    // positioned and mid-animation). A COUNT change is the one case
    // where every dot's own (i / count) position is stale regardless —
    // there's no way to preserve individual dot identity through that,
    // same as the old tiling math also had no concept of preserving
    // identity through a tile-size change.
    let dots = Array.prototype.slice.call(container.querySelectorAll(':scope > .marquee-bulb-dot'));
    while (dots.length < tileCount) {
      const dot = document.createElement('span');
      dot.className = 'marquee-bulb-dot';
      container.appendChild(dot);
      dots.push(dot);
    }
    while (dots.length > tileCount) {
      dots.pop().remove();
    }

    // --marquee-bulb-dot-base is each dot's own fixed, even fraction of
    // the shared path — bulbOrbitTick (below) adds its own live,
    // continuously-recomputed progress on top of this every frame, so
    // this is the only per-dot orbit state that needs writing here.
    // Also serves as the RESTING position while Bulb Scroll is off:
    // bulbOrbitTick skips any container with orbit-on=0, so whatever
    // offsetDistance is set to below is what a stopped ring stays at.
    dots.forEach((dot, i) => {
      const basePct = tileCount > 0 ? (i / tileCount) * 100 : 0;
      dot.style.setProperty('--marquee-bulb-dot-base', basePct.toFixed(4) + '%');
      if (!scrollOn) dot.style.offsetDistance = basePct.toFixed(4) + '%';
    });

    // Random mode's per-dot offset is the only per-dot flicker state
    // left to assign — Group mode needs nothing stored per dot at all
    // (bulbOrbitTick computes every dot's shared phase straight from
    // BULB_EPOCH every frame). Same "set exactly once, guarded by
    // whether this dot already has a value" pattern used elsewhere in
    // this function: a dot created long after the rest still keeps a
    // stable random offset instead of getting a fresh one on every
    // resize/recompute. Random on/off forces every affected dot through
    // this block again via resyncAllBulbDelays()/resyncElementBulbDelay()
    // (which now clear _bulbFlickerOffsetMs instead of a CSS property —
    // see bulbOrbitTick's own comment for why flicker moved off CSS
    // custom-property-driven animation-delay entirely: that mechanism
    // is exactly what caused orbit's own resync-decay artifact, and
    // was ALSO the actual cause of the "chasing" flicker reported live
    // here — with dozens of individual dot elements instead of the
    // original 4 large edge strips, each dot's own compositor animation
    // instance turned out to drift out of phase with its neighbors over
    // time even in non-Random/"Group" mode, exactly the same category of
    // artifact, just far more visible with many small independently
    // drifting dots than it ever was with 4 large ones).
    dots.forEach((dot) => {
      if (src.marqueeBulbFlickerRandom) {
        if (dot._bulbFlickerOffsetMs === undefined) {
          dot._bulbFlickerOffsetMs = Math.random() * MARQUEE_BULB_FLICKER_DURATION_MS;
        }
      } else {
        dot._bulbFlickerOffsetMs = 0;
      }
    });
  };

  // Forces every element currently on the stage/canvas to abandon
  // whatever _bulbFlickerOffsetMs their dots are running with and
  // recompute fresh under whatever mode setBulbLoop() reads RIGHT NOW —
  // the only way Bulb Flicker Random's on/off flip can ever reach dots
  // that are already running, since setBulbLoop() itself deliberately
  // never touches an already-assigned offset otherwise. Orbit motion
  // needs no equivalent — bulbOrbitTick (below) recomputes every dot's
  // position fresh every frame, so there's no per-dot orbit state left
  // to resync at all; Group-mode flicker is the same way (nothing
  // stored per dot), it's only Random's per-dot offset that needs this.
  // #stage is included alongside every .obj — Bulb Flicker Random is a
  // plain global visuals toggle with no per-element concept for the
  // layout ring (see setBulbLoop's own bulbSpeedSetting comment for the
  // same pattern on speed), so the layout ring's own dots need exactly
  // the same forced resync or they'd keep whatever offset (0, from
  // whenever bulbs were first enabled) forever regardless of how many
  // times Random gets toggled — reported live as "Random doesn't seem
  // to affect the layout bulbs" after this function was originally
  // written scoped to '.obj' only, before the layout ring could carry
  // its own dots at all.
  MarqueeCore.resyncAllBulbDelays = function resyncAllBulbDelays(layout, visuals) {
    document.querySelectorAll('.obj, #stage').forEach((el) => {
      el.querySelectorAll(':scope > .marquee-bulb-dot').forEach((dot) => {
        dot._bulbFlickerOffsetMs = undefined;
      });
      const id = el.id.replace(/^obj-/, '');
      const isElement = el.id.indexOf('obj-') === 0;
      MarqueeCore.setBulbLoop(el, isElement ? MarqueeCore.getEffectiveVisualsFor(layout, visuals, id) : null, visuals);
    });
  };

  // Same idea as resyncAllBulbDelays but scoped to ONE element — used
  // when only that element's own effective Bulb Flicker Random could
  // have changed (its own override flipped, or customization for it was
  // just enabled/disabled), so every OTHER already-running element's
  // dots are left alone rather than being needlessly perturbed too.
  // Editor-only today (render.html has no UI that changes a single
  // element's customization state live), but harmless to share.
  MarqueeCore.resyncElementBulbDelay = function resyncElementBulbDelay(id, layout, visuals) {
    const el = document.getElementById('obj-' + id);
    if (!el) return;
    el.querySelectorAll(':scope > .marquee-bulb-dot').forEach((dot) => {
      dot._bulbFlickerOffsetMs = undefined;
    });
    MarqueeCore.setBulbLoop(el, MarqueeCore.getEffectiveVisualsFor(layout, visuals, id), visuals);
  };

  // Reproduces the old @keyframes marquee-bulb-flicker's own step
  // pattern (0%,19%,21%,23%,55%,63%,100% => opacity 1; 20%,22%,54%,62%
  // => the dip) as a plain lookup instead of a CSS animation — see
  // bulbOrbitTick's own comment for why flicker moved off CSS entirely.
  // Each branch below is one 1%-wide dip window; steps(1, jump-none)'s
  // effect (hold the earlier keyframe's value constant, jump exactly at
  // the next one) is what these hand-written boundaries reproduce.
  // Builds the rectangular (optionally rounded-corner) SVG path string
  // setBulbLoop uses as the bulb ring's offset-path. `r` of 0 falls back to
  // plain straight corners (skips the arc commands entirely rather than
  // emitting a degenerate zero-radius arc). clockwise/counter-clockwise is
  // still just which order the corners are listed in — see setBulbLoop's
  // own comment on why offset-distance direction follows path draw order.
  function buildBulbRingPath(x0, y0, x1, y1, r, clockwise) {
    const f = (n) => n.toFixed(2);
    if (r <= 0) {
      return clockwise
        ? `M ${f(x0)},${f(y0)} L ${f(x1)},${f(y0)} L ${f(x1)},${f(y1)} L ${f(x0)},${f(y1)} Z`
        : `M ${f(x0)},${f(y0)} L ${f(x0)},${f(y1)} L ${f(x1)},${f(y1)} L ${f(x1)},${f(y0)} Z`;
    }
    const sweep = clockwise ? 1 : 0;
    return clockwise
      ? `M ${f(x0 + r)},${f(y0)} `
        + `L ${f(x1 - r)},${f(y0)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x1)},${f(y0 + r)} `
        + `L ${f(x1)},${f(y1 - r)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x1 - r)},${f(y1)} `
        + `L ${f(x0 + r)},${f(y1)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x0)},${f(y1 - r)} `
        + `L ${f(x0)},${f(y0 + r)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x0 + r)},${f(y0)} Z`
      : `M ${f(x0)},${f(y0 + r)} `
        + `L ${f(x0)},${f(y1 - r)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x0 + r)},${f(y1)} `
        + `L ${f(x1 - r)},${f(y1)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x1)},${f(y1 - r)} `
        + `L ${f(x1)},${f(y0 + r)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x1 - r)},${f(y0)} `
        + `L ${f(x0 + r)},${f(y0)} A ${f(r)},${f(r)} 0 0 ${sweep} ${f(x0)},${f(y0 + r)} Z`;
  }

  function isFlickerDipAt(phasePct) {
    if (phasePct >= 20 && phasePct < 21) return true;
    if (phasePct >= 22 && phasePct < 23) return true;
    if (phasePct >= 54 && phasePct < 55) return true;
    if (phasePct >= 62 && phasePct < 63) return true;
    return false;
  }

  // Cached once — matchMedia's own .matches getter is cheap, but no
  // reason to re-query the media list itself every single frame.
  const bulbReducedMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // Drives ALL rings' orbit motion AND flicker from one shared rAF loop
  // instead of per-dot CSS @keyframes animations — history: both used
  // to be CSS-driven with a negative animation-delay (epoch-synced) so
  // every dot started already mid-cycle in phase with the rest. That
  // worked for orbit until Bulb Speed needed to change on an
  // ALREADY-RUNNING ring: reassigning an already-active dot's delay was
  // tested live and visibly perturbed its timeline, so a periodic hard
  // resync was added to force everything back in phase every few
  // seconds — which fixed the gap-drift it was aimed at, but introduced
  // a NEW problem, reported live as the whole ring smoothly ramping
  // down to a near-stop and then jumping again, exactly on the resync's
  // own schedule. Confirmed live (via temporary diagnostic logging) that
  // this wasn't tab throttling — the resync's own timer fired right on
  // schedule (~4000ms, tab reported visible/not hidden throughout)
  // while the dots' actual on-screen rate decayed smoothly toward zero
  // between resyncs regardless — i.e. an actual browser-level artifact
  // in how Chromium hands an offset-path animation off to the
  // compositor after its CSS-custom-property-driven timing is touched,
  // not anything this codebase's own math was doing wrong. Orbit was
  // moved off CSS animation-delay entirely to sidestep that.
  //
  // Flicker was left on its own separate CSS @keyframes/animation-delay
  // mechanism at the time (a different property, seemingly unrelated to
  // orbit's own offset-distance) — but reported live once dozens of
  // individual dot elements replaced the original 4 large edge strips:
  // even in non-Random "all together" mode, the flicker visibly
  // "chased itself" around the ring instead of blinking in unison. Same
  // root cause as orbit's: each dot's flicker keyframe animation is its
  // own compositor animation instance sharing an element with
  // bulbOrbitTick's own per-frame inline offsetDistance writes, and that
  // combination turned out to let individual dots' opacity timelines
  // drift out of phase with each other over time — invisible with only
  // 4 large strips, obvious with many small independently-drifting
  // dots. Moving flicker onto this exact same rAF/shared-clock mechanism
  // (no separate CSS animation instance per dot at all) removes the
  // possibility of that drift the same way it did for orbit.
  //
  // Computing every dot's position AND opacity directly, every frame,
  // from ONE shared clock (BULB_EPOCH) sidesteps the whole category of
  // problem: there is no per-dot "animation instance" with its own
  // internal clock to ever fall out of sync in the first place, so
  // there's nothing left to periodically resync, and nothing for a
  // delay change (or a neighboring inline-style write) to perturb. Same
  // pattern this file's own fireConfetti already uses for canvas
  // particles — just applied to CSS custom properties/inline styles
  // instead of canvas pixels.
  MarqueeCore._bulbOrbitFrame = null;
  function bulbOrbitTick() {
    const elapsedMs = performance.now() - MarqueeCore.BULB_EPOCH;
    const reducedMotion = !!(bulbReducedMotionQuery && bulbReducedMotionQuery.matches);
    document.querySelectorAll('.marquee-bulbs-active').forEach((container) => {
      const orbitOn = container.style.getPropertyValue('--marquee-bulb-orbit-on') === '1';
      const durationMs = parseFloat(container.style.getPropertyValue('--marquee-bulb-duration')) * 1000;
      const progressPct = (orbitOn && durationMs > 0) ? ((elapsedMs % durationMs) / durationMs) * 100 : null;

      const flickerOn = !reducedMotion && container.style.getPropertyValue('--marquee-bulb-flicker-on') === '1';
      const flickerRandom = container.style.getPropertyValue('--marquee-bulb-flicker-random') === '1';
      const intensity = parseFloat(container.style.getPropertyValue('--marquee-bulb-flicker-intensity')) || 0;

      if (progressPct === null && !flickerOn) return;

      container.querySelectorAll(':scope > .marquee-bulb-dot').forEach((dot) => {
        if (progressPct !== null) {
          const basePct = parseFloat(dot.style.getPropertyValue('--marquee-bulb-dot-base')) || 0;
          dot.style.offsetDistance = ((basePct + progressPct) % 100).toFixed(3) + '%';
        }
        if (flickerOn) {
          const offsetMs = flickerRandom ? (dot._bulbFlickerOffsetMs || 0) : 0;
          const flickerPhasePct = (((elapsedMs + offsetMs) % MARQUEE_BULB_FLICKER_DURATION_MS) / MARQUEE_BULB_FLICKER_DURATION_MS) * 100;
          dot.style.opacity = isFlickerDipAt(flickerPhasePct) ? String(1 - intensity) : '';
        } else {
          dot.style.opacity = '';
        }
      });
    });
    MarqueeCore._bulbOrbitFrame = requestAnimationFrame(bulbOrbitTick);
  }
  MarqueeCore._bulbOrbitFrame = requestAnimationFrame(bulbOrbitTick);

  // The ring is sized against the element's CURRENT clientWidth/
  // clientHeight (see setBulbLoop), so anything that changes those needs
  // to trigger a recompute. Rather than hunting down and hooking every
  // one of those call sites individually, a ResizeObserver catches all
  // of them uniformly. Only ever (un)observed in applyBulbFrame below;
  // observing an already-observed element again is a harmless no-op per
  // spec. True module scope (not nested inside any repeatedly-invoked
  // function) — render.html used to recreate a brand-new ResizeObserver
  // on every single renderLayout() call (every autosave tick); this is
  // now a one-time-per-page-load observer, an incidental fix that falls
  // out of the move.
  //
  // Standardized on the id ATTRIBUTE prefix check (not dataset.id) — #stage
  // itself is also observed (see applyDecorativeBulbs) and has no 'obj-'
  // prefix at all, so only real elements get an eff looked up; #stage
  // always just uses plain global visuals. Works identically for both
  // files' elements, all of which have id="obj-"+id.
  //
  // A resize can fire long after whatever call originally started
  // observing an element, so the callback can't just close over
  // whatever layout/visuals were passed in at THAT moment — it needs
  // whatever is CURRENT at fire time. applyDecorativeBulbs (the only
  // caller of applyBulbFrame, which is the only thing that (un)observes)
  // refreshes these two mirrors on every call, so the observer callback
  // reading them here always sees the latest data, the same way
  // render.html's own lastLayout/lastVisuals mirrors already work for
  // setTextAndReticker/applyLiveState.
  MarqueeCore._bulbResizeLayout = null;
  MarqueeCore._bulbResizeVisuals = null;
  MarqueeCore._bulbLoopResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const layout = MarqueeCore._bulbResizeLayout;
      const visuals = MarqueeCore._bulbResizeVisuals;
      if (!layout || !visuals) continue;
      const isElement = entry.target.id.indexOf('obj-') === 0;
      const eff = isElement ? MarqueeCore.getEffectiveVisualsFor(layout, visuals, entry.target.id.slice(4)) : null;
      MarqueeCore.setBulbLoop(entry.target, eff, visuals);
    }
  });

  // Marquee Bulbs: one universal shape — a single continuous ring of
  // bulbs — applied via the exact same applyBulbFrame/setBulbLoop
  // machinery to both every element AND #stage itself (see
  // applyDecorativeBulbs), with no dependency on any other setting. Runs
  // against every `.obj` found, built-in or not, so Album Art — the one
  // element with no ticker for Marquee Scroll to act on — still gets the
  // exact same ring as everything else; a setting simply does nothing
  // wherever the element has nothing for it to do, not because it was
  // excluded. frameInset (px, default 0) is only ever nonzero for
  // #stage's own ring — see applyDecorativeBulbs.
  MarqueeCore.applyBulbFrame = function applyBulbFrame(el, enabled, frameInset, eff, visuals) {
    if (enabled) {
      el.style.setProperty('--marquee-bulb-frame-inset', (frameInset || 0) + 'px');
      MarqueeCore.setBulbLoop(el, eff, visuals);
      MarqueeCore._bulbLoopResizeObserver.observe(el);
    } else {
      MarqueeCore._bulbLoopResizeObserver.unobserve(el);
      // setBulbLoop's own dots (direct .marquee-bulb-dot children) are
      // otherwise left behind in the DOM every time bulbs get toggled
      // off — invisible (only .marquee-bulbs-active makes them render),
      // so harmless to a viewer, but they'd otherwise just accumulate
      // silently across repeated on/off toggles instead of actually
      // being cleaned up.
      el.querySelectorAll(':scope > .marquee-bulb-dot').forEach((dot) => dot.remove());
    }
    el.classList.toggle('marquee-bulbs-active', !!enabled);
  };

  // visuals.marqueeBulbMode is a 4-way switch (off/all/elements/layout)
  // — an element's own Marquee Bulbs override (part of
  // getEffectiveVisualsFor) can still force it on/off regardless of what
  // the global mode says for Elements as a whole. The boolean fallback
  // handles a layout saved by an older version of this plugin (before
  // the switch existed): true meant "on everywhere", i.e. what 'all'
  // means now.
  MarqueeCore.applyDecorativeBulbs = function applyDecorativeBulbs(layout, visuals) {
    MarqueeCore._bulbResizeLayout = layout;
    MarqueeCore._bulbResizeVisuals = visuals;
    const mode = typeof visuals.marqueeBulbMode === 'string'
      ? visuals.marqueeBulbMode : (visuals.marqueeBulbs ? 'all' : 'off');
    const layoutOn = mode === 'all' || mode === 'layout';
    document.querySelectorAll('.obj').forEach((el) => {
      const id = el.id.replace(/^obj-/, '');
      const eff = id ? MarqueeCore.getEffectiveVisualsFor(layout, visuals, id) : null;
      MarqueeCore.applyBulbFrame(el, eff ? eff.marqueeBulbs : (mode === 'all' || mode === 'elements'), 0, eff, visuals);
    });
    // #stage is already position:relative/overflow:hidden, so the same
    // ring applies to it completely unmodified, except for one extra
    // inward pull (a fixed constant — see MARQUEE_BULB_LAYOUT_FRAME_INSET_PX
    // — not derived from Bulb Size or Gap, so neither slider drags the
    // ring itself inward) so it reads as its own separate frame instead
    // of hugging the same edge an element might be sitting flush
    // against.
    const stageEl = document.getElementById('stage');
    if (stageEl) MarqueeCore.applyBulbFrame(stageEl, layoutOn, MARQUEE_BULB_LAYOUT_FRAME_INSET_PX, null, visuals);
  };

  // ---- Batch 4: Marquee Roll resolution ----

  MarqueeCore.isLinkableElement = function isLinkableElement(id) {
    const el = document.getElementById('obj-' + id);
    return !!(el && el.querySelector('.ticker-track'));
  };

  // Whether `node` is hidden by something BETWEEN it and `objEl`
  // (exclusive of objEl itself) — deliberately ignores whether objEl is
  // hidden, since a grouped member's whole .obj is display:none from a
  // PRIOR resolve pass by the time this runs again on a live update, and
  // that's not a reason to treat its own value as blank. A plain
  // offsetParent/display check on the leaf node can't tell "objEl itself
  // is hidden" apart from "something inside objEl is intentionally
  // hidden" (e.g. .artist when Song Title/Artist are combined, or
  // Score's .stat-value-prev) — this walks the chain stopping at objEl
  // specifically to tell those apart.
  MarqueeCore.isHiddenWithinObj = function isHiddenWithinObj(node, objEl) {
    let n = node;
    while (n && n !== objEl) {
      if (getComputedStyle(n).display === 'none') return true;
      n = n.parentElement;
    }
    return false;
  };

  // Label survives into the combined string (e.g. "Tuning: Drop D"),
  // matching what's already shown on-screen for that element — an
  // element with no visible header (Song Title/Artist, Song Timer)
  // naturally contributes just its value, nothing extra to strip.
  MarqueeCore.getElementLinkText = function getElementLinkText(id) {
    const el = document.getElementById('obj-' + id);
    if (!el) return '';
    const labelEl = el.querySelector('.stat-label');
    const label = labelEl && !MarqueeCore.isHiddenWithinObj(labelEl, el) ? labelEl.textContent.trim() : '';
    const parts = [];
    el.querySelectorAll('.ticker-track').forEach((track) => {
      if (MarqueeCore.isHiddenWithinObj(track, el)) return;
      const copy = track.querySelector('.marquee-copy');
      const text = (copy ? copy.textContent : track.textContent || '').trim();
      if (text) parts.push(text);
    });
    const value = parts.join(' / ');
    if (!value) return '';
    return label ? (label + ': ' + value) : value;
  };

  // Same 3-star glyph cluster as the Marquee Stars flair, for the same
  // reason it was chosen there — reads as "part of the marquee language"
  // rather than a new visual vocabulary. Each segment effectively gets
  // " -" appended and "- " prepended to its neighbor — written as one
  // join separator (segments.join(...) makes " -" + "- " collide into
  // one " -- ", not two separate pieces) rather than per-segment
  // affixes, since that's simpler and produces the exact same result.
  const MARQUEE_LINK_SEPARATOR = ' - ★ ★ ★ - ';
  // What joins segments instead, when Marquee Stars is off — same dash
  // structure, just without the star cluster between the dashes.
  const MARQUEE_LINK_SEPARATOR_PLAIN = ' -- ';

  // Builds a single .marquee-copy with the real styled segments/
  // separators (not plain text) and measures ITS actual rendered width,
  // then clones it for every copy — mirrors setupMarqueeScrollTicker's
  // measure-and-duplicate logic, but working in styled DOM from the
  // start instead of measuring plain text and swapping in styled spans
  // afterward, so every copy is pixel-identical to what was actually
  // measured. The separator's own TEXT CONTENT is chosen here, once, at
  // build time — not toggled after the fact via CSS — so the gap
  // between segments is genuinely sized for whatever's actually there.
  MarqueeCore.buildLinkSegmentSpan = function buildLinkSegmentSpan(segments, eff, visuals) {
    eff = eff || visuals;
    const span = document.createElement('span');
    // marquee-link-copy — lets the generic per-gap star overlay
    // (.marquee-copy::after) exclude this ticker: it carries a real
    // trailing separator instead (below), so the wrap gap is never left
    // for that overlay to fill.
    span.className = 'marquee-copy marquee-link-copy';
    segments.forEach((seg) => {
      span.appendChild(document.createTextNode(seg));
      // Appended after EVERY segment, including the last — so the
      // wrap-around gap reads as just another occurrence of the same
      // separator instead of a visibly different (and, for the star
      // cluster, dash-less) gap.
      if (segments.length > 1) {
        const sep = document.createElement('span');
        sep.className = 'marquee-star-separator';
        sep.textContent = eff.marqueeSparkle ? MARQUEE_LINK_SEPARATOR : MARQUEE_LINK_SEPARATOR_PLAIN;
        span.appendChild(sep);
      }
    });
    return span;
  };

  MarqueeCore.setupLinkScrollTicker = function setupLinkScrollTicker(ticker, track, segments, eff, visuals) {
    MarqueeCore.runMarqueeScrollTicker(ticker, track, () => MarqueeCore.buildLinkSegmentSpan(segments, eff, visuals), (referenceCopy) => {
      // The trailing separator already provides the wrap gap's entire
      // visual spacing itself — the flex `gap` between copies needs to
      // add nothing on top: 0, not the separator's width. A
      // single-segment Roll has no separator at all, so null correctly
      // falls back to the generic gap in that case.
      const hasSeparator = !!referenceCopy.querySelector('.marquee-star-separator');
      return hasSeparator ? 0 : null;
    }, eff, visuals);
  };

  // Marquee Roll elements are real, user-positioned canvas elements —
  // this doesn't create or remove them, only populates whichever already
  // exist with the combined text of whatever real elements are currently
  // assigned to them (via each member's own rollGroup/rollSlot fields).
  // Canonical version = editor.html's own (it had one extra branch,
  // render.html didn't need): when a Roll has zero assigned members, show
  // a dim placeholder (the Roll's own name) instead of a blank box, so it
  // stays identifiable/grabbable — harmless in real OBS output too (a
  // genuinely empty Roll in a real layout is a misconfiguration either
  // way, and a small placeholder is arguably more correct than a silent
  // blank box).
  MarqueeCore.resolveRollGroups = function resolveRollGroups(layout, visuals) {
    const groups = {};
    Object.keys(layout).forEach((id) => {
      if (layout[id].isRoll) return;
      const g = layout[id].rollGroup;
      if (!g || !layout[g] || !layout[g].isRoll) return;
      if (layout[id].visible === false || !MarqueeCore.isLinkableElement(id)) return;
      (groups[g] = groups[g] || []).push(id);
    });
    Object.keys(layout).forEach((rollId) => {
      if (!layout[rollId].isRoll) return;
      const rollEl = document.getElementById('obj-' + rollId);
      if (!rollEl) return;
      const members = (groups[rollId] || []).slice();
      // Explicit slot number, not screen position — lower slot first;
      // ties keep whatever order they were already found in.
      members.sort((a, b) => (layout[a].rollSlot || 0) - (layout[b].rollSlot || 0));
      members.forEach((id) => {
        const el = document.getElementById('obj-' + id);
        if (el) el.style.display = 'none';
      });
      // Harvest each member's text AFTER hiding the OTHER members but
      // regardless of order relative to hiding — getElementLinkText's
      // isHiddenWithinObj check only looks INSIDE each member's own box,
      // not at whether the box itself is hidden.
      const segments = members.map(MarqueeCore.getElementLinkText).filter(Boolean);
      const track = rollEl.querySelector('.ticker-track');
      const ticker = rollEl.querySelector('.ticker');
      if (!track || !ticker) return;
      // Empty (no members assigned yet): show a dim placeholder instead
      // of a blank box, so the Roll stays identifiable/grabbable. The
      // placeholder text is part of its own "signature" so renaming the
      // Roll updates it too, without needing a separate cache-bust call.
      if (!segments.length) {
        const placeholder = layout[rollId].name || rollId;
        const emptySignature = 'EMPTY|' + placeholder;
        if (track.dataset.linkSignature !== emptySignature) {
          track.dataset.linkSignature = emptySignature;
          track.textContent = placeholder;
          ticker.classList.remove('marquee-scroll-active', 'marquee-stars-active', 'marquee-edge-fade-active', 'is-overflowing');
          MarqueeCore.setupTicker(ticker, layout, visuals);
        }
        rollEl.classList.add('obj-roll-empty');
        return;
      }
      rollEl.classList.remove('obj-roll-empty');
      // A Roll is a real element with its own id, so it can carry its own
      // styleOverrides exactly like any other element.
      const eff = MarqueeCore.getEffectiveVisualsFor(layout, visuals, rollId);
      // Only meaningful for the bounce/static branch below — scroll mode
      // uses `segments` directly, via buildLinkSegmentSpan, which picks
      // its own separator content the same way.
      const linkSeparator = eff.marqueeSparkle ? MARQUEE_LINK_SEPARATOR : MARQUEE_LINK_SEPARATOR_PLAIN;
      const combinedText = segments.join(linkSeparator);
      // Rebuild whenever the TEXT changes, or whenever any setting that
      // setupLinkScrollTicker/setupBounceTicker actually reads for its
      // own measurement/duration/classes/mode changes — comparing text
      // alone was the earlier "hitches and resets" bug; a signature
      // combining everything those depend on covers that plus two more:
      // Scroll Speed/Marquee Stars/Edge Fade changing with no text
      // change going stale, and Marquee Scroll itself toggling on/off
      // with nothing else different never rebuilding at all.
      const signature = [
        combinedText,
        eff.marqueeScroll,
        eff.marqueeScrollSpeed,
        eff.marqueeSparkle,
        eff.marqueeSparkleSize,
        eff.marqueeEdgeFade,
      ].join('|');
      if (track.dataset.linkSignature !== signature) {
        track.dataset.linkSignature = signature;
        if (eff.marqueeScroll) {
          MarqueeCore.setupLinkScrollTicker(ticker, track, segments, eff, visuals);
        } else {
          track.textContent = combinedText;
          MarqueeCore.setupBounceTicker(ticker, track, eff);
        }
      }
    });
    // Unassigned (or orphaned — their roll got deleted) members are shown
    // again.
    Object.keys(layout).forEach((id) => {
      if (layout[id].isRoll) return;
      const g = layout[id].rollGroup;
      if (g && layout[g] && layout[g].isRoll) return;
      if (layout[id].visible === false) return;
      const el = document.getElementById('obj-' + id);
      if (el) el.style.display = '';
    });
  };

  // The full shared "re-render everything ticker/bulb/roll related"
  // pass. Editor-only UI concerns (applyInfoLineMode's info-line-mode
  // text swap, refreshLinkIndicators' Customize-tab indicator refresh)
  // stay OUT of this shared version — each file keeps its own thin
  // wrapper for those; render.html's wrapper needs nothing extra at all,
  // so its callers can call this directly.
  MarqueeCore.setupAllTickers = function setupAllTickers(layout, visuals) {
    document.querySelectorAll('.ticker').forEach((t) => {
      if (!t.closest('.obj-roll')) MarqueeCore.setupTicker(t, layout, visuals);
    });
    MarqueeCore.applyDecorativeBulbs(layout, visuals);
    MarqueeCore.resolveRollGroups(layout, visuals);
  };

  // ---- Batch 5: syncElementName + shared DOM-building helpers ----

  // Which built-in elements have a renamable caption, and which selector
  // (scoped to that element's own DOM) holds it. nowplaying's target is
  // .ticker-track, not .eyebrow-standalone itself — its text lives inside
  // a ticker, and writing textContent onto the OUTER wrapper would blow
  // away that nested ticker structure instead of just updating its text.
  MarqueeCore.NAME_SYNC_SELECTOR = {
    nowplaying: '.ticker-track',
    path: '.stat-label',
    tuning: '.stat-label',
    year: '.stat-label',
    score: '.stat-label',
    album: '.stat-label',
  };

  // Writes layout[id].name into whichever element that id's own caption
  // actually lives in, and re-runs its ticker setup if that caption is
  // inside a .ticker (only Now Playing's target is, right now), so a
  // rename takes effect immediately instead of waiting for some
  // unrelated later setupAllTickers() pass.
  MarqueeCore.syncElementName = function syncElementName(id, layout, visuals) {
    const selector = MarqueeCore.NAME_SYNC_SELECTOR[id];
    if (!selector || !layout[id]) return;
    const targetEl = document.getElementById('obj-' + id);
    const caption = targetEl && targetEl.querySelector(selector);
    if (!caption) return;
    caption.textContent = layout[id].name;
    const ticker = caption.closest('.ticker');
    if (ticker) MarqueeCore.setupTicker(ticker, layout, visuals);
  };

  // The genuinely shared piece of buildCustomElementDom between the two
  // files — a <span class="ticker"><span class="ticker-track">text</span
  // ></span> pair. Each file's own buildCustomElementDom keeps its own
  // outer wrapper/id/dataset/toggle-off/resize-handle concerns (which
  // structurally can't be shared — render.html's version is
  // display-only, editor.html's carries interactive chrome
  // wireObject depends on) and just delegates this inner-content piece
  // instead of duplicating the createElement calls line-by-line.
  MarqueeCore.buildTickerTrack = function buildTickerTrack(text) {
    const ticker = document.createElement('span');
    ticker.className = 'ticker';
    const track = document.createElement('span');
    track.className = 'ticker-track';
    track.textContent = text;
    ticker.appendChild(track);
    return ticker;
  };

  // Same idea for buildRollElementDom's shared inner content — a
  // <span class="stat-value"><span class="ticker"><span class="ticker-
  // track"></span></span></span> chain, empty (a Roll's content is
  // filled in later by resolveRollGroups, never at build time).
  MarqueeCore.buildRollValueShell = function buildRollValueShell() {
    const value = document.createElement('span');
    value.className = 'stat-value';
    value.appendChild(MarqueeCore.buildTickerTrack(''));
    return value;
  };

  // Confetti — a continuous cannon+rain particle emitter, not a one-shot
  // burst: spawns for exactly visuals.confettiDuration seconds then just
  // stops emitting, while whatever's already airborne keeps flying/falling
  // under gravity at full opacity until it drops out of the bottom of frame
  // and gets removed — no fade-to-invisible cutoff (that used to fade
  // everything out over the final ~500ms of Duration regardless of where
  // particles physically were, cutting them off mid-flight; removed
  // 2026-08-04). canvas/stage are passed in rather than looked up here
  // since editor.html and render.html each have their own DOM — same
  // reasoning as every other function in this file. _confettiAnimId lives
  // on MarqueeCore itself (like _bulbResizeLayout/_bulbResizeVisuals below)
  // since each page gets its own independent MarqueeCore instance, so this
  // is per-page state, not state shared between pages.
  MarqueeCore._confettiAnimId = null;
  MarqueeCore.fireConfetti = function fireConfetti(canvas, stage, visuals) {
    if (!visuals.confettiEnabled) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!canvas || !stage) return;
    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
    const dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff8200';
    const COLORS = [accent, '#ffd37a', '#f3e9d8', '#ff3b6b', '#3ba1ff', '#2ee87d', '#c65bff', '#ffe63b', '#ff7a1a', '#00e5ff', '#ff5cc0'];

    function currentDurationMs() {
      // Falls back to Standard's own default (7s) rather than passing
      // undefined straight to clamp() — Math.max(1, undefined) is NaN,
      // which would make every "elapsed < durationMs" check false
      // forever: confetti stays enabled but silently never spawns
      // anything, no error, no visible sign why.
      const d = typeof visuals.confettiDuration === 'number' ? visuals.confettiDuration : 7;
      return clamp(d, 1, 20) * 1000;
    }
    const MIN_RATE_PER_SEC = 20;
    const MAX_RATE_PER_SEC = 1200;
    const volume = clamp(typeof visuals.confettiVolume === 'number' ? visuals.confettiVolume : 0.5, 0, 1);
    const ratePerSec = MIN_RATE_PER_SEC + volume * (MAX_RATE_PER_SEC - MIN_RATE_PER_SEC);
    const GRAVITY = 0.02;
    const ANGLE_SPREAD_DEG = 25;

    function spawnCannon() {
      const fromLeft = Math.random() < 0.5;
      const angleRad = ((45 + (Math.random() - 0.5) * ANGLE_SPREAD_DEG) * Math.PI) / 180;
      const speed = 1.8 + Math.random() * 1.4;
      return {
        x: fromLeft ? Math.random() * 14 : w - Math.random() * 14,
        y: h - Math.random() * 10,
        size: 4 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vx: Math.cos(angleRad) * speed * (fromLeft ? 1 : -1),
        vy: -Math.sin(angleRad) * speed,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 12,
        rect: Math.random() < 0.5,
      };
    }
    function spawnRain() {
      return {
        x: Math.random() * w,
        y: -10,
        size: 4 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vx: (Math.random() - 0.5) * 2.2,
        vy: 1 + Math.random() * 1.25,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 12,
        rect: Math.random() < 0.5,
      };
    }

    if (MarqueeCore._confettiAnimId) cancelAnimationFrame(MarqueeCore._confettiAnimId);
    let particles = [];
    let cannonCarry = 0;
    let rainCarry = 0;
    const start = performance.now();
    let lastFrameTime = start;
    function frame(now) {
      const elapsed = now - start;
      const dt = now - lastFrameTime;
      lastFrameTime = now;
      const durationMs = currentDurationMs();

      if (elapsed < durationMs) {
        cannonCarry += (ratePerSec / 2) * (dt / 1000);
        rainCarry += (ratePerSec / 2) * (dt / 1000);
        while (cannonCarry >= 1) {
          const p = spawnCannon();
          const phase = Math.random();
          p.x += p.vx * phase;
          p.y += p.vy * phase;
          p.vy += GRAVITY * phase;
          particles.push(p);
          cannonCarry -= 1;
        }
        while (rainCarry >= 1) {
          const p = spawnRain();
          const phase = Math.random();
          p.x += p.vx * phase;
          p.y += p.vy * phase;
          p.vy += GRAVITY * phase;
          particles.push(p);
          rainCarry -= 1;
        }
      }

      ctx.clearRect(0, 0, w, h);
      particles = particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY;
        p.rotation += p.vr;
        if (p.y - p.size > h) return false;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.rect) {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return true;
      });

      if (elapsed < durationMs || particles.length > 0) {
        MarqueeCore._confettiAnimId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
        MarqueeCore._confettiAnimId = null;
      }
    }
    MarqueeCore._confettiAnimId = requestAnimationFrame(frame);
  };
})(window);
