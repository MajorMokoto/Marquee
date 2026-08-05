  // v4 (addons/current_song_v4/style.css) — the current/highest-numbered
  // version, so this is the plain "Rocksniffer" preset. A 400px card,
  // solid dark teal (#004d4d), Verdana, square corners. Song name +
  // artist stacked at top, full-width square album art below, then a
  // Path/Tuning row (RockSniffer's arrangement type left, tuning name
  // right — Marquee centers text within each element rather than edge-
  // aligning it, per a recent deliberate global change, so this reads as
  // "Path on the left half, Tuning on the right half" rather than
  // flush-left/flush-right, the closest available match), then a
  // full-width progress bar. No Score or year — v4's template doesn't
  // read live accuracy at all.
  const rocksnifferV4DefaultLayout = {
    nowplaying: { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Now Playing', rollGroup: null, rollSlot: 1 },
    year:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Year', rollGroup: null, rollSlot: 1 },
    score:
      { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Score', rollGroup: null, rollSlot: 1 },
    info:
       { x: 0,
    y: 0,
                  width: 400, height: 56, fontSize: 22, visible: true, name: 'Song Title & Artist', rollGroup: null, rollSlot: 1 },
    album:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Album', rollGroup: null, rollSlot: 1 },
    art:
        { x: 1.5,
  y: 11.538461538461538, scale: 4.619047619047619, visible: true, name: 'Album Art' },
    path:
       { x: 1.5,
  y: 86.92307692307692,
  width: 190, height: 30,
  fontSize: 16, visible: true, name: 'Path', rollGroup: null, rollSlot: 1 },
    tuning:
     { x: 51,
   y: 86.92307692307692,
  width: 190, height: 30,
  fontSize: 16, visible: true, name: 'Tuning', rollGroup: null, rollSlot: 1 },
    progress:
   { x: 1.5,
  y: 93.46153846153847,
  width: 388, height: 30,
  fontSize: 16, visible: true, name: 'Song Time', rollGroup: null, rollSlot: 1 },
  };
  const rocksnifferV4DefaultVisuals = {
    accent: '#009999',
    accentRgb: '0 153 153',
    chipColor: '#004d4d',
    chipRgb: '0 77 77',
    chipAlpha: 1,
    borderWidth: 0,
    bold: false,
    italic: false,
    underline: false,
    font: 'Verdana',
    stageWidth: 400,
    stageHeight: 520,
    canvasBgColor: '#000000',
    canvasBgRgb: '0 0 0',
    canvasBgAlpha: 0,
    elementHeadSize: 8,
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
