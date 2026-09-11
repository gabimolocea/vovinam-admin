const TIER_COLORS = {
  gold: { fill: '#f5c518', shade: '#c99c0e' },
  silver: { fill: '#c7ccd1', shade: '#9aa0a6' },
  bronze: { fill: '#cd7f32', shade: '#a3651f' },
};

/** A trophy cup icon (handles + bowl + stem + base), matching MedalIcon's
 * visual language - `tier` picks the cup color for a club's 1st/2nd/3rd
 * place finish in a competition's club ranking (see trophy_counts_for_club
 * on the backend), the same way MedalIcon's tier picks a medal color.
 * `count`, when given, is set into the cup itself. */
export default function TrophyIcon({ tier = 'gold', count, className = 'h-10 w-9' }) {
  const { fill, shade } = TIER_COLORS[tier];

  return (
    <svg viewBox="0 0 40 42" className={className} aria-hidden="true">
      <path d="M10 8H4a5 5 0 0 0 6 8" fill="none" stroke={shade} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 8h6a5 5 0 0 1-6 8" fill="none" stroke={shade} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 6h20v9a10 10 0 0 1-20 0V6z" fill={fill} stroke={shade} strokeWidth="2" />
      <rect x="18" y="25" width="4" height="7" fill={fill} stroke={shade} strokeWidth="1.5" />
      <rect x="12" y="32" width="16" height="4" rx="1.5" fill={fill} stroke={shade} strokeWidth="2" />
      {count != null && (
        <text
          x="20"
          y="17"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#00334d"
          fontFamily="'Roboto Condensed', sans-serif"
        >
          {count}
        </text>
      )}
    </svg>
  );
}
