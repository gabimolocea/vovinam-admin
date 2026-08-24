import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const APPS = [
  {
    id: 'competition-list',
    name: 'Competition Admin',
    description: 'Administrare competiții, categorii, arbitri și rezultate.',
    mode: 'internal',
    to: '/competitions',
    accent: 'bg-yellow-300',
  },
  {
    id: 'athlete-enrollment',
    name: 'Athlete Enrollment',
    description: 'Înscriere sportivi în competiții.',
    mode: 'external',
    port: 5174,
    accent: 'bg-blue-200',
  },
  {
    id: 'coach-dashboard',
    name: 'Coach Dashboard',
    description: 'Panou antrenori pentru gestionare lot și înscrieri.',
    mode: 'external',
    port: 5175,
    accent: 'bg-emerald-200',
  },
  {
    id: 'referee-scoring',
    name: 'Referee Scoring',
    description: 'Introducere punctaje și validare arbitraj.',
    mode: 'external',
    port: 5176,
    accent: 'bg-orange-200',
  },
  {
    id: 'public-display',
    name: 'Public Display',
    description: 'Afișaj public pentru meciuri, rezultate și program.',
    mode: 'external',
    port: 5177,
    accent: 'bg-pink-200',
  },
  {
    id: 'public-registry',
    name: 'Public Registry',
    description: 'Registru public sportivi, profiluri și rezultate validate.',
    mode: 'external',
    port: 5178,
    accent: 'bg-cyan-200',
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
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-lg font-black uppercase tracking-wide text-gray-900 sm:text-2xl">Portal FRVV</h1>
        <p className="mt-2 text-sm text-gray-600 sm:text-base">
          Alege aplicația dorită pentru a continua fluxul de lucru.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((app) => {
          const content = (
            <>
              <div className={`inline-flex items-center rounded border border-black px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-800 ${app.accent}`}>
                {app.mode === 'internal' ? 'Aplicație internă' : `Port ${app.port}`}
              </div>
              <h2 className="mt-3 text-base font-black uppercase tracking-wide text-gray-900">{app.name}</h2>
              <p className="mt-2 text-sm text-gray-600">{app.description}</p>
              {app.mode === 'external' && (
                <p className="mt-4 text-xs font-semibold text-blue-700">{app.href}</p>
              )}
            </>
          );

          if (app.mode === 'internal') {
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => navigate(app.to)}
                className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-yellow-50/40 hover:shadow-md"
              >
                {content}
              </button>
            );
          }

          return (
            <a
              key={app.id}
              href={app.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-yellow-50/40 hover:shadow-md"
            >
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
}
