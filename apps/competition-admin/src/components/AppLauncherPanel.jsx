import { useMemo, useState } from 'react';

const APPS = [
  { id: 'competition-admin', name: 'Competition Admin', description: 'Administrare competiții', port: 5173 },
  { id: 'athlete-enrollment', name: 'Athlete Enrollment', description: 'Înscriere sportivi', port: 5174 },
  { id: 'coach-dashboard', name: 'Coach Dashboard', description: 'Panou antrenori', port: 5175 },
  { id: 'referee-scoring', name: 'Referee Scoring', description: 'Punctaj arbitri', port: 5176 },
  { id: 'public-display', name: 'Public Display', description: 'Afișaj public', port: 5177 },
];

export default function AppLauncherPanel({ buttonClassName = '' }) {
  const [open, setOpen] = useState(false);

  const appLinks = useMemo(() => {
    const host = window.location.hostname || 'localhost';
    const protocol = window.location.protocol || 'http:';
    return APPS.map((app) => ({
      ...app,
      url: `${protocol}//${host}:${app.port}`,
    }));
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName || 'border border-yellow-400/50 px-2.5 py-1 text-xs font-semibold text-yellow-100 transition-colors hover:bg-yellow-300 hover:text-black'}
      >
        Aplicații
      </button>

      {open && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl overflow-hidden border-2 border-black bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black bg-yellow-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Panou aplicații</h2>
                <p className="text-xs text-gray-700">Acces rapid către toate aplicațiile frontend</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-gray-500 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Închide
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {appLinks.map((app) => (
                <a
                  key={app.id}
                  href={app.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-2 border-black bg-white p-3 transition hover:bg-yellow-50"
                >
                  <p className="text-sm font-bold text-gray-900">{app.name}</p>
                  <p className="mt-1 text-xs text-gray-600">{app.description}</p>
                  <p className="mt-2 text-[11px] font-semibold text-blue-700">{app.url}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
