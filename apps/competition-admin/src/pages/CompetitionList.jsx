import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { competitionAPI, systemAPI } from '@shared/lib/api';
import { getSyncStatusMeta } from '@shared/lib/syncStatus';
import { Badge, Button, Card, Spinner, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';
import { Plus } from 'lucide-react';

export default function CompetitionList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Whether an event shows up on the public site is a cloud-only concern -
  // the local venue server has no public-facing site of its own, so this
  // toggle has no business being editable (or even shown) from there.
  const [isLocalServer, setIsLocalServer] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await systemAPI.info();
        if (!cancelled) setIsLocalServer(Boolean(data.is_local_event_server));
      } catch {
        if (!cancelled) setIsLocalServer(false);
      } finally {
        if (!cancelled) setSystemChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // systemAPI.info() hasn't answered yet on the first render, and this list
  // is the wrong screen to show a venue operator even for a moment - so wait
  // for both before deciding what to render.
  const [systemChecked, setSystemChecked] = useState(false);

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

  if (loading || !systemChecked) return <div className="flex justify-center py-20"><Spinner /></div>;

  // A venue server runs exactly one competition, and the operator already
  // picked it in the launcher - so this list is a list of one thing they
  // have to click through again. Go straight to it: the one the launcher
  // opened (remembered by CategoriesLayout), or the only one there is.
  // Cloud keeps the list, where choosing between competitions is the point.
  if (isLocalServer && events.length > 0) {
    let remembered = null;
    try {
      remembered = window.localStorage.getItem('lastOpenedEventId');
    } catch {
      remembered = null;
    }
    const target = events.find((ev) => String(ev.id) === String(remembered))
      || (events.length === 1 ? events[0] : null);
    if (target) return <Navigate to={`/competitions/${target.id}/categories`} replace />;
  }

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🏆</div>
          <h2 className="text-base font-semibold text-foreground mb-1">Fără competiții</h2>
          <p className="text-sm text-muted-foreground">Nu există competiții disponibile momentan.</p>
          {!isLocalServer && (
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
          )}
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

  return (
    <div className="space-y-6">
      {/* Creating records here would take primary keys that belong to
          different records in cloud, which the results push then refuses -
          the backend blocks it too, this just doesn't offer it. */}
      {!isLocalServer && (
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
      )}

      <div className="space-y-3 md:hidden">
        {sorted.map((ev) => {
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
                  <Badge className={syncBadge.className}>{syncBadge.label}</Badge>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                {isLocalServer ? <div /> : (
                  <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Switch
                      checked={ev.is_publicly_visible}
                      onCheckedChange={(checked) => handleToggleVisibility(ev, checked)}
                    />
                    <span className="text-xs font-medium text-muted-foreground">Public</span>
                  </div>
                )}
                <div className="flex gap-2">
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
              {!isLocalServer && <TableHead>Public</TableHead>}
              <TableHead className="text-right">Acțiune</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ev) => {
                  const syncBadge = getSyncStatusMeta(ev);
              return (
                <TableRow key={ev.id}>
                  <TableCell className="align-top md:min-w-[320px]">
                    <div className="font-semibold text-foreground">{ev.name}</div>
                    <div className="mt-2">
                      <Badge className={syncBadge.className}>{syncBadge.label}</Badge>
                    </div>
                  </TableCell>
                  {!isLocalServer && (
                    <TableCell className="align-top">
                      <Switch
                        checked={ev.is_publicly_visible}
                        onCheckedChange={(checked) => handleToggleVisibility(ev, checked)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-right align-top">
                    <div className="flex justify-end gap-2">
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
