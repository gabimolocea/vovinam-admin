import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';
import Seo from '../components/Seo';

export default function AboutPage() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.about.list();
        if (isMounted) setSections(response.data ?? []);
      } catch {
        if (isMounted) setError('Nu am putut încărca informațiile despre federație.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title="Despre noi"
        description="Despre Federația Română de Vovinam Việt Võ Đạo: istorie, misiune și structura federației."
        path="/despre"
      />
      <h1 className="font-display text-3xl font-semibold">Despre noi</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : sections.length === 0 ? (
        <EmptyState title="Conținut indisponibil" message="Informațiile despre federație vor fi publicate în curând." />
      ) : (
        sections.map((section) => (
          <Card key={section.section_title}>
            <CardHeader>
              <CardTitle>{section.section_title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              {section.image && (
                <img src={section.image} alt={section.image_alt || section.section_title} className="h-40 w-full rounded-lg object-cover sm:w-56" />
              )}
              <div className="prose-content max-w-none" dangerouslySetInnerHTML={{ __html: section.content }} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
