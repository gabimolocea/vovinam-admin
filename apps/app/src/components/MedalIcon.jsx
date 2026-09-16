import { useId } from 'react';

const TIER_COLORS = {
  gold: { light: '#fde68a', fill: '#f0c33c', shade: '#a97e0b', rim: '#c99c0e' },
  silver: { light: '#f1f3f5', fill: '#b7bec7', shade: '#767f8c', rim: '#9aa0a6' },
  bronze: { light: '#e3a469', fill: '#c17a3f', shade: '#7a4718', rim: '#a3651f' },
};

/** A medal icon (ribbon band + embossed metallic disc) - ported verbatim
 * from apps/public-site/src/components/MedalIcon.jsx. `ribbonColors` is
 * 1-3 hex colors painted as equal bands across the ribbon; `count` is set
 * into the medal face itself. */
export default function MedalIcon({ tier, ribbonColors, count, className = 'h-9 w-7' }) {
  const { light, fill, shade, rim } = TIER_COLORS[tier];
  const bandWidth = 22 / ribbonColors.length;
  const uid = useId();
  const discGradientId = `medal-disc-${uid}`;
  const ribbonGradientId = `medal-ribbon-${uid}`;

  return (
    <svg viewBox="0 0 32 40" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={discGradientId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={fill} />
          <stop offset="100%" stopColor={shade} />
        </radialGradient>
        <linearGradient id={ribbonGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0.18" />
          <stop offset="15%" stopColor="#000" stopOpacity="0" />
          <stop offset="85%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      <path d="M5 0 L27 0 L27 17 L16 12 L5 17 Z" fill="#00000022" transform="translate(0.6 0.6)" />
      {ribbonColors.map((color, i) => (
        <rect key={i} x={5 + i * bandWidth} y="0" width={bandWidth} height="17" fill={color} />
      ))}
      <path d="M5 0 L27 0 L27 17 L16 12 L5 17 Z" fill={`url(#${ribbonGradientId})`} />

      <circle cx="16" cy="26.5" r="12.5" fill="#000" opacity="0.2" />
      <circle cx="16" cy="26" r="12" fill={rim} />
      <circle cx="16" cy="26" r="10.5" fill={`url(#${discGradientId})`} stroke={shade} strokeWidth="0.75" />
      <circle cx="16" cy="26" r="8.4" fill="none" stroke={shade} strokeOpacity="0.55" strokeWidth="0.6" />
      <ellipse cx="12.3" cy="21.8" rx="3.6" ry="1.7" fill="#fff" opacity="0.35" transform="rotate(-35 12.3 21.8)" />

      {count != null && (
        <text
          x="16"
          y="30.5"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="#00334d"
          fontFamily="'Roboto Condensed', sans-serif"
        >
          {count}
        </text>
      )}
    </svg>
  );
}
