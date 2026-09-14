import Breadcrumbs from './Breadcrumbs';
import Seo from './Seo';

/** Shared hero + breadcrumbs + prose shell for the site's legal pages
 * (Termeni și Condiții, Politica de Confidențialitate, GDPR) - mirrors the
 * light-band hero used on /regulament, just with a longer prose body
 * instead of a document list. */
export default function LegalPageLayout({ title, description, path, updated, children }) {
  return (
    <div className="flex flex-col">
      <Seo title={title} description={description} path={path} />

      <Breadcrumbs items={[{ label: title }]} showCurrent />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">{title}</h1>
          {updated && <p className="mt-2 text-sm text-muted-foreground">Ultima actualizare: {updated}</p>}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:py-14">{children}</div>
    </div>
  );
}

/** One numbered/titled section of prose within a legal page. */
export function LegalSection({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      {title && <h2 className="text-lg font-display font-bold text-[#00334d]">{title}</h2>}
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-brand-red [&_a]:underline [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_strong]:text-[#00334d]">
        {children}
      </div>
    </section>
  );
}
