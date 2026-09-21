import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { getSyncStatusMeta } from '@shared/lib/syncStatus';
import { Badge, Button, Card, Spinner, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';
import { Plus } from 'lucide-react';

function formatDate(value) {
  if (!value) return '—';
  const normalized = String(value).split('T')[0];
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCompetitionStatus(ev, today) {
  const endDate = ev.end_date || ev.start_date || '';
  if (endDate && endDate < today) {
    return { label: 'Încheiată', className: 'border-transparent bg-secondary/60 text-secondary-foreground' };
  }
  return { label: 'Activă / viitoare', className: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' };
}

export default function CompetitionList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    competitionAPI.list().then(({ data }) => {
      const list = Array.isArray(data) ? data : data.results ?? [];
      setEvents(list);
    }).finally(() => setLoading(false));
  }, []);

  const handleToggleVisibility = (ev, checked) => {
    setEvents((prev) => prev.map((item) => (item.id === ev.id ? { ...item, is_publicly_visible: checked } : item)));
    competitionAPI.update(ev.id, { is_publicly_visible: checked }).catch(() => {
      setEvents((prev) => prev.map((item) => (item.id === ev.id ? { ...item, is_publicly_visible: !checked } : item)));
    });
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🏆</div>
          <h2 className="text-base font-semibold text-foreground mb-1">Fără competiții</h2>
          <p className="text-sm text-muted-foreground">Nu există competiții disponibile momentan.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate('/competitions/new')}>
              <Plus className="h-4 w-4" />
              Competiție nouă
            </Button>
            <Button onClick={() => navigate('/athletes/new')}>
              <Plus className="h-4 w-4" />
              Adaugă sportiv
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // Sort: upcoming first, then past (most recent first)
  const sorted = [...events].sort((a, b) => {
    const aEnd = a.end_date || a.start_date || '';
    const bEnd = b.end_date || b.start_date || '';
    const aPast = aEnd < today;
    const bPast = bEnd < today;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return (b.start_date || '').localeCompare(a.start_date || '');
  });

  const renderPeriod = (ev) => (
    <>
      {formatDate(ev.start_date)}
      {ev.end_date && ev.end_date !== ev.start_date ? ` → ${formatDate(ev.end_date)}` : ''}
    </>
  );

  const renderLocation = (ev) => ev.city_name || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/athletes/new')}>
          <Plus className="h-4 w-4" />
          Adaugă sportiv
        </Button>
        <Button onClick={() => navigate('/competitions/new')}>
          <Plus className="h-4 w-4" />
          Competiție nouă
        </Button>
      </div>

      <div className="space-y-3 md:hidden">
        {sorted.map((ev) => {
          const status = getCompetitionStatus(ev, today);
          const syncBadge = getSyncStatusMeta(ev);
          return (
            <Card
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/competitions/${ev.id}/categories`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/competitions/${ev.id}/categories`);
                }
              }}
              className="w-full p-4 text-left transition hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{ev.name}</h2>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge className={status.className}>{status.label}</Badge>
                  <Badge className={syncBadge.className}>{syncBadge.label}</Badge>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-foreground">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Perioadă</p>
                  <p className="mt-1 font-medium">{renderPeriod(ev)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Oraș</p>
                  <p className="mt-1 font-medium">{renderLocation(ev)}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  <Switch
                    checked={ev.is_publicly_visible}
                    onCheckedChange={(checked) => handleToggleVisibility(ev, checked)}
                  />
                  <span className="text-xs font-medium text-muted-foreground">Public</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/competitions/${ev.id}/categories/sync`);
                    }}
                  >
                    Sync
                  </Button>
                  <Button size="sm" as="span">Deschide</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competiție</TableHead>
              <TableHead>Perioadă</TableHead>
              <TableHead>Oraș</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Public</TableHead>
              <TableHead className="text-right">Acțiune</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ev) => {
              const status = getCompetitionStatus(ev, today);
              const syncBadge = getSyncStatusMeta(ev);
              return (
                <TableRow key={ev.id}>
                  <TableCell className="align-top md:min-w-[320px]">
                    <div className="font-semibold text-foreground">{ev.name}</div>
                    <div className="mt-2">
                      <Badge className={syncBadge.className}>{syncBadge.label}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {renderPeriod(ev)}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {renderLocation(ev)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge className={status.className}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <Switch
                      checked={ev.is_publicly_visible}
                      onCheckedChange={(checked) => handleToggleVisibility(ev, checked)}
                    />
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/competitions/${ev.id}/categories/sync`)}
                      >
                        Sync
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/competitions/${ev.id}/categories`)}
                      >
                        Deschide
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

    </div>
  );
}
