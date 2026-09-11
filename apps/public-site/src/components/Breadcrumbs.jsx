import { Link } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

/**
 * Global breadcrumb trail for the public site (style lifted from the
 * Clubs page). "Acasă" is always prepended automatically. Pass the full
 * ancestor chain via `items` as [{ label, to }, ...] ending with the
 * current page - the current page itself is NOT rendered (the page's
 * own H1 already says where you are), only the path leading up to it.
 *
 * Always stays on one line: when there are more than two ancestor
 * levels to show (e.g. a detail page nested deep in the nav), they
 * collapse into a single "…" that opens a dropdown of the hidden
 * levels, instead of spelling out the whole chain.
 *
 * `showCurrent` opts a top-level section page (e.g. "Noutăți") into
 * showing itself as the trailing, non-link crumb - matching the Figma
 * design for section landing pages, where "Acasă / Noutăți" acts as a
 * page heading rather than a navigation trail.
 *
 * `overlay` renders the trail in light text on a translucent dark-navy
 * bar (same navy as the site footer) instead of the default light-gray
 * bar, for pages that lay the breadcrumb directly over a hero photo.
 * Unlike the default variant, this bar is `w-full` rather than its own
 * `site-full-bleed` breakout - it's meant to be nested inside a hero
 * section that is already full-bleed, and nesting two breakouts would
 * miscalculate the negative margins (the `calc(50vw)` trick is relative
 * to each element's own containing block, not the true viewport, once
 * nested inside another element's padding).
 */
export default function Breadcrumbs({ items = [], showCurrent = false, overlay = false }) {
  const ancestors = showCurrent ? items : items.slice(0, -1);
  if (ancestors.length === 0) return null;

  const collapse = ancestors.length > 2;
  const collapsedLevels = collapse ? ancestors.slice(0, -1) : [];
  const visibleLevels = collapse ? ancestors.slice(-1) : ancestors;

  const nav = (
    <nav
      className={`flex items-center gap-2 overflow-hidden whitespace-nowrap text-sm uppercase tracking-wide ${
        overlay ? 'font-semibold text-white' : 'text-[#00334d]'
      }`}
      aria-label="Fir de ariadnă"
    >
      <Link to="/" className={`shrink-0 hover:underline ${overlay ? 'text-white/80 hover:text-white' : ''}`}>Acasă</Link>

      {collapse && (
        <>
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${overlay ? 'text-white/60' : ''}`} aria-hidden="true" />
          <details className="relative shrink-0">
            <summary
              className={`flex cursor-pointer list-none items-center rounded px-1 py-0.5 ${overlay ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
              aria-label="Arată nivelurile intermediare"
            >
              <MoreHorizontal className="h-4 w-4" />
            </summary>
            <div className="absolute left-0 top-full z-20 mt-1 flex min-w-[10rem] flex-col gap-1 rounded-md border border-[#dce0e5] bg-white p-2 normal-case tracking-normal shadow-md">
              {collapsedLevels.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded px-2 py-1 text-sm text-[#00334d] hover:bg-[#e9ecef]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </>
      )}

      {visibleLevels.map((item, index) => (
        <span
          key={item.label}
          className={`flex items-center gap-2 ${index === visibleLevels.length - 1 ? 'min-w-0 flex-1' : 'shrink-0'}`}
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${overlay ? 'text-white/60' : ''}`} aria-hidden="true" />
          {item.to ? (
            <Link to={item.to} className={`truncate hover:underline ${overlay ? 'text-white/80 hover:text-white' : ''}`}>{item.label}</Link>
          ) : (
            <span className="truncate">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );

  return (
    <div className={overlay ? 'relative z-10 w-full bg-[#0c223d]/60' : 'site-full-bleed bg-[#e9ecef]'}>
      <div className="mx-auto w-full max-w-7xl px-4 py-3">{nav}</div>
    </div>
  );
}
