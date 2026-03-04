import { useEffect, useState } from 'react';
import { competitionAPI, athleteAPI, enrollmentAPI } from '@shared/lib/api';
import { PageHeader, Card, Spinner, EmptyState } from '@shared/components/ui';

export default function EnrollAthletes() {
  const [events, setEvents] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      competitionAPI.list({ status: 'active' }),
      athleteAPI.list({ my_club: true }),
    ]).then(([evRes, athRes]) => {
      setEvents(Array.isArray(evRes.data) ? evRes.data : evRes.data.results ?? []);
      setAthletes(Array.isArray(athRes.data) ? athRes.data : athRes.data.results ?? []);
      setLoading(false);
    });
  }, []);

  const toggleAthlete = (id) => {
    setSelectedAthletes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleEnroll = async () => {
    if (!selectedEvent || selectedAthletes.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      await Promise.all(
        selectedAthletes.map((athleteId) =>
          enrollmentAPI.eventEnrollments.create({
            event: selectedEvent,
            athlete: athleteId,
          }),
        ),
      );
      setMessage(`✅ Successfully enrolled ${selectedAthletes.length} athlete(s)`);
      setSelectedAthletes([]);
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.detail || 'Enrollment failed'}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Enroll Athletes" subtitle="Register your club athletes for events" />

      {message && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <Card className="mb-6 max-w-lg">
        <label className="block text-sm font-medium text-gray-700">Select Event</label>
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">— Choose event —</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} ({ev.start_date})</option>
          ))}
        </select>
      </Card>

      {athletes.length === 0 ? (
        <EmptyState icon="🥋" title="No athletes" message="No athletes found in your club." />
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">Select Athletes</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {athletes.map((ath) => {
              const name = `${ath.first_name || ''} ${ath.last_name || ''}`.trim() || ath.full_name || `#${ath.id}`;
              const selected = selectedAthletes.includes(ath.id);
              return (
                <div
                  key={ath.id}
                  onClick={() => toggleAthlete(ath.id)}
                  className={`cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selected} readOnly className="pointer-events-none" />
                    <span className="font-medium">{name}</span>
                  </div>
                  <p className="ml-6 text-xs text-gray-500">{ath.current_grade_name || ath.current_grade || ''}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <button
              onClick={handleEnroll}
              disabled={busy || !selectedEvent || selectedAthletes.length === 0}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Enrolling…' : `Enroll ${selectedAthletes.length} Athlete(s)`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
