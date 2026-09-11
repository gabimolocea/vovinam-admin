const PARTNER_LOGOS = ['/partner-1.png', '/partner-2.png', '/partner-3.png', '/partner-4.png', '/partner-5.png'];

/** Partners strip for the homepage, matching Figma node 225:22553: a
 * "Parteneri" heading flanked by gold rule lines, above a row of logos. */
export default function PartnersSection() {
  return (
    <section className="site-full-bleed bg-white py-16">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-16 px-4">
        <div className="flex w-full items-center gap-12">
          <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
          <h2 className="text-fluid-h2 font-display shrink-0 font-bold text-[#00334d]">Parteneri</h2>
          <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 lg:flex-nowrap lg:gap-8">
          {PARTNER_LOGOS.map((src, index) => (
            <div key={src} className="flex h-[120px] w-[213px] shrink-0 items-center justify-center">
              <img src={src} alt={`Partener ${index + 1}`} className="max-h-full max-w-full rounded-2xl object-contain" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
