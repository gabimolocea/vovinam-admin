import { useEffect, useState } from 'react';
import { gradeAPI, gradeHistoryAPI, athleteAPI } from '@shared/lib/api';
import { PageHeader, Card, Spinner, EmptyState, DataTable, StatusBadge } from '@shared/components/ui';

export default function GradeManagement() {
  const [grades, setGrades] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ athlete: '', grade: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const fetchAll = async () => {
    const [gradeRes, subRes, athRes] = await Promise.all([
      gradeAPI.list(),
      gradeHistoryAPI.submissions.list({ my_club: true }).catch(() => ({ data: [] })),
      athleteAPI.list({ my_club: true }),
    ]);
    setGrades(Array.isArray(gradeRes.data) ? gradeRes.data : gradeRes.data.results ?? []);
    setSubmissions(Array.isArray(subRes.data) ? subRes.data : subRes.data.results ?? []);
    setAthletes(Array.isArray(athRes.data) ? athRes.data : athRes.data.results ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await gradeHistoryAPI.submissions.create(form);
      setShowForm(false);
      setForm({ athlete: '', grade: '', notes: '' });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'athlete_name', label: 'Athlete', render: (r) => r.athlete_name || '—' },
    { key: 'grade_name', label: 'Grade', render: (r) => r.grade_name || '—' },
    { key: 'submitted_date', label: 'Submitted', render: (r) => r.submitted_date?.split('T')[0] || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Grade Management" subtitle="Submit and track grade promotions">
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Submit Grade
        </button>
      </PageHeader>

      {showForm && (
        <Card className="mb-6 max-w-md">
          <form onSubmit={handleSubmit} className="space-y-3">
            <select
              required
              value={form.athlete}
              onChange={(e) => setForm((f) => ({ ...f, athlete: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Select Athlete —</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.first_name || ''} ${a.last_name || ''}`.trim() || a.full_name}
                </option>
              ))}
            </select>
            <select
              required
              value={form.grade}
              onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Select Grade —</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {submissions.length === 0 ? (
        <EmptyState icon="🎖️" title="No grade submissions" message="Submit grade promotions for your athletes." />
      ) : (
        <DataTable columns={columns} rows={submissions} />
      )}
    </>
  );
}
