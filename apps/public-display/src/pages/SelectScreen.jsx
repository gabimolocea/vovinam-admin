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
      api.get('/competitions/').catch(() => ({ data: [] })),
      api.get('/competition-fields/').catch(() => ({ data: [] })),
    ]).then(([compRes, fieldRes]) => {
      setCompetitions(Array.isArray(compRes.data) ? compRes.data : compRes.data.results ?? []);
      setFields(Array.isArray(fieldRes.data) ? fieldRes.data : fieldRes.data.results ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <img src="/frvv-logo.png" alt="FRVV" className="w-24 h-24 object-contain mb-4" />
      <h1 className="text-2xl font-black text-gray-900 tracking-tight">FRVV Public Display</h1>
      <p className="text-sm text-gray-500 mt-1 mb-8">Federația Română de Vovinam Viet-Vo-Dao</p>

      {loading ? (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      ) : fields.length === 0 ? (
        <p className="text-gray-400 text-sm">Nu există tatami-uri configurate.</p>
      ) : (
        <div className="w-full max-w-lg">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Selectează tatami-ul pentru afișare
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  document.documentElement.requestFullscreen?.();
                  navigate(`/display/${f.id}`);
                }}
                className="rounded-xl border-2 border-gray-200 bg-white px-5 py-4 text-left hover:border-blue-400 hover:shadow-lg transition-all"
              >
                <span className="text-lg font-bold text-gray-900">{f.name}</span>
                <span className="block text-xs text-gray-400 mt-0.5">Tatami #{f.field_number}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
