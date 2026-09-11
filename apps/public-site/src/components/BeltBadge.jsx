import { parseBeltGrade } from '../lib/belts';

const BAR_WIDTH = 270;
const BAR_HEIGHT = 22;
const STRIPE_WIDTH = 14;
const STRIPE_GAP = 8;
const STRIPE_RIGHT_MARGIN = 10;

// Stripes stay full-size up to this count (matches the original yellow/red
// design, 0-3 dang past the belt's base); beyond it they shrink to fit -
// same total footprint, just thinner bars and gaps - so grades with up to
// 8 cấp still draw every stripe instead of the count getting capped.
const NORMAL_STRIPE_COUNT = 3;
const STRIPE_ZONE_WIDTH = NORMAL_STRIPE_COUNT * STRIPE_WIDTH + (NORMAL_STRIPE_COUNT - 1) * STRIPE_GAP;
const GAP_RATIO = STRIPE_GAP / STRIPE_WIDTH;

// The round Vovinam seal sits just left of the stripe zone, at a fixed
// position regardless of the actual stripe count, so it doesn't shift
// around between grades.
const LOGO_SIZE = 18;
const STRIPE_ZONE_MAX_WIDTH = STRIPE_RIGHT_MARGIN + STRIPE_ZONE_WIDTH;
const LOGO_X = BAR_WIDTH - STRIPE_ZONE_MAX_WIDTH - 8 - LOGO_SIZE;
const LOGO_Y = (BAR_HEIGHT - LOGO_SIZE) / 2;

function stripeLayout(count) {
  if (count <= NORMAL_STRIPE_COUNT) return { width: STRIPE_WIDTH, gap: STRIPE_GAP };
  const width = STRIPE_ZONE_WIDTH / (count + (count - 1) * GAP_RATIO);
  return { width, gap: width * GAP_RATIO };
}

/** Renders a grade (e.g. "CENTURĂ ROŞIE, 7 DANG") as a small belt bar -
 * a square-cornered belt-colored strip labelled with the abbreviated
 * grade (e.g. "C. Roşie, 7 Dang") and the dang/cấp stripes running
 * full-height on the right end, shrinking once there are more than fit
 * at full size - instead of spelling the grade out in plain text. Covers
 * every grade the backend has, including blue belts. */
export default function BeltBadge({ grade }) {
  const belt = parseBeltGrade(grade);
  if (!belt) return null;

  const { fill, border, text, stripeFill, stripes, label } = belt;
  const { width: stripeWidth, gap: stripeGap } = stripeLayout(stripes);

  return (
    <svg viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`} className="h-auto w-full max-w-[270px]" role="img" aria-label={grade} title={grade}>
      <title>{grade}</title>
      <rect x="0" y="0" width={BAR_WIDTH} height={BAR_HEIGHT} fill={fill} stroke={border} strokeWidth="2.5" />
      <text
        x="10"
        y={BAR_HEIGHT / 2 + 5}
        fontSize="15"
        fontWeight="800"
        fill={text}
        fontFamily="'Roboto Condensed', sans-serif"
      >
        {label}
      </text>
      <image href="/vovinam-seal.png" x={LOGO_X} y={LOGO_Y} width={LOGO_SIZE} height={LOGO_SIZE} />
      {Array.from({ length: stripes }).map((_, i) => {
        const xRight = BAR_WIDTH - STRIPE_RIGHT_MARGIN - i * (stripeWidth + stripeGap);
        return (
          <rect
            key={i}
            x={xRight - stripeWidth}
            y="0"
            width={stripeWidth}
            height={BAR_HEIGHT}
            fill={stripeFill}
            stroke={border}
            strokeWidth={stripeWidth < 8 ? 1 : 1.5}
          />
        );
      })}
    </svg>
  );
}
