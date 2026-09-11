import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
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
    <div className="flex flex-col">
      <Seo
        title="Despre noi"
        description="Despre Federația Română de Vovinam Việt Võ Đạo: misiune, viziune și structura federației."
        path="/despre"
      />

      <div className="site-full-bleed relative flex flex-col items-center overflow-hidden pb-16 sm:pb-20">
        <img src="/events-section-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(12,33,61,0.6) 0%, rgba(12,33,61,0.68) 100%)' }}
        />
        <Breadcrumbs items={[{ label: 'Despre' }]} showCurrent overlay />
        <div className="relative mx-auto mt-8 w-full max-w-7xl px-4 sm:mt-10">
          <h1 className="text-fluid-display font-display font-bold text-white">Despre noi</h1>
          <p className="mt-2 max-w-2xl text-white/80">
            Federația Română de Vovinam Việt Võ Đạo
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:py-16">
        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="flex flex-col gap-6">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : sections.length === 0 ? (
          <EmptyState title="Conținut indisponibil" message="Informațiile despre federație vor fi publicate în curând." />
        ) : (
          sections.map((section, index) => (
            <div
              key={section.section_title}
              className={
                index === 0
                  ? 'flex flex-col gap-4 rounded-2xl border-l-4 border-[#edb654] bg-[#e9ecef] p-6 sm:gap-6 sm:p-10'
                  : 'flex flex-col gap-4 rounded-2xl border border-[#dce0e5] bg-white p-6 sm:gap-6 sm:p-8'
              }
            >
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <h2 className="text-fluid-h2 font-display min-w-0 font-bold text-[#00334d]">{section.section_title}</h2>
                <span className="hidden h-px flex-1 bg-[#edb654] sm:block" aria-hidden="true" />
              </div>

              <div className={section.image ? 'flex flex-col gap-6 sm:flex-row' : ''}>
                {section.image && (
                  <img
                    src={section.image}
                    alt={section.image_alt || section.section_title}
                    className="h-48 w-full shrink-0 rounded-xl object-cover sm:h-auto sm:w-64"
                  />
                )}
                <div
                  className="prose-content ck-content max-w-none text-[#00334d]"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
