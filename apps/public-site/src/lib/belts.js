// Maps a Vovinam grade name (e.g. "CENTURĂ ROŞIE, 7 DANG") to belt colors
// and a stripe count, for rendering as a belt graphic instead of text.
// Covers every grade the backend actually has: yellow and red belts count
// up in "dang", while blue belts count up in "cấp" - and blue has two
// separate cấp tracks (red-notch and yellow-notch) with their own stripe
// color, distinct from the belt's own base color.
const BELT_STYLES = {
  yellow: { fill: '#f5c518', shade: '#c99c0e', text: '#00334d', border: 'none' },
  red: { fill: '#da3b26', shade: '#9c2415', text: '#ffffff', border: 'none' },
  blue: { fill: '#1d4ed8', shade: '#152f87', text: '#ffffff', border: 'none' },
};

// Dang/cấp stripes are always a *different* color than the belt they sit
// on, so they actually stand out against the base fill:
// - yellow belt's dang stripes are red
// - red belt's dang stripes are white
// - blue belt's cấp stripes are red or yellow, matching the "roşu"/"galben"
//   track named in the grade itself (handled separately below, not by
//   belt color)
const STRIPE_COLOR_RED = '#da3b26';
const STRIPE_COLOR_YELLOW = '#f5c518';
const STRIPE_COLOR_WHITE = '#ffffff';

const DANG_STRIPE_FILL = {
  yellow: STRIPE_COLOR_RED,
  red: STRIPE_COLOR_WHITE,
};

const COLOR_BASE_DANG = {
  yellow: 0,
  red: 4,
};

const COLOR_LABELS = {
  yellow: 'C. Galbenă',
  red: 'C. Roşie',
  blue: 'C. Albastră',
};

// Highest stripe count any real grade actually reaches (blue belt's 8-cấp
// track) - BeltBadge draws every stripe up to this, shrinking their width
// once there are more than fit at full size, rather than dropping any.
const MAX_VISIBLE_STRIPES = 8;

const DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g');

function stripDiacritics(value) {
  return value.normalize('NFD').replace(DIACRITIC_MARKS, '');
}

export function parseBeltGrade(gradeName) {
  if (!gradeName) return null;
  const plain = stripDiacritics(gradeName).toUpperCase();

  // Check blue before yellow/red: a blue belt's red-cấp grades (e.g.
  // "CENTURA ALBASTRĂ, 3 CẦP ROŞII") contain "ROSI" too, so red must not
  // win that match.
  if (plain.includes('ALBASTR')) {
    const stripeIsYellow = plain.includes('GALBEN');
    const stripeIsRed = plain.includes('ROS');
    const stripeFill = stripeIsYellow ? STRIPE_COLOR_YELLOW : stripeIsRed ? STRIPE_COLOR_RED : STRIPE_COLOR_WHITE;
    const match = plain.match(/(\d+)\s*C[AĂ]P/);
    const cap = match ? parseInt(match[1], 10) : 0;
    const stripes = Math.max(0, Math.min(MAX_VISIBLE_STRIPES, cap));
    // The stripe color itself already conveys the roşu/galben track (same
    // as yellow/red belts never spelling out their stripe color in text),
    // so the label stays short enough to never crowd the seal logo.
    const label = match ? `${COLOR_LABELS.blue}, ${cap} Cấp` : COLOR_LABELS.blue;
    return { ...BELT_STYLES.blue, stripeFill, stripes, label };
  }

  let color = null;
  if (plain.includes('GALBEN')) color = 'yellow';
  else if (plain.includes('ROSIE') || plain.includes('ROSU')) color = 'red';
  if (!color) return null;

  const match = plain.match(/(\d+)\s*DANG/);
  const dang = match ? parseInt(match[1], 10) : 0;
  const stripes = Math.max(0, Math.min(MAX_VISIBLE_STRIPES, dang - COLOR_BASE_DANG[color]));
  const label = match ? `${COLOR_LABELS[color]}, ${dang} Dang` : COLOR_LABELS[color];

  return { ...BELT_STYLES[color], stripeFill: DANG_STRIPE_FILL[color], stripes, label };
}
