import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { Badge, Card, CardContent, EmptyState, Skeleton } from '../components/ui';
import { Calendar, MapPin } from 'lucide-react';

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

function CompetitionCard({ event, disabled = false, onOpen }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      title={disabled ? 'Competiția s-a încheiat — nu mai poți modifica înscrierile' : undefined}
      className="w-full text-left"
    >
      <Card className={disabled ? 'opacity-60' : 'transition hover:bg-accent'}>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{event.name}</h3>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {event.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(event.start_date)}</span>}
              {event.place && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {event.place}</span>}
            </div>
          </div>
          <Badge variant={disabled ? 'outline' : 'default'} className="shrink-0">
            {disabled ? 'Încheiat' : 'Deschide centralizator'}
          </Badge>
        </CardContent>
      </Card>
    </button>
  );
}

export default function CompetitionsList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    competitionAPI.list().then(res => {
      const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];
      setEvents(data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (events.length === 0) {
    return <EmptyState title="Fără competiții" message="Nu există competiții disponibile momentan." />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(ev => (ev.end_date || ev.start_date || '') >= today)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const past = events.filter(ev => (ev.end_date || ev.start_date || '') < today)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Competiții</h1>
          <p className="text-sm text-muted-foreground">Înscrieri pentru sportivii clubului tău</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{upcoming.length} viitoare</Badge>
          <Badge variant="outline">{past.length} încheiate</Badge>
        </div>
      </div>

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competiții viitoare</h2>
            <span className="text-xs text-muted-foreground">Poți modifica înscrierile</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map(ev => (
              <CompetitionCard key={ev.id} event={ev} onOpen={() => navigate(`/competitions/${ev.id}`)} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competiții încheiate</h2>
            <span className="text-xs text-muted-foreground">Doar vizualizare</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {past.map(ev => (
              <CompetitionCard key={ev.id} event={ev} disabled />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
