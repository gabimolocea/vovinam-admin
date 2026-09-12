import { useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';

// Official regulation PDFs, viewable or downloadable directly - static files
// (not admin-managed) since they're the federation's own source documents.
const DOCUMENTS = [
  {
    title: 'Reguli pe scurt: Competiții de luptă EVVF 2024',
    description: 'Ghid pentru sportivi, antrenori și arbitri, bazat pe reglementările European Vovinam Việt Võ Đạo Federation (EVVF).',
    file: '/regulament/documente/reguli-lupta-evvf-2024.pdf',
  },
  {
    title: 'WVVF Short Rulebook for Competitions (2025)',
    description: 'Regulamentul oficial, versiune scurtă, al World Vovinam Federation (WVVF).',
    file: '/regulament/documente/wvvf-short-rulebook-2025.pdf',
  },
  {
    title: 'Regulament luptă Light Contact (2024) — Juniori 13-18 ani',
    description: 'Ghid oficial de competiție pentru categoria Light Contact, conform standardelor EVVF.',
    file: '/regulament/documente/regulament-light-contact-2024.pdf',
  },
];

/** /regulament: the federation's official regulation PDFs (viewable and
 * downloadable), plus any additional documents an admin has published under
 * the 'regulament' DocumentPage CMS category. */
export default function RegulamentPage() {
  const [cmsDocuments, setCmsDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    publicContentAPI.documents.list({ category: 'regulament' })
      .then((res) => { if (isMounted) setCmsDocuments(res.data ?? []); })
      .catch(() => {})
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title="Regulament"
        description="Regulamentele oficiale ale competițiilor de luptă Vovinam Việt Võ Đạo - EVVF, WVVF și Light Contact."
        path="/regulament"
      />

      <Breadcrumbs items={[{ label: 'Regulament' }]} showCurrent />

      <h1 className="font-display text-3xl font-semibold text-[#00334d]">Regulament</h1>

      <div className="flex flex-col gap-4">
        {DOCUMENTS.map((doc) => (
          <Card key={doc.file}>
            <CardHeader>
              <CardTitle as="h2" className="text-lg">{doc.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{doc.description}</p>
              <div className="flex shrink-0 gap-2">
                <Button as="a" href={doc.file} target="_blank" rel="noopener noreferrer" variant="outline">
                  <Eye className="h-4 w-4" /> Vizualizează
                </Button>
                <Button as="a" href={doc.file} download>
                  <Download className="h-4 w-4" /> Descarcă
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && cmsDocuments.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-border pt-6">
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
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
        </div>
      )}
    </div>
  );
}
