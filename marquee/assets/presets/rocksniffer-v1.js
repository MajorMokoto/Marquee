  // RockSniffer-inspired presets — one per distinct look its "current
  // song" overlay addon has shipped as, reverse-engineered from the real
  // HTML/CSS in kokolihapihvi/RockSniffer's addons/current_song* folders
  // (GitHub), not guessed. Only elements RockSniffer's own template
  // actually shows are positioned to match; anything it doesn't show
  // (Year always, plus whichever of Tuning/Path/Score each version
  // omits) is just set invisible — there's nothing in the reference to
  // mimic for those. Two structural things Marquee can't reproduce
  // exactly, true in all four: RockSniffer renders one solid card with
  // its OWN background; Marquee gives every element its own independent
  // background chip instead, so these approximate that by giving every
  // element the same opaque chip color and butting them edge-to-edge —
  // close, not pixel-identical. And RockSniffer's stat rows (Notes,
  // Multiplier, Streak, etc. in v3/v3.1) have no Marquee equivalent at
  // all, so only the one stat that DOES map (Score, i.e. live accuracy)
  // is included. current_song_v3.1_LaS is visually identical to v3 (same
  // CSS) minus its Score stat row (a Learn-a-Song-mode variant with no
  // live score to show) — not different enough to earn its own preset,
  // so only v1 through v4 are here. Plain "Rocksniffer" is v4 (the
  // highest-numbered, so the actual current default); v1-v3 get their
  // own version-suffixed entries.
  // v1 (addons/current_song/style.css): a two-tone card — a dark
  // blue-grey header strip (rgb(40,56,72)) above a lighter, semi-
  // transparent blue-grey body (rgba(85,98,111,0.84)), Arial, 7-8px
  // rounded corners. Its header holds a Rocksmith-pick icon + "CURRENT
  // SONG" label (pure chrome, no Marquee equivalent) alongside a live
  // accuracy percentage — that's Score, positioned up in that header
  // band. Album art floats top-right (23% of the card width); the
  // song/artist/album text sits to its left; a full-width progress bar
  // in the same dark header color runs along the bottom. No tuning,
  // path/arrangement, or year shown anywhere. vw-based in the original
  // (scales with browser width) — converted here at a representative
  // 600px-wide card, the closest fixed-pixel reading of its proportions.
  const rocksnifferV1DefaultLayout = {
    nowplaying: { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Now Playing', rollGroup: null, rollSlot: 1 },
    tuning:
     { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Tuning', rollGroup: null, rollSlot: 1 },
    year:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Year', rollGroup: null, rollSlot: 1 },
    path:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Path', rollGroup: null, rollSlot: 1 },
    score:
      { x: 70,
                  y: 0.8695652173913043, width: 170, height: 26,
  fontSize: 18, visible: true, name: 'Score', rollGroup: null, rollSlot: 1 },
    info:
       { x: 2,
                   y: 19.130434782608695, width: 420, height: 110, fontSize: 22, visible: true, name: 'Song Title & Artist', rollGroup: null, rollSlot: 1 },
    progress:
   { x: 2,
                   y: 82.6086956521739,
   width: 576, height: 30,
  fontSize: 16, visible: true, name: 'Song Time', rollGroup: null, rollSlot: 1 },
    album:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Album', rollGroup: null, rollSlot: 1 },
    art:
        { x: 76,
                  y: 19.130434782608695, scale: 1.5714285714285714, visible: true, name: 'Album Art' },
  };
  const rocksnifferV1DefaultVisuals = {
    accent: '#283848',
    accentRgb: '40 56 72',
    chipColor: '#55626f',
    chipRgb: '85 98 111',
    chipAlpha: 0.84,
    borderWidth: 0,
    bold: false,
    italic: false,
    underline: false,
    font: 'Arial',
    stageWidth: 600,
    stageHeight: 230,
    canvasBgColor: '#000000',
    canvasBgRgb: '0 0 0',
    canvasBgAlpha: 0,
    elementHeadSize: 10,
    elementTextSize: 16,
    edgeRounding: 8,
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
