import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { athleteAPI, visaAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import {
  Alert, Badge, Button, EmptyState, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui';
import BeltBadge from '../components/BeltBadge';
import { Plus } from 'lucide-react';

const API_BASE = MEDIA_BASE_URL;

const STATUS_LABELS = {
  approved: 'Aprobat',
  pending: 'În așteptare',
  rejected: 'Respins',
  revision_required: 'Necesită revizie',
};

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${API_BASE}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

function normalizeList(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function getLatestVisaByAthlete(items) {
  const map = new Map();
  items.forEach((item) => {
    const athleteId = item?.athlete;
    if (!athleteId) return;
    const current = map.get(athleteId);
    const currentDate = current?.issued_date ? new Date(current.issued_date).getTime() : 0;
    const nextDate = item?.issued_date ? new Date(item.issued_date).getTime() : 0;
    if (!current || nextDate >= currentDate) map.set(athleteId, item);
  });
  return map;
}

function VisaBadge({ visa, unavailable = false }) {
  if (unavailable) return <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">Indisponibilă</Badge>;
  if (!visa) return <Badge variant="outline">Lipsește</Badge>;
  return visa.is_valid
    ? <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Validă</Badge>
    : <Badge variant="destructive">Invalidă</Badge>;
}

/** Athlete photo in the same wide (3:2) format used on the athlete's own
 * profile hero - rather than a small circular avatar - so the roster reads
 * consistently with the profile page. `className` sets the size (a fixed
 * width; height follows from the aspect ratio). */
function AthletePhoto({ athlete, className }) {
  const fullName = `${athlete.last_name || ''} ${athlete.first_name || ''}`.trim() || athlete.full_name || '—';
  const initials = `${(athlete.first_name || '')[0] || ''}${(athlete.last_name || '')[0] || ''}`.toUpperCase();
  return (
    <div className={`relative aspect-[3/2] shrink-0 bg-muted ${className}`}>
      {athlete.profile_image ? (
        <img src={imgUrl(athlete.profile_image)} alt={fullName} className="h-full w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg text-xs font-semibold text-muted-foreground">
          {initials || '?'}
        </div>
      )}
    </div>
  );
}

function GradeCell({ grade }) {
  if (!grade?.name) return <span className="text-muted-foreground">—</span>;
  return <BeltBadge grade={grade.name} />;
}

function StatusCell({ status }) {
  return (
    <Badge variant={status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'outline'} className="whitespace-nowrap">
      {STATUS_LABELS[status] || status || '—'}
    </Badge>
  );
}

export default function AthletesList() {
  const [athletes, setAthletes] = useState([]);
  const [annualVisas, setAnnualVisas] = useState([]);
  const [medicalVisas, setMedicalVisas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [annualVisaUnavailable, setAnnualVisaUnavailable] = useState(false);
  const [medicalVisaUnavailable, setMedicalVisaUnavailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.allSettled([
      athleteAPI.list({ my_club: true }),
      visaAPI.annual.list(),
      visaAPI.medical.list(),
    ]).then(([athletesResult, annualResult, medicalResult]) => {
      if (!active) return;
      if (athletesResult.status === 'rejected') {
        setError('Nu s-au putut încărca sportivii clubului.');
        return;
      }
      setAthletes(normalizeList(athletesResult.value.data));
      setAnnualVisaUnavailable(annualResult.status === 'rejected');
      setMedicalVisaUnavailable(medicalResult.status === 'rejected');
      setAnnualVisas(annualResult.status === 'fulfilled' ? normalizeList(annualResult.value.data) : []);
      setMedicalVisas(medicalResult.status === 'fulfilled' ? normalizeList(medicalResult.value.data) : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const latestAnnualVisaByAthlete = useMemo(() => getLatestVisaByAthlete(annualVisas), [annualVisas]);
  const latestMedicalVisaByAthlete = useMemo(() => getLatestVisaByAthlete(medicalVisas), [medicalVisas]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="destructive">{error}</Alert>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setReloadKey((v) => v + 1)}>Reîncearcă</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Sportivi</h1>
          <p className="text-sm text-muted-foreground">Sportivii din clubul tău</p>
        </div>
        <Button onClick={() => navigate('/athletes/new')}>
          <Plus className="h-4 w-4" /> Adaugă sportiv
        </Button>
      </div>

      {athletes.length === 0 ? (
        <EmptyState title="Fără sportivi" message="Nu au fost găsiți sportivi în clubul tău." />
      ) : (
        <>
          <div className="hidden rounded-lg border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Nume</TableHead>
                  <TableHead>Grad</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Viza anuală</TableHead>
                  <TableHead>Viza medicală</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {athletes.map((athlete) => (
                  <TableRow key={athlete.id} className="cursor-pointer" onClick={() => navigate(`/athletes/${athlete.id}`)}>
                    <TableCell><AthletePhoto athlete={athlete} className="w-16" /></TableCell>
                    <TableCell className="font-medium">{`${athlete.last_name || ''} ${athlete.first_name || ''}`.trim() || athlete.full_name || '—'}</TableCell>
                    <TableCell><GradeCell grade={athlete.current_grade_details} /></TableCell>
                    <TableCell><StatusCell status={athlete.status} /></TableCell>
                    <TableCell><VisaBadge visa={latestAnnualVisaByAthlete.get(athlete.id)} unavailable={annualVisaUnavailable} /></TableCell>
                    <TableCell><VisaBadge visa={latestMedicalVisaByAthlete.get(athlete.id)} unavailable={medicalVisaUnavailable} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {athletes.map((athlete) => (
              <button
                key={athlete.id}
                type="button"
                onClick={() => navigate(`/athletes/${athlete.id}`)}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <AthletePhoto athlete={athlete} className="w-20" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{`${athlete.last_name || ''} ${athlete.first_name || ''}`.trim() || athlete.full_name || '—'}</p>
                    <div className="mt-1"><GradeCell grade={athlete.current_grade_details} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                    <Badge variant={athlete.status === 'approved' ? 'default' : athlete.status === 'rejected' ? 'destructive' : 'outline'} className="w-full justify-center whitespace-nowrap">
                      {STATUS_LABELS[athlete.status] || athlete.status || '—'}
                    </Badge>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Viza anuală</p>
                    <VisaBadge visa={latestAnnualVisaByAthlete.get(athlete.id)} unavailable={annualVisaUnavailable} />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Viza medicală</p>
                    <VisaBadge visa={latestMedicalVisaByAthlete.get(athlete.id)} unavailable={medicalVisaUnavailable} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
