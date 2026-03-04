import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@shared/lib/api';

export default function SelectScreen() {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/competitions/', { params: { status: 'active' } }).catch(() => ({ data: [] })),
      api.get('/competition-fields/').catch(() => ({ data: [] })),
    ]).then(([compRes, fieldRes]) => {
      setCompetitions(Array.isArray(compRes.data) ? compRes.data : compRes.data.results ?? []);
      setFields(Array.isArray(fieldRes.data) ? fieldRes.data : fieldRes.data.results ?? []);
      setLoading(false);
    });
  }, []);

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.();
    document.body.classList.remove('interactive');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4 text-white">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tight">🥋 FRVV Live Scores</h1>
        <p className="mt-2 text-gray-400">Federația Română de Vovinam Viet Vo Dao</p>
      </div>

      {loading ? (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      ) : (
        <div className="w-full max-w-lg space-y-6">
          {/* Global view */}
          <button
            onClick={() => { goFullscreen(); navigate('/live'); }}
            className="w-full rounded-xl bg-blue-700 px-6 py-4 text-left text-lg font-semibold transition-colors hover:bg-blue-600"
          >
            📊 All Live Scores
            <span className="mt-1 block text-sm font-normal text-blue-200">
              Auto-refreshing overview of all fields
            </span>
          </button>

          {/* Per-field views */}
          {fields.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Or select a specific field
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { goFullscreen(); navigate(`/field/${f.id}`); }}
                    className="rounded-xl bg-gray-800 px-4 py-3 text-left transition-colors hover:bg-gray-700"
                  >
                    <span className="font-semibold">{f.name}</span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      Field #{f.field_number}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
