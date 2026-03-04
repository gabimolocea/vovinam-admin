import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { Card, Spinner, EmptyState, StatusBadge } from '@shared/components/ui';

export default function EventsList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    competitionAPI.list({ status: 'active' }).then(({ data }) => {
      setEvents(Array.isArray(data) ? data : data.results ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (events.length === 0) {
    return <EmptyState icon="🏆" title="No active events" message="Check back later for upcoming competitions." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Available Events</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((ev) => (
          <Card
            key={ev.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
          >
            <div onClick={() => navigate(`/events/${ev.id}/categories`)}>
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-900">{ev.name}</h3>
                <StatusBadge status={ev.status} />
              </div>
              <p className="mt-1 text-sm text-gray-500">{ev.location}</p>
              <p className="mt-2 text-xs text-gray-400">📅 {ev.start_date}{ev.end_date ? ` → ${ev.end_date}` : ''}</p>
              <p className="mt-3 text-sm font-medium text-blue-600">View categories →</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
