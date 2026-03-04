import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchAPI, roundAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';

const POINT_TYPES = [
  { label: 'Punch', value: 'punch', points: 1, color: 'bg-blue-600' },
  { label: 'Kick', value: 'kick', points: 2, color: 'bg-green-600' },
  { label: 'Penalty', value: 'penalty', points: -1, color: 'bg-red-600' },
  { label: 'Warning', value: 'warning', points: 0, color: 'bg-yellow-500' },
];

export default function MatchScoring() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({ athlete1: 0, athlete2: 0 });
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const eventsEndRef = useRef(null);

  useEffect(() => {
    matchAPI.get(matchId).then(({ data }) => {
      setMatch(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [matchId]);

  const addPoint = useCallback((athlete, pointType) => {
    const pt = POINT_TYPES.find((p) => p.value === pointType);
    if (!pt) return;

    const event = {
      athlete,
      type: pointType,
      points: pt.points,
      time: new Date().toLocaleTimeString(),
    };

    setEvents((prev) => [...prev, event]);
    setScores((prev) => ({
      ...prev,
      [athlete]: prev[athlete] + pt.points,
    }));

    // Scroll to latest event
    setTimeout(() => eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const submitFinal = async () => {
    setBusy(true);
    try {
      await matchAPI.update(matchId, {
        athlete1_score: scores.athlete1,
        athlete2_score: scores.athlete2,
        status: 'completed',
      });
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <Spinner className="h-8 w-8 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  if (!match) {
    return <p className="py-20 text-center text-white">Match not found.</p>;
  }

  const athlete1Name = match.athlete1_name || 'Red Corner';
  const athlete2Name = match.athlete2_name || 'Blue Corner';

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">
          ← Back
        </button>
        <h1 className="font-bold">Match #{matchId}</h1>
        <button
          onClick={submitFinal}
          disabled={busy}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'End Match'}
        </button>
      </header>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 divide-x divide-gray-700">
        {/* Athlete 1 - Red */}
        <div className="flex flex-col items-center gap-3 bg-red-900/30 px-4 py-6">
          <span className="text-xs font-medium uppercase tracking-wider text-red-300">Red</span>
          <span className="text-sm font-semibold">{athlete1Name}</span>
          <span className="text-5xl font-black tabular-nums">{scores.athlete1}</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {POINT_TYPES.map((pt) => (
              <button
                key={pt.value}
                onClick={() => addPoint('athlete1', pt.value)}
                className={`${pt.color} rounded-lg px-3 py-2 text-xs font-semibold text-white active:scale-95`}
              >
                {pt.label} ({pt.points > 0 ? '+' : ''}{pt.points})
              </button>
            ))}
          </div>
        </div>

        {/* Athlete 2 - Blue */}
        <div className="flex flex-col items-center gap-3 bg-blue-900/30 px-4 py-6">
          <span className="text-xs font-medium uppercase tracking-wider text-blue-300">Blue</span>
          <span className="text-sm font-semibold">{athlete2Name}</span>
          <span className="text-5xl font-black tabular-nums">{scores.athlete2}</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {POINT_TYPES.map((pt) => (
              <button
                key={pt.value}
                onClick={() => addPoint('athlete2', pt.value)}
                className={`${pt.color} rounded-lg px-3 py-2 text-xs font-semibold text-white active:scale-95`}
              >
                {pt.label} ({pt.points > 0 ? '+' : ''}{pt.points})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Event log */}
      <div className="flex-1 overflow-y-auto border-t border-gray-700 px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Event Log</h3>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No events yet. Tap point buttons above.</p>
        ) : (
          <div className="space-y-1">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">{ev.time}</span>
                <span className={ev.athlete === 'athlete1' ? 'text-red-400' : 'text-blue-400'}>
                  {ev.athlete === 'athlete1' ? athlete1Name : athlete2Name}
                </span>
                <span className="text-gray-300">
                  {ev.type} ({ev.points > 0 ? '+' : ''}{ev.points})
                </span>
              </div>
            ))}
            <div ref={eventsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
