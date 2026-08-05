// Marquee — "TEST" preset. Not a real look — a blank-slate diagnostic
// preset: every slider at 0, every checkbox unchecked, every color picker
// pure white, no element carries any Customize override. Purpose (per
// request): confirm that flipping everything to its "off" extreme is
// fully reflected in an exported layout JSON, catching settings that
// silently drop out of export because they were never explicitly seeded
// into a preset's defaults (see marqueeScoreColorGradient/
// marqueeBulbScrollClockwise[Layout] — same shape of bug, all three now
// explicitly declared below specifically so this preset actually proves
// the point rather than reproducing the gap itself).
//
// stageWidth/stageHeight/fadeSeconds/confettiDuration/confettiTriggerAt
// are plain number fields, not sliders/checkboxes/colors — left at the
// smallest value each one's own min= attribute allows (never literally 0
// where that would be invalid, e.g. stageWidth's min is 120) rather than
// zeroed outright.
const testDefaultVisuals = {
  accent: '#ffffff',
  accentRgb: '255 255 255',
  chipColor: '#ffffff',
  chipRgb: '255 255 255',
  chipAlpha: 0,
  borderWidth: 0,
  bold: false,
  italic: false,
  underline: false,
  font: 'Arial Black',
  textColor: '#ffffff',
  headerTextColor: '#ffffff',
  stageWidth: 520,
  stageHeight: 200,
  canvasBgColor: '#ffffff',
  canvasBgRgb: '255 255 255',
  canvasBgAlpha: 0,
  elementHeadSize: 0,
  elementTextSize: 0,
  edgeRounding: 0,
  confettiEnabled: false,
  confettiDuration: 1,
  confettiVolume: 0,
  confettiTriggerAt: 0.1,
  marqueeScroll: false,
  marqueeScrollSpeed: 0,
  marqueeEdgeFade: false,
  marqueeSparkle: false,
  marqueeSparkleSize: 0,
  marqueeBulbMode: 'off',
  marqueeBulbSize: 0,
  marqueeBulbGap: 0,
  marqueeBulbSpeedElements: 0,
  marqueeBulbSpeedLayout: 0,
  marqueeBulbScroll: false,
  marqueeBulbScrollClockwise: false,
  marqueeBulbScrollLayout: false,
  marqueeBulbScrollClockwiseLayout: false,
  marqueeBulbFlicker: false,
  marqueeBulbFlickerIntensity: 0,
  marqueeBulbFlickerRandom: false,
  marqueeScoreColorGradient: false,
  fadeSeconds: 0,
  fadeEnabled: false,
};
// Same 10 elements/positions as Standard (see standard.js) so TEST is a
// usable layout, not an empty canvas — but with useCustomStyles/
// styleOverrides omitted entirely on every one of them (the "never
// touched Customize" shape, same as Standard's own album/info/art), so
// nothing here masks whether a Global setting actually made it into the
// export.
const testDefaultLayout = {
  'roll-1': {
    x: 33.46153846153846, y: 28.999999999999996,
    width: 202.7109375, height: 46.40625, fontSize: 20, visible: true,
    isRoll: true, name: 'Marquee Roll 1',
  },
  nowplaying: {
    x: 33.46103374774639, y: 0,
    width: 202.72132873535156, height: 57.99479675292969,
    fontSize: 16, visible: true, name: 'Now Playing',
  },
  tuning: {
    x: 33.46153846153846, y: 29.5013033747673, width: 78.46353149414062, height: 45.00000762939453, fontSize: 16, visible: true, name: 'Tuning',
    rollGroup: 'roll-1', rollSlot: 1,
  },
  year: {
    x: 48.55068280146672, y: 29.5013033747673, width: 47.833343505859375, height: 45, fontSize: 16, visible: true, name: 'Year',
    rollGroup: 'roll-1', rollSlot: 1,
  },
  path: {
    x: 57.74939977205717, y: 29.5013033747673, width: 76.41535949707031, height: 45, fontSize: 16, visible: true, name: 'Path',
    rollGroup: 'roll-1', rollSlot: 1,
  },
  score: {
    x: 72.44491577148438, y: 0,
    width: 143.2864227294922, height: 104.40625, fontSize: 20, visible: true, name: 'Score',
  },
  album: {
    x: 40.38461538461539, y: 38.75, width: 100, height: 45, fontSize: 16, visible: true, name: 'Album',
    rollGroup: 'roll-1', rollSlot: 1,
  },
  info: {
    x: 33.46153919513409, y: 52.00130081176758,
    width: 346, height: 70, fontSize: 20, visible: true, name: 'Song Title & Artist',
  },
  progress: {
    x: 0, y: 87,
    width: 519.9947967529297, height: 26,
    fontSize: 20, visible: true, name: 'Song Time',
  },
  art: {
    x: 0, y: 0,
    scale: 2.0714286194698923, visible: true, name: 'Album Art',
  },
};
