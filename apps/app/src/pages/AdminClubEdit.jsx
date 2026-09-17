import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { athleteAPI, clubAPI, visaAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import {
  Alert, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui';
import ClubForm from '../components/ClubForm';
import BeltBadge from '../components/BeltBadge';
import {
  ArrowLeft, Building2, ExternalLink, Globe, Link2, MapPin, Phone, Plus, Settings,
} from 'lucide-react';

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

/** Athlete photo in the same wide (3:2) format used across the app's own
 * roster tables (see ClubEdit.jsx's AthletePhoto) - `className` sets the
 * width; height follows from the aspect ratio. */
function AthletePhoto({ athlete: a, className }) {
  const fullName = a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim();
  const initials = `${(a.first_name || '')[0] || ''}${(a.last_name || '')[0] || ''}`.toUpperCase();
  return (
    <div className={`relative aspect-[3/2] shrink-0 bg-muted ${className}`}>
      {a.profile_image ? (
        <img src={imgUrl(a.profile_image)} alt={fullName} className="h-full w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg text-xs font-semibold text-muted-foreground">
          {initials || '?'}
        </div>
      )}
    </div>
  );
}

/** A real table from `lg:` up, stacked cards below it - shared between the
 * "Antrenori" and "Sportivi" groups. Name shares a cell with the photo
 * (rather than its own column) so the two sit close together instead of
 * being pulled apart by the table's per-cell padding. */
function RosterTable({
  athletes, navigate, latestAnnualVisaByAthlete, latestMedicalVisaByAthlete, annualVisaUnavailable, medicalVisaUnavailable,
}) {
  return (
    <>
      <div className="hidden rounded-lg border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nume</TableHead>
              <TableHead>Grad</TableHead>
              <TableHead>Viza anuală</TableHead>
              <TableHead>Viza medicală</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {athletes.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/athletes/${a.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <AthletePhoto athlete={a} className="w-16" />
                    <span className="font-medium">{a.full_name || `${a.first_name} ${a.last_name}`}</span>
                  </div>
                </TableCell>
                <TableCell>{a.current_grade?.name ? <BeltBadge grade={a.current_grade.name} /> : <span className="text-muted-foreground">—</span>}</TableCell>
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
                <p className="truncate font-medium">{a.full_name || `${a.first_name} ${a.last_name}`}</p>
                {a.current_grade?.name && <div className="mt-1"><BeltBadge grade={a.current_grade.name} /></div>}
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
  );
}

/** The club's roster, reached from its admin edit page - lets an admin
 * see and add/edit any club's athletes without going through a coach
 * account, same data as ClubEdit.jsx's own RosterTab but scoped to an
 * explicit club id (admin has no club of their own) rather than
 * `?my_club=true`. Coaches get their own group above the plain athletes
 * (with a heading, not just an inline badge) so they stand out at a
 * glance instead of being buried in the list. */
function RosterSection({ clubId }) {
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [annualVisas, setAnnualVisas] = useState([]);
  const [medicalVisas, setMedicalVisas] = useState([]);
  const [annualVisaUnavailable, setAnnualVisaUnavailable] = useState(false);
  const [medicalVisaUnavailable, setMedicalVisaUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.allSettled([
      athleteAPI.list({ club: clubId }),
      visaAPI.annual.list({ club: clubId }),
      visaAPI.medical.list({ club: clubId }),
    ]).then(([athletesResult, annualResult, medicalResult]) => {
      if (!active) return;
      if (athletesResult.status === 'rejected') {
        setError('Nu am putut încărca sportivii clubului.');
        return;
      }
      setAthletes(normalizeList(athletesResult.value.data));
      setAnnualVisaUnavailable(annualResult.status === 'rejected');
      setMedicalVisaUnavailable(medicalResult.status === 'rejected');
      setAnnualVisas(annualResult.status === 'fulfilled' ? normalizeList(annualResult.value.data) : []);
      setMedicalVisas(medicalResult.status === 'fulfilled' ? normalizeList(medicalResult.value.data) : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clubId]);

  const coaches = athletes.filter((a) => a.is_coach);
  const plainAthletes = athletes.filter((a) => !a.is_coach);
  const latestAnnualVisaByAthlete = useMemo(() => getLatestVisaByAthlete(annualVisas), [annualVisas]);
  const latestMedicalVisaByAthlete = useMemo(() => getLatestVisaByAthlete(medicalVisas), [medicalVisas]);
  const visaProps = { latestAnnualVisaByAthlete, latestMedicalVisaByAthlete, annualVisaUnavailable, medicalVisaUnavailable };

  return (
    <section className="flex flex-col gap-6 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Sportivi</h2>
        <Button size="sm" onClick={() => navigate(`/athletes/new?club=${clubId}`)}>
          <Plus className="h-4 w-4" /> Adaugă sportiv
        </Button>
      </div>

      {loading && <Skeleton className="h-48" />}
      {!loading && error && <Alert variant="destructive">{error}</Alert>}
      {!loading && !error && athletes.length === 0 && (
        <EmptyState title="Fără sportivi" message="Nu au fost găsiți sportivi în acest club." />
      )}
      {!loading && !error && coaches.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Antrenori</h3>
          <RosterTable athletes={coaches} navigate={navigate} {...visaProps} />
        </div>
      )}
      {!loading && !error && plainAthletes.length > 0 && (
        <div className="flex flex-col gap-3">
          {coaches.length > 0 && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sportivi</h3>}
          <RosterTable athletes={plainAthletes} navigate={navigate} {...visaProps} />
        </div>
      )}
    </section>
  );
}

/** Admin-only: edit (or delete) any single club - reached from
 * AdminClubs.jsx's list. Coaches use the smaller edit dialog on their own
 * `/club` page instead; this is the full identity-including form (name,
 * city) an admin needs when managing every club in the federation. */
export default function AdminClubEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const res = await clubAPI.get(id);
      setClub(res.data);
    } catch {
      setLoadError('Nu am putut încărca datele clubului.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave(payload) {
    setSaveError('');
    setSuccess(false);
    try {
      await clubAPI.update(id, payload);
      setSuccess(true);
      setEditOpen(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setSaveError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut salva modificările.');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (loadError || !club) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/cluburi')} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Înapoi la cluburi
        </Button>
        <Alert variant="destructive">{loadError || 'Club negăsit.'}</Alert>
      </div>
    );
  }

  const socialLinks = [
    club.facebook_url && { label: 'Facebook', href: club.facebook_url },
    club.instagram_url && { label: 'Instagram', href: club.instagram_url },
    club.youtube_url && { label: 'YouTube', href: club.youtube_url },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="outline" size="sm" onClick={() => navigate('/cluburi')} className="w-fit">
        <ArrowLeft className="h-4 w-4" /> Înapoi la cluburi
      </Button>

      {success && <Alert variant="success">Datele clubului au fost salvate.</Alert>}

      <section className="flex flex-col gap-4">
        <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
            {club.logo ? (
              <img src={imgUrl(club.logo)} alt={club.name} className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-8 w-8" />
            )}
          </div>
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <h1 className="font-display text-lg font-bold">{club.name}</h1>
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditOpen(true)}
            aria-label="Editează clubul"
            className="absolute right-0 top-0 sm:static sm:ml-auto"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent fullScreen>
          <DialogHeader>
            <DialogTitle>Editează clubul</DialogTitle>
          </DialogHeader>
          <ClubForm initial={club} onSubmit={handleSave} submitLabel="Salvează" error={saveError} />
        </DialogContent>
      </Dialog>

      <RosterSection clubId={id} />
    </div>
  );
}
