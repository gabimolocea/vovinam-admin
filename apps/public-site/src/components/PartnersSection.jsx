const PARTNER_LOGOS = ['/partner-1.png', '/partner-2.png', '/partner-3.png', '/partner-4.png', '/partner-5.png'];

/** Partners strip for the homepage, matching Figma node 225:22553: a
 * "Parteneri" heading flanked by gold rule lines, above a row of logos. */
export default function PartnersSection() {
  return (
    <section className="site-full-bleed bg-white pb-12 pt-12 sm:pb-16 sm:pt-16">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-16 px-4">
        <div className="flex w-full items-center gap-12">
          <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
          <h2 className="text-fluid-h2 font-display shrink-0 font-bold text-[#00334d]">Parteneri</h2>
          <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
        </div>
        {/* Mobile/tablet: horizontally-scrollable snap carousel (swipe
            through logos one at a time) instead of wrapping them onto
            several stacked rows. Desktop: single centered row, no scroll. */}
        <div className="site-scrollbar-hide flex w-full snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-1 lg:flex-nowrap lg:justify-center lg:gap-8 lg:overflow-visible lg:px-0 lg:pb-0">
          {PARTNER_LOGOS.map((src, index) => (
            <div key={src} className="flex h-16 w-28 shrink-0 snap-center items-center justify-center sm:h-20 sm:w-36">
              <img src={src} alt={`Partener ${index + 1}`} className="max-h-full max-w-full rounded-2xl object-contain" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
