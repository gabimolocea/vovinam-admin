import { parseBeltGrade } from '../lib/belts';

const BAR_WIDTH = 270;
const BAR_HEIGHT = 22;
const STRIPE_WIDTH = 14;
const STRIPE_GAP = 8;
const STRIPE_RIGHT_MARGIN = 10;

const NORMAL_STRIPE_COUNT = 3;
const STRIPE_ZONE_WIDTH = NORMAL_STRIPE_COUNT * STRIPE_WIDTH + (NORMAL_STRIPE_COUNT - 1) * STRIPE_GAP;
const GAP_RATIO = STRIPE_GAP / STRIPE_WIDTH;

const LOGO_SIZE = 18;
const STRIPE_ZONE_MAX_WIDTH = STRIPE_RIGHT_MARGIN + STRIPE_ZONE_WIDTH;
const LOGO_X = BAR_WIDTH - STRIPE_ZONE_MAX_WIDTH - 8 - LOGO_SIZE;
const LOGO_Y = (BAR_HEIGHT - LOGO_SIZE) / 2;

function stripeLayout(count) {
  if (count <= NORMAL_STRIPE_COUNT) return { width: STRIPE_WIDTH, gap: STRIPE_GAP };
  const width = STRIPE_ZONE_WIDTH / (count + (count - 1) * GAP_RATIO);
  return { width, gap: width * GAP_RATIO };
}

/** Renders a grade as a small belt bar - ported verbatim from
 * apps/public-site/src/components/BeltBadge.jsx so the coach dashboard
 * shows the same belt graphic instead of a plain text badge. */
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
