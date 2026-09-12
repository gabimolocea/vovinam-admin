import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';
import RegulamentLuptaSection from '../components/RegulamentLuptaSection';

/** /regulament: the "quick rules" illustrated guide (RegulamentLuptaSection)
 * plus any official regulation documents an admin has published under the
 * 'regulament' DocumentPage category (PDFs, etc.) - same data source
 * DocumentsPage uses, so nothing admins already rely on is lost. */
export default function RegulamentPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    publicContentAPI.documents.list({ category: 'regulament' })
      .then((res) => { if (isMounted) setDocuments(res.data ?? []); })
      .catch(() => {})
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <Seo
        title="Regulament"
        description="Regulamentul competițiilor de luptă Vovinam Việt Võ Đạo - ghid vizual pe scurt pentru sportivi, antrenori și arbitri."
        path="/regulament"
      />

      <Breadcrumbs items={[{ label: 'Regulament' }]} showCurrent />

      <RegulamentLuptaSection />

      {!loading && documents.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-border pt-10">
          <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Documente oficiale</h2>
          {documents.map((doc) => {
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
