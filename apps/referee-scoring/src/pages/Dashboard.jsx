import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { refereeAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner, formatGroupBadgeLabel, Card, CardContent, Badge, Button } from '../components/ui';
import { LogOut, HelpCircle } from 'lucide-react';

const GENDER_LABELS = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };
const MATCH_TYPE_LABELS = { qualifications: 'Calificări', 'quarter-finals': 'Sferturi', 'semi-finals': 'Semi-finală', finals: 'Finală', bronze: 'Bronz' };

const getFieldLabel = (item) => {
  if (item.field_number != null) {
    return `Teren ${item.field_number}`;
  }
  if (item.field_name) {
    return item.field_name;
  }
  return 'Teren nealocat';
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignments = () => {
      Promise.all([
        refereeAPI.assignedCategories().catch(() => ({ data: [] })),
        refereeAPI.assignedMatches().catch(() => ({ data: [] })),
      ]).then(([catRes, matchRes]) => {
        const allCats = Array.isArray(catRes.data) ? catRes.data : catRes.data.results ?? [];
        const allMatches = Array.isArray(matchRes.data) ? matchRes.data : matchRes.data.results ?? [];
        setCategories(allCats.filter(c => c.field_status === 'in_progress'));
        setMatches(allMatches.filter(m => m.field_status === 'in_progress'));
        setLoading(false);
      });
    };
    fetchAssignments();
    const interval = setInterval(fetchAssignments, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  const hasNothing = categories.length === 0 && matches.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-bold uppercase tracking-wide">Panou Arbitraj</h1>
            <p className="text-xs text-sidebar-foreground/70">{user?.first_name || user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground">
            <LogOut className="h-3.5 w-3.5" />
            Deconectare
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        {hasNothing && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <HelpCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">Nicio probă activă</p>
            <p className="mt-1 text-sm text-muted-foreground">Nu aveți probe sau meciuri asignate momentan.</p>
          </div>
        )}

        {categories.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categorii asignate</h2>
            <div className="grid gap-3">
              {categories.map((cat) => (
                <Card key={cat.id} className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/10">
                  <CardContent className="flex flex-wrap items-center gap-2.5 pt-5 sm:gap-3">
                    <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <span className="block whitespace-normal break-words text-sm font-semibold text-foreground md:text-base">{cat.name || cat.category_name}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {cat.group_name && <Badge variant="outline">{formatGroupBadgeLabel(cat.group_name, cat)}</Badge>}
                        {cat.gender && <Badge variant="secondary">{GENDER_LABELS[cat.gender] || cat.gender}</Badge>}
                        <Badge className="border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{getFieldLabel(cat)}</Badge>
                        {cat.referee_position && <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Poziția ta: {cat.referee_position}</Badge>}
                      </div>
                    </div>
                    <Button onClick={() => navigate(`/category/${cat.id}/score`)} className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 sm:mt-0 sm:w-auto sm:shrink-0">
                      PUNCTEAZĂ
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {matches.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meciuri asignate</h2>
            <div className="grid gap-3">
              {matches.map((match) => (
                <Card key={match.id} className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/10">
                  <CardContent className="flex flex-wrap items-center gap-2.5 pt-5 sm:gap-3">
                    <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <span className="block whitespace-normal break-words text-sm font-semibold md:text-base">
                        <span className="mr-1 text-muted-foreground">ID {match.id}</span>
                        <span className="text-foreground">{match.red_corner_full_name || 'TBD'}</span>
                        <span className="mx-1 text-muted-foreground">vs</span>
                        <span className="text-foreground/80">{match.blue_corner_full_name || 'TBD'}</span>
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(match.category_name || `Meci #${match.id}`) && (
                          <Badge variant="outline">{match.category_name || `Meci #${match.id}`}</Badge>
                        )}
                        {match.category_group_name && <Badge variant="outline">{formatGroupBadgeLabel(match.category_group_name, match)}</Badge>}
                        {match.category_gender && <Badge variant="secondary">{GENDER_LABELS[match.category_gender] || match.category_gender}</Badge>}
                        <Badge className="border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{getFieldLabel(match)}</Badge>
                        {match.referee_position && <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Poziția ta: {match.referee_position}</Badge>}
                      </div>
                      {match.match_type && (
                        <span className="mt-1 block whitespace-normal break-words text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">{MATCH_TYPE_LABELS[match.match_type] || match.match_type}</span>
                        </span>
                      )}
                    </div>
                    <Button onClick={() => navigate(`/match/${match.id}/score`)} className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 sm:mt-0 sm:w-auto sm:shrink-0">
                      PUNCTEAZĂ
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
