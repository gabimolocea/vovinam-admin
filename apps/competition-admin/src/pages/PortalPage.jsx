import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card } from '../components/ui';

const APPS = [
  {
    id: 'competition-list',
    name: 'Competition Admin',
    description: 'Administrare competiții, categorii, arbitri și rezultate.',
    mode: 'internal',
    to: '/competitions',
  },
  {
    id: 'coach-dashboard',
    name: 'Coach Dashboard',
    description: 'Panou antrenori pentru gestionare lot și înscrieri.',
    mode: 'external',
    port: 5175,
  },
  {
    id: 'referee-scoring',
    name: 'Referee Scoring',
    description: 'Introducere punctaje și validare arbitraj.',
    mode: 'external',
    port: 5176,
  },
  {
    id: 'public-display',
    name: 'Public Display',
    description: 'Afișaj public pentru meciuri, rezultate și program.',
    mode: 'external',
    port: 5177,
  },
  {
    id: 'public-registry',
    name: 'Public Registry',
    description: 'Registru public sportivi, profiluri și rezultate validate.',
    mode: 'external',
    port: 5178,
  },
];

export default function PortalPage() {
  const navigate = useNavigate();

  const apps = useMemo(() => {
    const host = window.location.hostname || 'localhost';
    const protocol = window.location.protocol || 'http:';
    return APPS.map((app) => (
      app.mode === 'external'
        ? { ...app, href: `${protocol}//${host}:${app.port}` }
        : app
    ));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Card className="p-5 sm:p-6">
        <h1 className="font-display text-lg font-bold uppercase tracking-wide text-foreground sm:text-2xl">Portal FRVV</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Alege aplicația dorită pentru a continua fluxul de lucru.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((app) => {
          const content = (
            <>
              <Badge variant="secondary">
                {app.mode === 'internal' ? 'Aplicație internă' : `Port ${app.port}`}
              </Badge>
              <h2 className="mt-3 text-sm font-semibold text-foreground">{app.name}</h2>
              <p className="mt-2 text-xs text-muted-foreground">{app.description}</p>
              {app.mode === 'external' && (
                <p className="mt-4 text-[11px] font-medium text-primary">{app.href}</p>
              )}
            </>
          );

          if (app.mode === 'internal') {
            return (
              <Card
                key={app.id}
                as="button"
                type="button"
                onClick={() => navigate(app.to)}
                className="w-full p-4 text-left transition hover:bg-accent"
              >
                {content}
              </Card>
            );
          }

          return (
            <Card
              key={app.id}
              as="a"
              href={app.href}
              target="_blank"
              rel="noreferrer"
              className="block p-4 transition hover:bg-accent"
            >
              {content}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
