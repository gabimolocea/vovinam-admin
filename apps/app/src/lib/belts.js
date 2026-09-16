// Maps a Vovinam grade name (e.g. "CENTURĂ ROŞIE, 7 DANG") to belt colors
// and a stripe count, for rendering as a belt graphic instead of text.
// Covers every grade the backend actually has: yellow and red belts count
// up in "dang", while blue belts count up in "cấp" - and blue has two
// separate cấp tracks (red-notch and yellow-notch) with their own stripe
// color, distinct from the belt's own base color.
// Ported verbatim from apps/public-site/src/lib/belts.js.
const BELT_STYLES = {
  yellow: { fill: '#f5c518', shade: '#c99c0e', text: '#00334d', border: 'none' },
  red: { fill: '#da3b26', shade: '#9c2415', text: '#ffffff', border: 'none' },
  blue: { fill: '#1d4ed8', shade: '#152f87', text: '#ffffff', border: 'none' },
};

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

const MAX_VISIBLE_STRIPES = 8;

const DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g');

function stripDiacritics(value) {
  return value.normalize('NFD').replace(DIACRITIC_MARKS, '');
}

export function parseBeltGrade(gradeName) {
  if (!gradeName) return null;
  const plain = stripDiacritics(gradeName).toUpperCase();

  if (plain.includes('ALBASTR')) {
    const stripeIsYellow = plain.includes('GALBEN');
    const stripeIsRed = plain.includes('ROS');
    const stripeFill = stripeIsYellow ? STRIPE_COLOR_YELLOW : stripeIsRed ? STRIPE_COLOR_RED : STRIPE_COLOR_WHITE;
    const match = plain.match(/(\d+)\s*C[AĂ]P/);
    const cap = match ? parseInt(match[1], 10) : 0;
    const stripes = Math.max(0, Math.min(MAX_VISIBLE_STRIPES, cap));
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
