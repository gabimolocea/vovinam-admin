import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categoryAPI, refereeAPI, enrollmentAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';

export default function ScoringPanel() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [scores, setScores] = useState({}); // { athleteId: score }
  const [submitting, setSubmitting] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      categoryAPI.get(categoryId),
      enrollmentAPI.categoryAthletes.list({ category: categoryId }),
    ]).then(([catRes, athRes]) => {
      setCategory(catRes.data);
      const list = Array.isArray(athRes.data) ? athRes.data : athRes.data.results ?? [];
      setAthletes(list);
      // Initialize scores with empty values
      const init = {};
      list.forEach((a) => { init[a.athlete || a.id] = ''; });
      setScores(init);
      setLoading(false);
    });
  }, [categoryId]);

  const handleScore = useCallback((athleteId, value) => {
    // Clamp score between 0.0 and 10.0
    const num = parseFloat(value);
    if (value === '' || (!isNaN(num) && num >= 0 && num <= 10)) {
      setScores((prev) => ({ ...prev, [athleteId]: value }));
    }
  }, []);

  const submitScore = async (athleteId) => {
    const score = parseFloat(scores[athleteId]);
    if (isNaN(score)) return;
    setSubmitting(athleteId);
    try {
      await refereeAPI.categoryScores.create({
        category: parseInt(categoryId),
        athlete: athleteId,
        score,
      });
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.detail || d?.error || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Failed to submit score';
      alert(msg);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-blue-900 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-blue-200 hover:text-white">
            ← Back
          </button>
          <div>
            <h1 className="font-bold">{category?.name || `Category #${categoryId}`}</h1>
            <p className="text-xs text-blue-200 capitalize">{category?.category_type}</p>
          </div>
        </div>
      </header>

      {/* Scoring grid */}
      <div className="mx-auto max-w-lg space-y-3 px-4 py-4">
        {athletes.length === 0 ? (
          <p className="py-12 text-center text-gray-500">No athletes enrolled in this category.</p>
        ) : (
          athletes.map((entry) => {
            const athleteId = entry.athlete || entry.id;
            const d = entry.athlete_details || {};
            const name = `${d.last_name || ''} ${d.first_name || ''}`.trim() || entry.athlete_name || entry.full_name || `Sportiv #${athleteId}`;
            const clubName = d.club?.name || entry.club_name || '';
            const submitted = submitting === athleteId;
            return (
              <div
                key={athleteId}
                className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
              >
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{name}</p>
                  {clubName && <p className="text-xs text-gray-500">{clubName}</p>}
                </div>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={scores[athleteId] ?? ''}
                  onChange={(e) => handleScore(athleteId, e.target.value)}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-center text-lg font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="0.0"
                />
                <button
                  onClick={() => submitScore(athleteId)}
                  disabled={submitted || !scores[athleteId]}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  {submitted ? '…' : '✓'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
