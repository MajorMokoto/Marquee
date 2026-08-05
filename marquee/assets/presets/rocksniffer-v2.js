  // v2 (addons/current_song_v2/style.css): a compact 300px card, flat
  // 70%-opaque black, Open Sans (closest fallback: Segoe UI — Open Sans
  // itself isn't in FALLBACK_FONTS). Song name + artist stacked at top,
  // full-width square album art below that, then a progress bar with
  // live accuracy WEDGED BETWEEN the two timestamps on the row below it
  // — Marquee's Song Time has no middle slot for that, so Score sits as
  // its own small element directly above the bar instead, the closest
  // available approximation. No tuning, path/arrangement, or year.
  const rocksnifferV2DefaultLayout = {
    nowplaying: { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Now Playing', rollGroup: null, rollSlot: 1 },
    tuning:
     { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Tuning', rollGroup: null, rollSlot: 1 },
    year:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Year', rollGroup: null, rollSlot: 1 },
    path:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Path', rollGroup: null, rollSlot: 1 },
    score:
      { x: 20,
                  y: 84.87804878048781, width: 180, height: 24,
  fontSize: 16, visible: true, name: 'Score', rollGroup: null, rollSlot: 1 },
    info:
       { x: 0,
                   y: 0.975609756097561, width: 300, height: 50,
  fontSize: 21, visible: true, name: 'Song Title & Artist', rollGroup: null, rollSlot: 1 },
    progress:
   { x: 1.3333333333333333,
  y: 91.70731707317073,
  width: 290, height: 30, fontSize: 14, visible: true, name: 'Song Time', rollGroup: null, rollSlot: 1 },
    album:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Album', rollGroup: null, rollSlot: 1 },
    art:
        { x: 1.3333333333333333,
  y: 13.170731707317072, scale: 3.4523809523809526, visible: true, name: 'Album Art' },
  };
  const rocksnifferV2DefaultVisuals = {
    accent: '#ffffff',
    accentRgb: '255 255 255',
    chipColor: '#000000',
    chipRgb: '0 0 0',
    chipAlpha: 0.7,
    borderWidth: 0,
    bold: false,
    italic: false,
    underline: false,
    font: 'Segoe UI',
    stageWidth: 300,
    stageHeight: 410,
    canvasBgColor: '#000000',
    canvasBgRgb: '0 0 0',
    canvasBgAlpha: 0,
    elementHeadSize: 10,
    elementTextSize: 16,
    edgeRounding: 0,
    confettiEnabled: true,
    confettiDuration: 7,
    confettiVolume: 1,
    confettiTriggerAt: 100,
    marqueeScroll: false,
    marqueeScrollSpeed: 80,
    marqueeEdgeFade: false,
    marqueeSparkle: false,
    marqueeSparkleSize: 10,
    marqueeBulbMode: 'off',
    marqueeBulbSize: 2.8,
    marqueeBulbGap: 11,
    marqueeBulbSpeedElements: 80,
    marqueeBulbSpeedLayout: 80,
    marqueeBulbScroll: true,
    marqueeBulbScrollLayout: true,
    marqueeBulbFlicker: false,
    marqueeBulbFlickerIntensity: 0.6,
    marqueeBulbFlickerRandom: false,
    fadeSeconds: 5,
    fadeEnabled: true,
  };
