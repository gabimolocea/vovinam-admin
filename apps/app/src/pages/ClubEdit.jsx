import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  athleteAPI, clubAPI, visaAPI, competitionAPI, gradeHistoryAPI, gradeAPI, MEDIA_BASE_URL,
} from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import { useAuth } from '@shared';
import {
  Alert, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Input, Label, Req, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '../components/ui';
import BeltBadge from '../components/BeltBadge';
import { Building2, Calendar, ExternalLink, Globe, Link2, MapPin, Phone, Plus, Settings } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

function normalizeList(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function fmtDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(value).slice(0, 10);
  }
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

/** "Sportivi" tab: the club's roster - moved here from its own top-level
 * page so a coach manages the club and its athletes in one place. */
function RosterTab() {
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
      visaAPI.annual.list({ my_club: true }),
      visaAPI.medical.list({ my_club: true }),
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
      <div className="flex flex-wrap items-center justify-end gap-3">
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
                <div className="grid grid-cols-2 gap-2 text-center">
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

function CreateExamDialog({ open, onOpenChange, clubName, onCreated }) {
  const [form, setForm] = useState({ start_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Title has no free-text field: it's always derived from the club and
  // exam month, e.g. "Examen de Grad Club Phuong - Sesiunea Martie 2026".
  const sessionMonthYear = form.start_date
    ? (() => {
        const month = new Date(form.start_date).toLocaleDateString('ro-RO', { month: 'long' });
        const year = new Date(form.start_date).getFullYear();
        return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
      })()
    : '';
  const title = form.start_date
    ? `Examen de Grad ${clubName || 'Club'} - Sesiunea ${sessionMonthYear}`
    : `Examen de Grad ${clubName || 'Club'}`;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { title, start_date: form.start_date, end_date: form.start_date };
      const res = await competitionAPI.createExam(payload);
      onCreated(res.data);
      setForm({ start_date: '' });
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut crea examenul.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Examen nou</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Titlu (generat automat)</Label>
            <Input value={title} disabled readOnly />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="exam_start">Data<Req /></Label>
            <Input id="exam_start" type="date" required value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Se creează…' : 'Creează examenul'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddGradeResultDialog({ open, onOpenChange, exams, athletes, grades, onCreated }) {
  const [form, setForm] = useState({ athlete: '', event: '', grade: '', obtained_date: '', level: 'good' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await gradeHistoryAPI.submissions.create({
        athlete: form.athlete,
        event: form.event,
        grade: form.grade,
        obtained_date: form.obtained_date,
        level: form.level,
      });
      onCreated();
      setForm({ athlete: '', event: '', grade: '', obtained_date: '', level: 'good' });
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut înregistra rezultatul.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Înregistrează rezultat examen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Sportiv<Req /></Label>
            <Select value={form.athlete} onValueChange={(v) => update('athlete', v)}>
              <SelectTrigger><SelectValue placeholder="Alege sportivul" /></SelectTrigger>
              <SelectContent>
                {athletes.map((a) => <SelectItem key={a.id} value={String(a.id)}>{`${a.last_name || ''} ${a.first_name || ''}`.trim()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Examen<Req /></Label>
            <Select value={form.event} onValueChange={(v) => update('event', v)}>
              <SelectTrigger><SelectValue placeholder="Alege examenul" /></SelectTrigger>
              <SelectContent>
                {exams.map((ev) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Grad obținut<Req /></Label>
            <Select value={form.grade} onValueChange={(v) => update('grade', v)}>
              <SelectTrigger><SelectValue placeholder="Alege gradul" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="result_date">Data obținerii<Req /></Label>
              <Input id="result_date" type="date" required value={form.obtained_date} onChange={(e) => update('obtained_date', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Nivel</Label>
              <Select value={form.level} onValueChange={(v) => update('level', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Bine</SelectItem>
                  <SelectItem value="bad">Slab</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Înregistrează'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Examene" tab: the club's grade-exam events - moved here from its own
 * top-level page for the same reason as "Sportivi". */
function ExamsTab() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [grades, setGrades] = useState([]);
  const [clubName, setClubName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [addResultOpen, setAddResultOpen] = useState(false);

  useEffect(() => {
    const clubId = user?.athlete?.club;
    if (!clubId) return;
    clubAPI.get(clubId).then((r) => setClubName(r.data?.name || '')).catch(() => {});
  }, [user?.athlete?.club]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [examsRes, athletesRes, gradesRes] = await Promise.all([
        competitionAPI.list({ event_type: 'examination' }),
        athleteAPI.list({ my_club: true }).catch(() => ({ data: [] })),
        gradeAPI.list().catch(() => ({ data: [] })),
      ]);
      setExams(normalizeList(examsRes.data));
      setAthletes(normalizeList(athletesRes.data));
      setGrades(normalizeList(gradesRes.data));
    } catch {
      setError('Nu am putut încărca examenele.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = exams.filter((ev) => (ev.end_date || ev.start_date || '') >= today);
  const past = exams.filter((ev) => (ev.end_date || ev.start_date || '') < today);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Examenele de grad ale clubului tău</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddResultOpen(true)}>Înregistrează rezultat</Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Examen nou
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {exams.length === 0 ? (
        <EmptyState title="Fără examene" message="Nu există examene create momentan." />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examene viitoare ({upcoming.length})</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border p-4">
                    <p className="font-medium">{ev.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {ev.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(ev.start_date)}</span>}
                      {ev.place && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.place}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examene încheiate ({past.length})</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {past.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border p-4 opacity-70">
                    <p className="font-medium">{ev.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {ev.start_date && <Badge variant="outline">{fmtDate(ev.start_date)}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <CreateExamDialog open={createOpen} onOpenChange={setCreateOpen} clubName={clubName} onCreated={(ev) => setExams((prev) => [ev, ...prev])} />
      <AddGradeResultDialog open={addResultOpen} onOpenChange={setAddResultOpen} exams={exams} athletes={athletes} grades={grades} onCreated={load} />
    </div>
  );
}

/** Edit-club form, opened from the gear icon next to the club header. */
function EditClubDialog({ open, onOpenChange, club, onSaved }) {
  const [form, setForm] = useState({ address: '', mobile_number: '', website: '', facebook_url: '', instagram_url: '', youtube_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !club) return;
    setForm({
      address: club.address || '',
      mobile_number: club.mobile_number || '',
      website: club.website || '',
      facebook_url: club.facebook_url || '',
      instagram_url: club.instagram_url || '',
      youtube_url: club.youtube_url || '',
    });
    setError(null);
  }, [open, club]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      const res = await clubAPI.update(club.id, payload);
      onSaved(res.data);
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'object' ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n') : 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Detalii club</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive" className="whitespace-pre-line">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_phone">Telefon</Label>
              <Input id="club_phone" name="mobile_number" value={form.mobile_number} onChange={handleChange} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="club_website">Website</Label>
              <Input id="club_website" name="website" value={form.website} onChange={handleChange} type="url" placeholder="https://" />
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="club_address">Adresă</Label>
              <Textarea id="club_address" name="address" value={form.address} onChange={handleChange} rows={3} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium text-foreground">Rețele sociale</Label>
            <p className="text-xs text-muted-foreground">Link-urile apar pe pagina publică a clubului.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_facebook" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Facebook</Label>
              <Input id="club_facebook" name="facebook_url" value={form.facebook_url} onChange={handleChange} type="url" placeholder="https://facebook.com/…" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_instagram" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Instagram</Label>
              <Input id="club_instagram" name="instagram_url" value={form.instagram_url} onChange={handleChange} type="url" placeholder="https://instagram.com/…" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_youtube" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> YouTube</Label>
              <Input id="club_youtube" name="youtube_url" value={form.youtube_url} onChange={handleChange} type="url" placeholder="https://youtube.com/…" />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Club logo, name and contact details shown read-only right under the
 * page title, with a gear icon opening the edit modal. */
function ClubHeader() {
  const { user } = useAuth();
  const clubId = user?.athlete?.club;

  const [club, setClub] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    clubAPI.get(clubId).then((r) => setClub(r.data)).catch(() => setError('Nu s-au putut încărca datele clubului.'));
  }, [clubId]);

  if (!clubId) {
    return <Alert>Contul tău nu este asociat unui club.</Alert>;
  }

  if (error) {
    return <Alert variant="destructive">{error}</Alert>;
  }

  if (!club) {
    return <Skeleton className="h-20" />;
  }

  const logoUrl = imgUrl(club.logo);
  const socialLinks = [
    club.facebook_url && { label: 'Facebook', href: club.facebook_url },
    club.instagram_url && { label: 'Instagram', href: club.instagram_url },
    club.youtube_url && { label: 'YouTube', href: club.youtube_url },
  ].filter(Boolean);

  return (
    <section className="flex flex-col gap-4">
      {success && <Alert variant="success">Datele clubului au fost salvate.</Alert>}
      <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
          {logoUrl ? (
            <img src={logoUrl} alt={club.name} className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-8 w-8" />
          )}
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
        <Button
          variant="outline"
          size="icon"
          onClick={() => setEditOpen(true)}
          aria-label="Editează detaliile clubului"
          className="absolute right-0 top-0 sm:static sm:ml-auto"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <EditClubDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        club={club}
        onSaved={(updated) => {
          setClub(updated);
          setSuccess(true);
        }}
      />
    </section>
  );
}

export default function ClubEdit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab = ['sportivi', 'examene'].includes(requested) ? requested : 'sportivi';

  function goToTab(value) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Club</h1>

      <ClubHeader />

      <Tabs value={tab} onValueChange={goToTab}>
        <TabsList>
          <TabsTrigger value="sportivi">Sportivi</TabsTrigger>
          <TabsTrigger value="examene">Examene</TabsTrigger>
        </TabsList>
        <TabsContent value="sportivi" className="pt-4">
          <RosterTab />
        </TabsContent>
        <TabsContent value="examene" className="pt-4">
          <ExamsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
