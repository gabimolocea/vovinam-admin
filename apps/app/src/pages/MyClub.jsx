import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { athleteAPI, clubAPI, visaAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import {
  Alert, Badge, EmptyState, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui';
import BeltBadge from '../components/BeltBadge';
import { Building2, ExternalLink, Globe, Link2, MapPin, Phone } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
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
  if (unavailable) return <Badge variant="outline" className="border-amber-400 text-amber-700">Indisponibilă</Badge>;
  if (!visa) return <Badge variant="outline">Lipsește</Badge>;
  return visa.is_valid
    ? <Badge className="border-transparent bg-emerald-100 text-emerald-800">Validă</Badge>
    : <Badge variant="destructive">Invalidă</Badge>;
}

/** Same wide (3:2) photo format as the profile page hero, not a circular
 * avatar - mirrors ClubEdit.jsx's own AthletePhoto so a coach's and an
 * athlete's roster view read the same way. */
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

/** "Clubul meu" - a plain athlete's read-only view of their own club: the
 * same header info a coach sees on `/club` (ClubEdit.jsx), plus their
 * clubmates' roster with no edit/review affordances (a coach gets the full
 * management page instead - see ClubPage.jsx, which picks between the
 * two). Backend already scopes `athleteAPI.list({my_club:true})` to
 * approved clubmates only and the public-shaped serializer for a
 * non-coach caller, so no extra filtering is needed here. */
export default function MyClub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const clubId = user?.athlete?.club;
  const [club, setClub] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [annualVisas, setAnnualVisas] = useState([]);
  const [medicalVisas, setMedicalVisas] = useState([]);
  const [annualVisaUnavailable, setAnnualVisaUnavailable] = useState(false);
  const [medicalVisaUnavailable, setMedicalVisaUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    clubAPI.get(clubId)
      .then((clubRes) => setClub(clubRes.data))
      .catch(() => setError('Nu am putut încărca datele clubului.'));
    Promise.allSettled([
      athleteAPI.list({ my_club: true }),
      visaAPI.annual.list({ my_club: true }),
      visaAPI.medical.list({ my_club: true }),
    ])
      .then(([athletesResult, annualResult, medicalResult]) => {
        if (athletesResult.status === 'fulfilled') setAthletes(normalizeList(athletesResult.value.data));
        setAnnualVisaUnavailable(annualResult.status === 'rejected');
        setMedicalVisaUnavailable(medicalResult.status === 'rejected');
        setAnnualVisas(annualResult.status === 'fulfilled' ? normalizeList(annualResult.value.data) : []);
        setMedicalVisas(medicalResult.status === 'fulfilled' ? normalizeList(medicalResult.value.data) : []);
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  const latestAnnualVisaByAthlete = useMemo(() => getLatestVisaByAthlete(annualVisas), [annualVisas]);
  const latestMedicalVisaByAthlete = useMemo(() => getLatestVisaByAthlete(medicalVisas), [medicalVisas]);

  if (!clubId) {
    return <Alert>Contul tău nu este asociat unui club.</Alert>;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !club) {
    return <Alert variant="destructive">{error || 'Club negăsit.'}</Alert>;
  }

  const logoUrl = imgUrl(club.logo);
  const socialLinks = [
    club.facebook_url && { label: 'Facebook', href: club.facebook_url },
    club.instagram_url && { label: 'Instagram', href: club.instagram_url },
    club.youtube_url && { label: 'YouTube', href: club.youtube_url },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Clubul meu</h1>

      <section className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
          {logoUrl ? <img src={logoUrl} alt={club.name} className="h-full w-full object-contain" /> : <Building2 className="h-8 w-8" />}
        </div>
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <p className="font-display text-lg font-bold">{club.name}</p>
          {club.slug && (
            <a
              href={withSsoHandoff(`${PUBLIC_SITE_URL}/cluburi/${club.slug}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary underline hover:text-primary/80"
            >
              Vezi clubul public <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="text-sm text-muted-foreground">{club.city?.name || 'Oraș nespecificat'}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
            {club.mobile_number && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {club.mobile_number}</span>}
            {club.website && (
              <a href={club.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground hover:underline">
                <Globe className="h-3.5 w-3.5" /> {club.website}
              </a>
            )}
            {club.address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {club.address}</span>}
          </div>
          {socialLinks.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm sm:justify-start">
              {socialLinks.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <Link2 className="h-3.5 w-3.5" /> {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sportivi ({athletes.length})</h2>
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
                    <TableHead>Viza anuală</TableHead>
                    <TableHead>Viza medicală</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {athletes.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/athletes/${a.id}`)}>
                      <TableCell><AthletePhoto athlete={a} className="w-16" /></TableCell>
                      <TableCell className="font-medium">{`${a.last_name || ''} ${a.first_name || ''}`.trim() || a.full_name || '—'}</TableCell>
                      <TableCell><GradeCell grade={a.current_grade} /></TableCell>
                      <TableCell><VisaBadge visa={latestAnnualVisaByAthlete.get(a.id)} unavailable={annualVisaUnavailable} /></TableCell>
                      <TableCell><VisaBadge visa={latestMedicalVisaByAthlete.get(a.id)} unavailable={medicalVisaUnavailable} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 lg:hidden">
              {athletes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate(`/athletes/${a.id}`)}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <AthletePhoto athlete={a} className="w-20" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{`${a.last_name || ''} ${a.first_name || ''}`.trim() || a.full_name || '—'}</p>
                      <div className="mt-1"><GradeCell grade={a.current_grade} /></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Viza anuală</p>
                      <VisaBadge visa={latestAnnualVisaByAthlete.get(a.id)} unavailable={annualVisaUnavailable} />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Viza medicală</p>
                      <VisaBadge visa={latestMedicalVisaByAthlete.get(a.id)} unavailable={medicalVisaUnavailable} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
