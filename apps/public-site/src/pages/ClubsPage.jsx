import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';

// Figma has each club card colored + watermarked with its own bespoke
// illustration — we don't have per-club art, so cards cycle through a
// small brand-consistent palette instead, and the watermark reuses the
// club's own logo (enlarged, faded) rather than fabricated decoration.
const CARD_COLORS = ['#172642', '#85141a', '#0a4c75'];

export default function ClubsPage() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.clubs.list();
        if (isMounted) setClubs(response.data ?? []);
      } catch {
        if (isMounted) setError('Nu am putut încărca lista cluburilor.');
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
        title="Cluburi afiliate"
        description="Lista cluburilor sportive afiliate Federației Române de Vovinam Việt Võ Đạo, cu antrenori și localizare."
        path="/cluburi"
      />

      <Breadcrumbs items={[{ label: 'Federație', to: '/despre' }, { label: 'Cluburi' }]} />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Cluburi afiliate</h1>
        </div>
      </div>

      <div className="mx-[calc(50%-50vw)] pt-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : clubs.length === 0 ? (
            <EmptyState title="Niciun club afișat momentan" message="Lista cluburilor afiliate va fi publicată în curând." />
          ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {clubs.map((club, i) => (
              <div
                key={club.id ?? club.name}
                className="relative flex items-center gap-4 overflow-hidden rounded-lg p-4 sm:gap-6 sm:p-6"
                style={{ backgroundColor: CARD_COLORS[i % CARD_COLORS.length] }}
              >
                {club.logo && (
                  <img
                    src={club.logo}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rotate-12 object-contain opacity-15"
                  />
                )}
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-[120px] sm:w-[120px]">
                  {club.logo ? (
                    <img src={club.logo} alt={club.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-lg font-display font-bold text-white sm:text-xl">
                      {club.name?.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="relative flex flex-col items-start gap-3">
                  <p className="text-base font-display font-bold text-white sm:text-lg">{club.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {club.slug && (
                      <Link
                        to={`/cluburi/${club.slug}`}
                        className="rounded-lg bg-white px-3 py-2 text-xs font-medium uppercase text-[#0a4c75] transition hover:bg-white/90 sm:px-4 sm:py-3 sm:text-sm"
                      >
                        Profil
                      </Link>
                    )}
                    {club.website && (
                      <a
                        href={club.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-medium uppercase text-[#0a4c75] transition hover:bg-white/90 sm:px-4 sm:py-3 sm:text-sm"
                      >
                        Website
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
