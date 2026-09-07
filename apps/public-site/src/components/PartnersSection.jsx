const PARTNERS = [
  { name: 'Ministerul Sportului', initials: 'MS' },
  { name: 'Comitetul Olimpic și Sportiv Român', initials: 'COSR' },
  { name: 'Federația Europeană de Vovinam Việt Võ Đạo', initials: 'EVVF' },
  { name: 'Federația Mondială de Vovinam Việt Võ Đạo', initials: 'WVVF' },
];

/** Static partners strip for the homepage. No CMS-managed partner/logo
 * model exists yet, so organizations are listed as monogram badges rather
 * than placeholder logo boxes; swap in real logos here once available. */
export default function PartnersSection() {
  return (
    <section className="site-band relative left-1/2 right-1/2 -mx-[50vw] w-screen py-10">
      <div className="mx-auto w-full max-w-6xl px-4">
        <h2 className="font-display text-center text-lg font-semibold uppercase tracking-wide">Parteneri</h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
          {PARTNERS.map((partner) => (
            <div key={partner.initials} className="flex flex-col items-center gap-2" title={partner.name}>
              <span className="site-partner-badge flex h-16 w-16 items-center justify-center rounded-full text-sm font-bold">
                {partner.initials}
              </span>
              <span className="max-w-[9rem] text-center text-xs text-muted-foreground">{partner.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
