import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';

// Official federation forms, downloadable directly - static files (not
// admin-managed) since they're fixed legal/consent templates. Word files
// (.doc/.docx) have no reliable in-browser preview, so these only offer a
// download action (unlike the PDFs on /regulament, which also offer "Vizualizează").
const DOCUMENTS = [
  {
    title: 'Informare privind prelucrarea datelor cu caracter personal (GDPR)',
    description: 'Informare GDPR pentru sportivi, antrenori și membrii Federației Române de Vovinam Việt Võ Đạo.',
    file: '/documente/acord-gdpr.docx',
  },
  {
    title: 'Consimțământ prelucrare date — sportiv minor',
    description: 'Formular de consimțământ pentru părintele/reprezentantul legal al unui sportiv minor.',
    file: '/documente/consimtamant-sportiv-minor.doc',
  },
  {
    title: 'Consimțământ prelucrare date — sportiv major',
    description: 'Formular de consimțământ pentru sportivii majori.',
    file: '/documente/consimtamant-sportiv-major.doc',
  },
];

/** /documente: the federation's official downloadable forms/templates, plus
 * any additional documents an admin has published under the 'documente'
 * DocumentPage CMS category. */
export default function DocumentsPage() {
  const [cmsDocuments, setCmsDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    publicContentAPI.documents.list({ category: 'documente' })
      .then((res) => { if (isMounted) setCmsDocuments(res.data ?? []); })
      .catch(() => {})
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="flex flex-col">
      <Seo
        title="Documente"
        description="Documente și formulare oficiale ale Federației Române de Vovinam Việt Võ Đạo."
        path="/documente"
      />

      <Breadcrumbs items={[{ label: 'Documente' }]} showCurrent />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Documente</h1>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-8">
        {DOCUMENTS.map((doc) => (
          <Card key={doc.file}>
            <CardHeader>
              <CardTitle as="h2" className="text-lg">{doc.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{doc.description}</p>
              <Button as="a" href={doc.file} download className="shrink-0">
                <Download className="h-4 w-4" /> Descarcă
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && cmsDocuments.length > 0 && (
        <section className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
          <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Alte documente</h2>
          {cmsDocuments.map((doc) => {
            const href = doc.file || doc.external_url;
            return (
              <Card key={doc.slug}>
                <CardHeader>
                  <CardTitle as="h3" className="text-lg">{doc.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {doc.description && (
                    <div className="prose-content max-w-none text-sm" dangerouslySetInnerHTML={{ __html: doc.description }} />
                  )}
                  {href && (
                    <Button as="a" href={href} target="_blank" rel="noopener noreferrer" className="w-fit">
                      Descarcă
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {loading && (
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-24" />
        </div>
      )}
    </div>
  );
}
