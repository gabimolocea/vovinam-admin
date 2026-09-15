import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  athleteAPI, gradeHistoryAPI, scoreAPI, visaAPI, seminarAPI, gradeAPI, competitionAPI, categoryAPI,
} from '@shared/lib/api';
import {
  Alert, Badge, Button, Checkbox, Skeleton, Input, Label, Req, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui';
import BeltBadge from '../components/BeltBadge';
import MedalIcon from '../components/MedalIcon';
import { ArrowLeft, Award, Check, Pencil, Plus, X } from 'lucide-react';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

const STATUS_LABELS = {
  pending: 'În așteptare',
  approved: 'Aprobat',
  rejected: 'Respins',
  revision_required: 'Necesită completări',
};
const PLACEMENT_LABELS = { '1st': '🥇 Locul 1', '2nd': '🥈 Locul 2', '3rd': '🥉 Locul 3' };
const RESULT_TYPE_LABELS = { solo: 'Solo', teams: 'Echipe', fight: 'Luptă' };

const NATIONAL_RIBBON = ['#002B7F', '#FCD116', '#CE1126'];
const EUROPEAN_RIBBON = ['#003399'];
const WORLD_RIBBON = ['#0f766e'];

const RESULT_LEVEL_TABS = [
  { key: 'national', label: 'Naționale' },
  { key: 'european', label: 'Europene' },
  { key: 'world', label: 'Mondiale' },
];

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'rezultate', label: 'Rezultate' },
  { key: 'grade', label: 'Istoric grade' },
  { key: 'seminarii', label: 'Seminarii' },
  { key: 'medical', label: 'Istoric Medical' },
  { key: 'vize', label: 'Vize anuale' },
];

function TabBar({ activeKey, onSelect }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
            activeKey === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SubTabs({ activeKey, onSelect }) {
  return (
    <div className="flex items-center gap-6 border-b border-border">
      {RESULT_LEVEL_TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`-mb-px whitespace-nowrap border-b-2 pb-2 text-sm font-semibold transition-colors ${
            activeKey === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Status pill styled for use on the dark hero - the generic `StatusBadge`
 * below relies on `bg-primary`/`border-border`, which are both the exact
 * same navy as the hero background here and become invisible against it. */
function HeroStatusBadge({ status }) {
  if (!status) return null;
  const className = {
    approved: 'bg-emerald-500 text-white',
    rejected: 'bg-red-500 text-white',
    pending: 'bg-amber-500 text-white',
    revision_required: 'bg-amber-600 text-white',
  }[status] || 'bg-white/20 text-white';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const className = {
    approved: 'border-transparent bg-emerald-100 text-emerald-800',
    rejected: 'border-transparent bg-red-100 text-red-800',
    pending: 'border-transparent bg-amber-100 text-amber-800',
    revision_required: 'border-transparent bg-amber-100 text-amber-800',
  }[status] || '';
  return <Badge className={className}>{STATUS_LABELS[status] || status}</Badge>;
}

function ReviewButtons({ busy, onApprove, onReject }) {
  return (
    <div className="mt-3 flex gap-2">
      <Button type="button" disabled={busy} onClick={onApprove}>
        <Check className="h-4 w-4" /> Aprobă
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onReject}>
        <X className="h-4 w-4" /> Respinge
      </Button>
    </div>
  );
}

/** Clickable thumbnail for an uploaded diploma/certificate/document, so a
 * reviewer can actually see the evidence instead of just a text link. */
function CertificateThumb({ src, label = 'Vezi documentul' }) {
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="mt-2 block w-fit" title={label}>
      <img src={src} alt={label} className="h-24 w-32 rounded-md border border-border object-cover transition hover:opacity-90" />
    </a>
  );
}

function FileField({ label, file, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="flex h-10 w-full rounded-md border border-input bg-background text-sm text-muted-foreground file:mr-3 file:h-full file:rounded-l-md file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium file:text-foreground"
      />
      {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  );
}

function EmptyTab({ message }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

/** European/World medal counts aren't scored in-app (the federation
 * doesn't organize those competitions in the platform) - just the
 * aggregate counts an admin enters manually, shown read-only here,
 * mirroring the public site's InternationalMedalsPanel. */
function InternationalMedalsPanel({ medals, ribbonColors }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/40 py-10">
      <div className="flex items-center rounded-md bg-foreground/5 px-3 py-2">
        {['gold', 'silver', 'bronze'].map((tier) => (
          <MedalIcon key={tier} tier={tier} ribbonColors={ribbonColors} count={medals[tier]} className="h-14 w-11" />
        ))}
      </div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Federația nu organizează competiții internaționale în aplicație - medaliile sunt introduse manual de un administrator.
      </p>
    </div>
  );
}

/** "Editează" - the athlete's own personal-record fields (name, birth date,
 * contact, license, emergency contact). Coach-editable for their own club
 * roster (backend: AthleteViewSet.update() trusts a club coach the same as
 * an admin, no re-review needed). */
function EditInfoDialog({ open, onOpenChange, athlete, onSaved }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && athlete) {
      setForm({
        first_name: athlete.first_name || '',
        last_name: athlete.last_name || '',
        date_of_birth: athlete.date_of_birth || '',
        gender: athlete.gender || '',
        mobile_number: athlete.mobile_number || '',
        address: athlete.address || '',
        cnp: athlete.cnp || '',
        license_series: athlete.license_series || '',
        emergency_contact_name: athlete.emergency_contact_name || '',
        emergency_contact_phone: athlete.emergency_contact_phone || '',
      });
      setError('');
    }
  }, [open, athlete]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await athleteAPI.update(athlete.id, form);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut salva modificările.');
    } finally {
      setSaving(false);
    }
  }

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editează datele sportivului</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_first_name">Prenume<Req /></Label>
              <Input id="edit_first_name" required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_last_name">Nume<Req /></Label>
              <Input id="edit_last_name" required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_dob">Data nașterii<Req /></Label>
              <Input id="edit_dob" type="date" required value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Gen</Label>
              <Select value={form.gender} onValueChange={(v) => update('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Nespecificat" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Masculin</SelectItem>
                  <SelectItem value="female">Feminin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_mobile">Telefon</Label>
              <Input id="edit_mobile" value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_cnp">CNP</Label>
              <Input id="edit_cnp" value={form.cnp} onChange={(e) => update('cnp', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="edit_address">Adresă</Label>
              <Textarea id="edit_address" rows={2} value={form.address} onChange={(e) => update('address', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_license">Serie legitimație</Label>
              <Input id="edit_license" value={form.license_series} onChange={(e) => update('license_series', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_emergency_name">Contact de urgență (nume)</Label>
              <Input id="edit_emergency_name" value={form.emergency_contact_name} onChange={(e) => update('emergency_contact_name', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_emergency_phone">Contact de urgență (telefon)</Label>
              <Input id="edit_emergency_phone" value={form.emergency_contact_phone} onChange={(e) => update('emergency_contact_phone', e.target.value)} />
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

function AddResultDialog({ open, onOpenChange, athlete, onCreated }) {
  const [competitions, setCompetitions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clubmates, setClubmates] = useState([]);
  const [form, setForm] = useState({ event: '', category: '', placement_claimed: '1st', team_members: [] });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedCategory = categories.find((c) => String(c.id) === form.category);
  const isTeam = selectedCategory?.type === 'team';

  // Mirrors Team.name / build_team_display_name in backend/api/models/teams.py:
  // a team has no editable name, it's always derived from its members.
  const teamMemberNames = [athlete, ...clubmates.filter((m) => form.team_members.includes(m.id))]
    .map((a) => `${a.first_name} ${a.last_name}`.trim())
    .filter(Boolean);
  const teamName = (() => {
    if (!teamMemberNames.length) return '';
    const visible = teamMemberNames.slice(0, 3);
    const extra = teamMemberNames.length - visible.length;
    return visible.join(' & ') + (extra > 0 ? ` (+${extra})` : '');
  })();

  useEffect(() => {
    if (open) {
      competitionAPI.list({ event_type: 'competition' }).then((r) => setCompetitions(r.data?.results ?? r.data ?? [])).catch(() => {});
      athleteAPI.list({ my_club: true }).then((r) => setClubmates((r.data?.results ?? r.data ?? []).filter((a) => a.id !== athlete.id))).catch(() => {});
      setForm({ event: '', category: '', placement_claimed: '1st', team_members: [] });
      setCategories([]);
      setFile(null);
      setError('');
    }
  }, [open, athlete.id]);

  useEffect(() => {
    if (form.event) {
      categoryAPI.list({ event: form.event }).then((r) => setCategories(r.data?.results ?? r.data ?? [])).catch(() => setCategories([]));
    } else {
      setCategories([]);
    }
  }, [form.event]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value, ...(field === 'event' ? { category: '' } : {}) }));
  }

  function toggleTeamMember(id, checked) {
    setForm((f) => ({
      ...f,
      team_members: checked ? [...f.team_members, id] : f.team_members.filter((m) => m !== id),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('category', form.category);
      formData.append('placement_claimed', form.placement_claimed);
      formData.append('type', isTeam ? 'teams' : (selectedCategory?.type || 'solo'));
      if (isTeam) {
        formData.append('team_name', teamName);
        form.team_members.forEach((id) => formData.append('team_members', id));
      }
      if (file) formData.append('certificate_image', file);
      await scoreAPI.create(formData);
      onCreated();
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adaugă rezultat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Competiție<Req /></Label>
            <Select value={form.event} onValueChange={(v) => update('event', v)}>
              <SelectTrigger><SelectValue placeholder="Alege competiția" /></SelectTrigger>
              <SelectContent>
                {competitions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Categorie<Req /></Label>
            <Select value={form.category} onValueChange={(v) => update('category', v)} disabled={!form.event}>
              <SelectTrigger><SelectValue placeholder={form.event ? 'Alege categoria' : 'Alege mai întâi competiția'} /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Loc obținut<Req /></Label>
            <Select value={form.placement_claimed} onValueChange={(v) => update('placement_claimed', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1st">Locul 1</SelectItem>
                <SelectItem value="2nd">Locul 2</SelectItem>
                <SelectItem value="3rd">Locul 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isTeam && (
            <>
              <div className="flex flex-col gap-1">
                <Label>Colegi de echipă</Label>
                <p className="text-xs text-muted-foreground">{athlete.first_name} {athlete.last_name} este inclus automat. Bifează ceilalți membri din club.</p>
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-input p-2">
                  {clubmates.length === 0 && <p className="text-sm text-muted-foreground">Niciun alt sportiv în club.</p>}
                  {clubmates.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.team_members.includes(m.id)}
                        onCheckedChange={(checked) => toggleTeamMember(m.id, checked)}
                      />
                      {m.first_name} {m.last_name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Nume echipă (generat automat)</Label>
                <Input value={teamName} disabled readOnly />
              </div>
            </>
          )}
          <FileField label="Poză diplomă / certificat (opțional)" file={file} onChange={setFile} />
          <DialogFooter>
            <Button type="submit" disabled={saving || !form.category}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddGradeDialog({ open, onOpenChange, athlete, onCreated }) {
  const [grades, setGrades] = useState([]);
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState({ grade: '', event: '', obtained_date: '', level: 'good' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      gradeAPI.list().then((r) => setGrades(r.data?.results ?? r.data ?? [])).catch(() => {});
      competitionAPI.list({ event_type: 'examination' }).then((r) => setExams(r.data?.results ?? r.data ?? [])).catch(() => {});
      setForm({ grade: '', event: '', obtained_date: '', level: 'good' });
      setFile(null);
      setError('');
    }
  }, [open]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('grade', form.grade);
      if (form.event) formData.append('event', form.event);
      formData.append('obtained_date', form.obtained_date);
      formData.append('level', form.level);
      if (file) formData.append('certificate_image', file);
      await gradeHistoryAPI.submissions.create(formData);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut înregistra gradul.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adaugă grad</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Grad<Req /></Label>
            <Select value={form.grade} onValueChange={(v) => update('grade', v)}>
              <SelectTrigger><SelectValue placeholder="Alege gradul" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Examen</Label>
            <Select value={form.event} onValueChange={(v) => update('event', v)}>
              <SelectTrigger><SelectValue placeholder="Fără examen asociat" /></SelectTrigger>
              <SelectContent>
                {exams.map((ev) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade_date">Data obținerii<Req /></Label>
              <Input id="grade_date" type="date" required value={form.obtained_date} onChange={(e) => update('obtained_date', e.target.value)} />
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
          <FileField label="Poză certificat de grad (opțional)" file={file} onChange={setFile} />
          <DialogFooter>
            <Button type="submit" disabled={saving || !form.grade}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSeminarDialog({ open, onOpenChange, athlete, onCreated }) {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ event: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      competitionAPI.list({ event_type: 'training_seminar' }).then((r) => setEvents(r.data?.results ?? r.data ?? [])).catch(() => {});
      setForm({ event: '' });
      setFile(null);
      setError('');
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('event', form.event);
      if (file) formData.append('participation_certificate', file);
      await seminarAPI.submissions.create(formData);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut înregistra participarea.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adaugă participare la seminar</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Eveniment<Req /></Label>
            <Select value={form.event} onValueChange={(v) => setForm({ event: v })}>
              <SelectTrigger><SelectValue placeholder="Alege seminarul" /></SelectTrigger>
              <SelectContent>
                {events.map((ev) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <FileField label="Poză certificat de participare (opțional)" file={file} onChange={setFile} />
          <DialogFooter>
            <Button type="submit" disabled={saving || !form.event}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddVisaDialog({ open, onOpenChange, athlete, visaType, onCreated }) {
  const [form, setForm] = useState({ issued_date: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ issued_date: '' });
      setFile(null);
      setError('');
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('visa_type', visaType);
      formData.append('issued_date', form.issued_date);
      if (file) formData.append('image', file);
      await visaAPI.submissions.create(formData);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut înregistra viza.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adaugă viză {visaType === 'medical' ? 'medicală' : 'anuală'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="visa_date">Data emiterii<Req /></Label>
            <Input id="visa_date" type="date" required value={form.issued_date} onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))} />
          </div>
          <FileField label={visaType === 'medical' ? 'Poză legitimație / dovadă control medical (opțional)' : 'Poză document (opțional)'} file={file} onChange={setFile} />
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AthleteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'info';
  const [resultsLevel, setResultsLevel] = useState('national');

  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewBusyKey, setReviewBusyKey] = useState(null);
  const [reviewError, setReviewError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [addResultOpen, setAddResultOpen] = useState(false);
  const [addGradeOpen, setAddGradeOpen] = useState(false);
  const [addSeminarOpen, setAddSeminarOpen] = useState(false);
  const [addVisaType, setAddVisaType] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await athleteAPI.getPublic(id);
      setAthlete(res.data);
    } catch {
      setError('Nu am putut încărca profilul sportivului.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function setTab(key) {
    setSearchParams(key === 'info' ? {} : { tab: key });
  }

  const canReview = Boolean(athlete?.can_edit);

  async function reviewPhoto(approve) {
    setReviewBusyKey('photo');
    setReviewError('');
    try {
      if (approve) await athleteAPI.approveImage(athlete.id);
      else await athleteAPI.rejectImage(athlete.id, 'Poza nu a fost aprobată.');
      await load();
    } catch {
      setReviewError('Nu am putut procesa poza de profil.');
    } finally {
      setReviewBusyKey(null);
    }
  }

  const REVIEW_API = {
    grade: gradeHistoryAPI.submissions,
    result: scoreAPI,
    'medical-visa': visaAPI.submissions,
    'annual-visa': visaAPI.submissions,
    seminar: seminarAPI.submissions,
  };
  const REVIEW_REJECT_NOTE = {
    grade: 'Examenul de grad nu a fost aprobat.',
    result: 'Rezultatul nu a fost aprobat.',
    'medical-visa': 'Viza nu a fost aprobată.',
    'annual-visa': 'Viza nu a fost aprobată.',
    seminar: 'Participarea la seminar nu a fost aprobată.',
  };

  async function reviewItem(kind, itemId, approve) {
    setReviewBusyKey(`${kind}-${itemId}`);
    setReviewError('');
    try {
      const api = REVIEW_API[kind];
      if (approve) await api.approve(itemId, {});
      else await api.reject(itemId, { notes: REVIEW_REJECT_NOTE[kind] });
      await load();
    } catch {
      setReviewError('Nu am putut procesa cererea.');
    } finally {
      setReviewBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !athlete) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Înapoi
        </Button>
        <Alert variant="destructive">{error || 'Sportiv negăsit.'}</Alert>
      </div>
    );
  }

  const isPhotoPending = athlete.profile_image_status === 'pending';
  const results = athlete.results || [];
  const medals = athlete.medals || { gold: 0, silver: 0, bronze: 0 };
  const europeanMedals = athlete.international_medals?.european || { gold: 0, silver: 0, bronze: 0 };
  const worldMedals = athlete.international_medals?.world || { gold: 0, silver: 0, bronze: 0 };

  return (
    <div className="flex flex-col gap-5">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="w-fit">
        <ArrowLeft className="h-4 w-4" /> Înapoi la sportivi
      </Button>

      {reviewError && <Alert variant="destructive">{reviewError}</Alert>}

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 rounded-lg bg-sidebar px-6 py-6 text-sidebar-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="relative aspect-[3/2] w-40 shrink-0 overflow-hidden rounded-lg bg-white/10 sm:w-48">
            {isPhotoPending && athlete.pending_profile_image ? (
              canReview ? (
                <a href={athlete.pending_profile_image} target="_blank" rel="noopener noreferrer" title="Vezi poza la dimensiune completă">
                  <img src={athlete.pending_profile_image} alt={athlete.full_name} className="h-full w-full object-cover" />
                </a>
              ) : (
                <img src={athlete.pending_profile_image} alt={athlete.full_name} className="h-full w-full object-cover opacity-50 grayscale" />
              )
            ) : athlete.profile_image ? (
              <img src={athlete.profile_image} alt={athlete.full_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-display font-bold text-white/40">
                {athlete.first_name?.[0]}{athlete.last_name?.[0]}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <h1 className="font-display text-xl font-bold">{athlete.full_name}</h1>
            {athlete.current_grade?.name && <BeltBadge grade={athlete.current_grade.name} />}
            <HeroStatusBadge status={athlete.status} />
            {canReview && isPhotoPending && (
              <div className="flex flex-col items-center gap-1 sm:items-start">
                <span className="text-xs text-white/70">Poză de profil în așteptare</span>
                <ReviewButtons busy={reviewBusyKey === 'photo'} onApprove={() => reviewPhoto(true)} onReject={() => reviewPhoto(false)} />
              </div>
            )}
          </div>
        </div>
        {canReview && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="border-white/30 bg-transparent text-white hover:bg-white/10">
            <Pencil className="h-3.5 w-3.5" /> Editează
          </Button>
        )}
      </div>

      <TabBar activeKey={tab} onSelect={setTab} />

      {tab === 'info' && (
        <div className="flex flex-col">
          <InfoRow label="Club" value={athlete.club?.name} />
          <InfoRow label="Oraș" value={athlete.city?.name} />
          <InfoRow label="Data nașterii" value={fmtDate(athlete.date_of_birth)} />
          <InfoRow label="Roluri" value={[athlete.is_coach && 'Antrenor', athlete.is_referee && 'Arbitru'].filter(Boolean).join(', ') || 'Sportiv'} />
          {canReview && (
            <>
              <InfoRow label="CNP" value={athlete.cnp} />
              <InfoRow label="Serie legitimație" value={athlete.license_series} />
              <InfoRow label="Telefon" value={athlete.mobile_number} />
              <InfoRow label="Adresă" value={athlete.address} />
              <InfoRow label="Data înregistrării" value={fmtDate(athlete.registered_date)} />
              <InfoRow label="Expirare legitimație" value={fmtDate(athlete.expiration_date)} />
              <InfoRow label="Contact urgență" value={athlete.emergency_contact_name} />
              <InfoRow label="Telefon urgență" value={athlete.emergency_contact_phone} />
            </>
          )}
        </div>
      )}

      {tab === 'rezultate' && (
        <div className="flex flex-col gap-4">
          <SubTabs activeKey={resultsLevel} onSelect={setResultsLevel} />

          {resultsLevel === 'national' && (
            <>
              {canReview && (
                <Button className="w-fit" onClick={() => setAddResultOpen(true)}>
                  <Plus className="h-4 w-4" /> Adaugă rezultat
                </Button>
              )}
              {results.length === 0 ? (
                <EmptyTab message="Niciun rezultat înregistrat." />
              ) : (
                <ul className="flex flex-col gap-3">
                  {results.map((r) => (
                    <li key={r.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{r.competition || '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.category || '—'}{r.team_name ? ` (${r.team_name})` : ''} · {RESULT_TYPE_LABELS[r.type] || r.type}
                            {r.group_name ? ` · ${r.group_name}` : ''}
                          </p>
                          {r.team_members?.length > 0 && (
                            <p className="text-xs text-muted-foreground">Membri: {r.team_members.join(' · ')}</p>
                          )}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-sm font-semibold">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</p>
                      {r.status === 'rejected' && r.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{r.admin_notes}</p>}
                      <CertificateThumb src={r.certificate_image} label="Vezi diploma" />
                      {canReview && r.status === 'pending' && (
                        <ReviewButtons busy={reviewBusyKey === `result-${r.id}`} onApprove={() => reviewItem('result', r.id, true)} onReject={() => reviewItem('result', r.id, false)} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {resultsLevel === 'european' && (
            <InternationalMedalsPanel medals={europeanMedals} ribbonColors={EUROPEAN_RIBBON} />
          )}

          {resultsLevel === 'world' && (
            <InternationalMedalsPanel medals={worldMedals} ribbonColors={WORLD_RIBBON} />
          )}
        </div>
      )}

      {tab === 'grade' && (
        <div className="flex flex-col gap-4">
          {canReview && (
            <Button className="w-fit" onClick={() => setAddGradeOpen(true)}>
              <Plus className="h-4 w-4" /> Adaugă grad
            </Button>
          )}
          {(athlete.grade_history || []).length === 0 ? (
            <EmptyTab message="Niciun grad înregistrat." />
          ) : (
            <ul className="flex flex-col gap-3">
              {athlete.grade_history.map((g) => (
                <li key={g.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{g.grade?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(g.obtained_date)}{g.event ? ` · ${g.event}` : ''}
                      </p>
                      {(g.examiner_1_name || g.examiner_2_name) && (
                        <p className="text-xs text-muted-foreground">Examinatori: {[g.examiner_1_name, g.examiner_2_name].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <StatusBadge status={g.status} />
                  </div>
                  {g.status === 'rejected' && g.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{g.admin_notes}</p>}
                  <CertificateThumb src={g.certificate_image} label="Vezi certificatul" />
                  {canReview && g.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `grade-${g.id}`} onApprove={() => reviewItem('grade', g.id, true)} onReject={() => reviewItem('grade', g.id, false)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'seminarii' && (
        <div className="flex flex-col gap-4">
          {canReview && (
            <Button className="w-fit" onClick={() => setAddSeminarOpen(true)}>
              <Plus className="h-4 w-4" /> Adaugă participare
            </Button>
          )}
          {(athlete.seminars || []).length === 0 ? (
            <EmptyTab message="Nicio participare la seminarii." />
          ) : (
            <ul className="flex flex-col gap-3">
              {athlete.seminars.map((s) => (
                <li key={s.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{s.event || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(s.start_date)}{s.end_date ? ` – ${fmtDate(s.end_date)}` : ''}{s.place ? ` · ${s.place}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  {s.status === 'rejected' && s.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{s.admin_notes}</p>}
                  <CertificateThumb src={s.certificate_image} label="Vezi certificatul" />
                  {canReview && s.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `seminar-${s.id}`} onApprove={() => reviewItem('seminar', s.id, true)} onReject={() => reviewItem('seminar', s.id, false)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'medical' && (
        <div className="flex flex-col gap-4">
          {canReview && (
            <Button className="w-fit" onClick={() => setAddVisaType('medical')}>
              <Plus className="h-4 w-4" /> Adaugă viză medicală
            </Button>
          )}
          {(athlete.medical_visas || []).length === 0 ? (
            <EmptyTab message="Nicio viză medicală înregistrată." />
          ) : (
            <ul className="flex flex-col gap-2">
              {athlete.medical_visas.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 rounded-md border border-border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5 text-muted-foreground" /> Viză medicală</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{fmtDate(v.issued_date)}</span>
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                  {v.status === 'rejected' && v.admin_notes && <p className="text-xs text-muted-foreground">{v.admin_notes}</p>}
                  <CertificateThumb src={v.certificate_image} label="Vezi documentul" />
                  {canReview && v.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `medical-visa-${v.id}`} onApprove={() => reviewItem('medical-visa', v.id, true)} onReject={() => reviewItem('medical-visa', v.id, false)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'vize' && (
        <div className="flex flex-col gap-4">
          {canReview && (
            <Button className="w-fit" onClick={() => setAddVisaType('annual')}>
              <Plus className="h-4 w-4" /> Adaugă viză anuală
            </Button>
          )}
          {(athlete.annual_visas || []).length === 0 ? (
            <EmptyTab message="Nicio viză anuală înregistrată." />
          ) : (
            <ul className="flex flex-col gap-2">
              {athlete.annual_visas.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 rounded-md border border-border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5 text-muted-foreground" /> Viză anuală</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{fmtDate(v.issued_date)}</span>
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                  {v.status === 'rejected' && v.admin_notes && <p className="text-xs text-muted-foreground">{v.admin_notes}</p>}
                  <CertificateThumb src={v.certificate_image} label="Vezi documentul" />
                  {canReview && v.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `annual-visa-${v.id}`} onApprove={() => reviewItem('annual-visa', v.id, true)} onReject={() => reviewItem('annual-visa', v.id, false)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <EditInfoDialog open={editOpen} onOpenChange={setEditOpen} athlete={athlete} onSaved={load} />
      <AddResultDialog open={addResultOpen} onOpenChange={setAddResultOpen} athlete={athlete} onCreated={load} />
      <AddGradeDialog open={addGradeOpen} onOpenChange={setAddGradeOpen} athlete={athlete} onCreated={load} />
      <AddSeminarDialog open={addSeminarOpen} onOpenChange={setAddSeminarOpen} athlete={athlete} onCreated={load} />
      <AddVisaDialog open={!!addVisaType} onOpenChange={(v) => !v && setAddVisaType(null)} athlete={athlete} visaType={addVisaType} onCreated={load} />
    </div>
  );
}
