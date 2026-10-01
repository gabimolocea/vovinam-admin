/**
 * Întoarcerea, pusă în capul ecranului.
 *
 * Era jos, după butoanele de acțiune, unde se înghesuia printre ele - iar pe
 * ecranele lungi trebuia derulat până la capăt ca s-o găsești. Sus e mereu
 * în același loc, indiferent cât de lung e ce urmează, și nu stă lângă
 * butoane care fac altceva.
 */
export default function BackLink({ onClick, children = 'Înapoi' }) {
  return (
    <button type="button" className="back-link" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </button>
  );
}
