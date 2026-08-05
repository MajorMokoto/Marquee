  // Small's own hand-tuned default (a compact 300x150 layout — Now
  // Playing/Tuning/Year/Path all toggled off, just art/title/score/time)
  // — same {id: {...}} shape as defaultLayout above.
  const smallDefaultLayout = {
    nowplaying: { x: 43.13099787785457, y: 0,
                  width: 101.0521240234375, height: 20, fontSize: 16, visible: false, name: 'Now Playing' },
    tuning:
     { x: 76.81248728434244, y: 0,
                  width: 65.75518798828125, height: 45, fontSize: 16, visible: false, name: 'Tuning' },
    year:
       { x: 55.30208333333333, y: 0,
                  width: 47.833343505859375, height: 45, fontSize: 16, visible: false, name: 'Year' },
    path:
       { x: 55.305488292987526, y: 29.703128814697266, width: 89.13021850585938, height: 45, fontSize: 16, visible: false, name: 'Path' },
    score:
      { x: 31,
                 y: 0,
                  width: 207,
               height: 57, fontSize: 16, visible: true,
  name: 'Score' },
    album:
       { x: 0, y: 0, width: 100, height: 24, fontSize: 16, visible: false, name: 'Album' },
    info:
       { x: 0,
                  y: 61.333333333333336, width: 300,
               height: 58.001312255859375, fontSize: 20, visible: true, name: 'Song Title & Artist' },
    progress:
   { x: 30.998260498046875, y: 37.93836212158203,
  width: 207.00518798828125, height: 36.18721008300781, fontSize: 20, visible: true, name: 'Song Time',
     useCustomStyles: true,
     styleOverrides: {
       chipColor: '#000000', chipAlpha: 0, accent: '#ff8200', textColor: '#f3e9d8', bold: false, font: 'Arial Black',
       borderWidth: 1, edgeRounding: 0, elementHeadSize: 6,
       marqueeScroll: false, marqueeScrollSpeed: 10, marqueeEdgeFade: false,
       marqueeSparkle: false, marqueeSparkleSize: 4,
       marqueeBulbs: false, marqueeBulbSize: 1.5, marqueeBulbGap: 5, marqueeBulbSpeedElements: 10,
       marqueeBulbScroll: false, marqueeBulbFlicker: false, marqueeBulbFlickerIntensity: 0,
       marqueeBulbFlickerRandom: false,
       accentRgb: '255 130 0', chipRgb: '0 0 0',
     } },
    art:
        { x: 0,
                  y: 0.0625,
             scale: 1.1071150228055215,
                            visible: true, name: 'Album Art' },
  };
  const smallDefaultVisuals = {
    accent: '#ff8200',
    accentRgb: '255 130 0',
    chipColor: '#000000',
    chipRgb: '0 0 0',
    chipAlpha: 0,
    borderWidth: 1,
    bold: false,
    italic: false,
    underline: false,
    font: 'Arial Black',
    textColor: '#f3e9d8',
    headerTextColor: '#b8a88c',
    stageWidth: 300,
    stageHeight: 150,
    canvasBgColor: '#000000',
    canvasBgRgb: '0 0 0',
    canvasBgAlpha: 1,
    elementHeadSize: 6,
    elementTextSize: 16,
    edgeRounding: 0,
    confettiEnabled: true,
    confettiDuration: 7,
    confettiVolume: 1,
    confettiTriggerAt: 100,
    marqueeScroll: false,
    marqueeScrollSpeed: 10,
    marqueeEdgeFade: true,
    marqueeSparkle: false,
    marqueeSparkleSize: 4,
    marqueeBulbMode: 'off',
    marqueeBulbSize: 1.5,
    marqueeBulbGap: 5,
    marqueeBulbSpeedElements: 10,
    marqueeBulbSpeedLayout: 10,
    marqueeBulbScroll: false,
    marqueeBulbScrollLayout: false,
    marqueeBulbFlicker: false,
    marqueeBulbFlickerIntensity: 0,
    marqueeBulbFlickerRandom: false,
    // Seconds the whole overlay takes to fade to/from invisible on
    // playback start/stop — see render.html's fade handling. Small's own
    // value only (10) — Tall/User keep the original 5 in their own
    // separate xxxDefaultVisuals objects below, untouched.
    fadeSeconds: 10,
    fadeEnabled: true,
  };
