import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';

/**
 * Renders a category of DocumentPage records ('regulament' or 'documente').
 * Both 'Regulament' and 'Documente' nav items share this single component
 * and backend model - only the `category` filter differs.
 */
export default function DocumentsPage({ category, title }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.documents.list({ category });
        if (isMounted) setDocuments(response.data ?? []);
      } catch {
        if (isMounted) setError('Nu am putut încărca documentele.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [category]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState title="Niciun document disponibil" message="Documentele vor fi publicate în curând." />
      ) : (
        <div className="flex flex-col gap-4">
          {documents.map((doc) => {
            const href = doc.file || doc.external_url;
            return (
              <Card key={doc.slug}>
                <CardHeader>
                  <CardTitle as="h2" className="text-lg">{doc.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {doc.description && (
                    <div className="prose-content max-w-none text-sm" dangerouslySetInnerHTML={{ __html: doc.description }} />
                  )}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Descarcă
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
