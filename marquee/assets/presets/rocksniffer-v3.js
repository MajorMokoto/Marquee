  // v3 (addons/current_song_v3/style.css, by PoizenJam): a tall 420px
  // card, solid black, monospace (Lucida Console — closest fallback:
  // Consolas). Full-width square album art fills the top; below it, a
  // genuine scrolling marquee line reading "Artist - Song" (its own CSS
  // literally animates transform on overflow). Marquee Scroll would be an
  // authentic match for that ONE line — but it's a global setting, not
  // per-element, so turning it on also puts Score and Tuning into
  // scrolling-ticker mode even though their short, always-fitting text
  // never needs to scroll; tried it live and it renders as several
  // duplicate copies of "94.32%"/"Drop D" side by side, which reads as
  // broken, not authentic. Left off — a static title beats a genuinely
  // glitchy-looking Score/Tuning. Below the title, a Score/Notes/
  // Multiplier/Streak stat grid in the original — only Score maps to
  // anything Marquee has. Tuning is wedged into the middle of the
  // timestamps row same as v2's accuracy was; same workaround, a small
  // standalone element just above the bar. No path/arrangement or year.
  const rocksnifferV3DefaultLayout = {
    nowplaying: { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Now Playing', rollGroup: null, rollSlot: 1 },
    path:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Path', rollGroup: null, rollSlot: 1 },
    year:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Year', rollGroup: null, rollSlot: 1 },
    album:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Album', rollGroup: null, rollSlot: 1 },
    art:
        { x: 0, y: 0,
                 scale: 5, visible: true, name: 'Album Art' },
    info:
       { x: 0, y: 80,
                width: 420, height: 26, fontSize: 15, visible: true, name: 'Song Title & Artist', rollGroup: null, rollSlot: 1 },
    score:
      { x: 0, y: 85.28301886792453,
  width: 420, height: 24, fontSize: 14, visible: true, name: 'Score', rollGroup: null, rollSlot: 1 },
    tuning:
     { x: 0, y: 90.18867924528301,
  width: 420, height: 20, fontSize: 12, visible: true, name: 'Tuning', rollGroup: null, rollSlot: 1 },
    progress:
   { x: 0, y: 94.33962264150944,
  width: 420, height: 26, fontSize: 13, visible: true, name: 'Song Time', rollGroup: null, rollSlot: 1 },
  };
  const rocksnifferV3DefaultVisuals = {
    accent: '#ffd700',
    accentRgb: '255 215 0',
    chipColor: '#000000',
    chipRgb: '0 0 0',
    chipAlpha: 1,
    borderWidth: 0,
    bold: false,
    italic: false,
    underline: false,
    font: 'Consolas',
    stageWidth: 420,
    stageHeight: 530,
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
