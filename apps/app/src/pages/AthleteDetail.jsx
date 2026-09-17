import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@shared';
import {
  athleteAPI, gradeHistoryAPI, scoreAPI, visaAPI, seminarAPI, gradeAPI, competitionAPI, categoryAPI, groupAPI, MEDIA_BASE_URL,
} from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import {
  Alert, Badge, Button, Checkbox, Skeleton, Input, Label, Req, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui';
import BeltBadge from '../components/BeltBadge';
import MedalIcon from '../components/MedalIcon';
import GalleryTab from '../components/GalleryTab';
import Lightbox from '../components/Lightbox';
import ResponsiveTable from '../components/ResponsiveTable';
import { ArrowLeft, Award, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, LogOut, Pencil, Plus, Sparkles, X } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

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
  { key: 'grade', label: 'Examene' },
  { key: 'seminarii', label: 'Stagii' },
  { key: 'medical', label: 'Vize medicale' },
  { key: 'vize', label: 'Vize anuale' },
  { key: 'poze', label: 'Media' },
];

/** Compact pill tab bar - horizontally scrollable with no visible
 * scrollbar (hidden via CSS), with left/right chevrons for navigation
 * that only render when there's actually more content to scroll to in
 * that direction. Mirrors the public site's own ScrollableTabs. */
function TabBar({ activeKey, onSelect }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    function update() {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  function scrollByStep(direction) {
    scrollRef.current?.scrollBy({ left: direction * 160, behavior: 'smooth' });
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {canScrollLeft && (
        <button type="button" aria-label="Derulează la stânga" onClick={() => scrollByStep(-1)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div ref={scrollRef} role="tablist" className="scrollbar-hide flex flex-1 items-center gap-0.5 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeKey === key}
            onClick={() => onSelect(key)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold tracking-wide transition-all ${
              activeKey === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {canScrollRight && (
        <button type="button" aria-label="Derulează la dreapta" onClick={() => scrollByStep(1)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
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

/** `light` is for placement directly on the dark hero background (see the
 * photo-review usage below) - the default `bg-primary` is the exact same
 * navy as that background (both `219 48% 17%`), so the approve button
 * would otherwise render with no visible fill, just its icon and text. */
function ReviewButtons({ busy, onApprove, onReject, light = false }) {
  return (
    <div className="mt-3 flex gap-2">
      <Button
        type="button"
        disabled={busy}
        onClick={onApprove}
        className={light ? 'bg-white text-sidebar hover:bg-white/90' : undefined}
      >
        <Check className="h-4 w-4" /> Aprobă
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onReject}
        className={light ? 'border-white/40 bg-transparent text-white hover:bg-white/10' : undefined}
      >
        <X className="h-4 w-4" /> Respinge
      </Button>
    </div>
  );
}

/** Clickable thumbnail for an uploaded diploma/certificate/document -
 * always opens in the shared Lightbox (zoom/download) rather than a new
 * tab, same as every other reviewer/self-view image in the app. */
function CertificateThumb({ src, label = 'Vezi documentul', onOpen }) {
  const url = imgUrl(src);
  if (!url) return null;
  return (
    <button type="button" onClick={() => onOpen({ image: url, alt_text: label })} className="mt-2 block w-fit" title={label}>
      <img src={url} alt={label} className="h-24 w-32 rounded-md border border-border object-cover transition hover:opacity-90" />
    </button>
  );
}

function FileField({ label, file, onChange, required = false }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}{required && <Req />}</Label>
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

/** One competition level's column of 3 medal icons (gold/silver/bronze),
 * label above the icons - mirrors the public profile's own hero. */
function MedalGroup({ label, medals, ribbonColors }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{label}</span>
      <div className="flex items-center rounded-md bg-white/10 px-1.5 py-1">
        {['gold', 'silver', 'bronze'].map((tier) => (
          <MedalIcon key={tier} tier={tier} ribbonColors={ribbonColors} count={medals[tier]} className="h-7 w-6" />
        ))}
      </div>
    </div>
  );
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
function EditInfoDialog({ open, onOpenChange, athlete, onSaved, canManageRole }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Identity/license data is locked once the profile is approved - editing
  // it afterwards would let it drift from what was actually reviewed, so an
  // approved athlete's coach has to go through revision/re-review instead
  // of quietly changing it here.
  const isApproved = athlete?.status === 'approved';

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
        license_number: athlete.license_number || '',
        emergency_contact_name: athlete.emergency_contact_name || '',
        emergency_contact_phone: athlete.emergency_contact_phone || '',
        is_coach: athlete.is_coach || false,
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
      // The locked identity/license fields aren't shown once approved (see
      // isApproved above) - don't resend their original values either, so a
      // stale/malformed one already on the record (e.g. a missing
      // date_of_birth) can't fail validation on a save that never touched it.
      const payload = isApproved
        ? {
          mobile_number: form.mobile_number,
          address: form.address,
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
          is_coach: form.is_coach,
        }
        : form;
      await athleteAPI.update(athlete.id, payload);
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
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Editează datele sportivului</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          {isApproved && (
            <Alert>Datele de identitate și legitimația nu mai pot fi modificate după aprobare.</Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {!isApproved && (
              <>
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
              </>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit_mobile">Telefon</Label>
              <Input id="edit_mobile" value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
            </div>
            {!isApproved && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="edit_cnp">CNP</Label>
                <Input id="edit_cnp" value={form.cnp} onChange={(e) => update('cnp', e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="edit_address">Adresă</Label>
              <Textarea id="edit_address" rows={2} value={form.address} onChange={(e) => update('address', e.target.value)} />
            </div>
            {canManageRole && (
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox checked={form.is_coach} onCheckedChange={(checked) => update('is_coach', checked === true)} />
                  Antrenor
                </label>
              </div>
            )}
            {!isApproved && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="edit_license">Serie legitimație</Label>
                  <Input id="edit_license" value={form.license_series} onChange={(e) => update('license_series', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="edit_license_number">Număr legitimație</Label>
                  <Input id="edit_license_number" value={form.license_number} onChange={(e) => update('license_number', e.target.value)} />
                </div>
              </>
            )}
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
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clubmates, setClubmates] = useState([]);
  const [form, setForm] = useState({ event: '', group: '', category: '', placement_claimed: '1st', team_members: [] });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const categoriesInGroup = form.group ? categories.filter((c) => String(c.group) === form.group) : categories;
  const selectedCategory = categoriesInGroup.find((c) => String(c.id) === form.category);
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
      setForm({ event: '', group: '', category: '', placement_claimed: '1st', team_members: [] });
      setGroups([]);
      setCategories([]);
      setFile(null);
      setError('');
      setAiNote('');
    }
  }, [open, athlete.id]);

  useEffect(() => {
    if (form.event) {
      groupAPI.list({ event: form.event }).then((r) => setGroups(r.data?.results ?? r.data ?? [])).catch(() => setGroups([]));
      categoryAPI.list({ event: form.event }).then((r) => setCategories(r.data?.results ?? r.data ?? [])).catch(() => setCategories([]));
    } else {
      setGroups([]);
      setCategories([]);
    }
  }, [form.event]);

  function update(field, value) {
    setForm((f) => ({
      ...f,
      [field]: value,
      ...(field === 'event' ? { group: '', category: '' } : {}),
      ...(field === 'group' ? { category: '' } : {}),
    }));
  }

  function toggleTeamMember(id, checked) {
    setForm((f) => ({
      ...f,
      team_members: checked ? [...f.team_members, id] : f.team_members.filter((m) => m !== id),
    }));
  }

  async function handleAiAutofill() {
    if (!file) {
      setError('Încarcă mai întâi poza cu diploma pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await scoreAPI.extractDiploma(formData);
      const suggested = data?.suggested || {};
      setForm((f) => ({
        ...f,
        event: suggested.event_id ? String(suggested.event_id) : f.event,
        group: suggested.group_id ? String(suggested.group_id) : f.group,
        category: suggested.category_id ? String(suggested.category_id) : f.category,
        placement_claimed: suggested.placement_claimed || f.placement_claimed,
      }));
      setAiNote('Câmpurile au fost completate automat pe baza diplomei. Verifică-le înainte de a adăuga.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Este necesară o fotografie cu diploma.');
      return;
    }
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
      formData.append('certificate_image', file);
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
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Adaugă rezultat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <FileField label="Poză diplomă / certificat" file={file} onChange={setFile} required />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 w-fit"
              disabled={aiBusy || !file}
              onClick={handleAiAutofill}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy ? 'Se completează…' : 'Completează automat cu AI'}
            </Button>
            {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
          </div>
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
            <Label>Grupă</Label>
            <Select value={form.group} onValueChange={(v) => update('group', v)} disabled={!form.event || groups.length === 0}>
              <SelectTrigger><SelectValue placeholder={!form.event ? 'Alege mai întâi competiția' : groups.length === 0 ? 'Fără grupe' : 'Alege grupa'} /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Categorie<Req /></Label>
            <Select value={form.category} onValueChange={(v) => update('category', v)} disabled={!form.event}>
              <SelectTrigger><SelectValue placeholder={form.event ? 'Alege categoria' : 'Alege mai întâi competiția'} /></SelectTrigger>
              <SelectContent>
                {categoriesInGroup.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
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
          <DialogFooter>
            <Button type="submit" disabled={saving || !form.category || !file}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  useEffect(() => {
    if (open) {
      gradeAPI.list().then((r) => setGrades(r.data?.results ?? r.data ?? [])).catch(() => {});
      competitionAPI.list({ event_type: 'examination' }).then((r) => setExams(r.data?.results ?? r.data ?? [])).catch(() => {});
      setForm({ grade: '', event: '', obtained_date: '', level: 'good' });
      setFile(null);
      setError('');
      setAiNote('');
    }
  }, [open]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAiAutofill() {
    if (!file) {
      setError('Încarcă mai întâi poza cu certificatul pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await gradeHistoryAPI.submissions.extractDiploma(formData);
      const suggested = data?.suggested || {};
      setForm((f) => ({
        ...f,
        grade: suggested.grade_id ? String(suggested.grade_id) : f.grade,
        event: suggested.event_id ? String(suggested.event_id) : f.event,
        obtained_date: suggested.obtained_date || f.obtained_date,
      }));
      setAiNote('Câmpurile au fost completate automat pe baza certificatului. Verifică-le înainte de a adăuga.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Este necesară o fotografie cu certificatul.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('grade', form.grade);
      if (form.event) formData.append('event', form.event);
      formData.append('obtained_date', form.obtained_date);
      formData.append('level', form.level);
      formData.append('certificate_image', file);
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
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Adaugă grad</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <FileField label="Poză certificat de grad" file={file} onChange={setFile} required />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 w-fit"
              disabled={aiBusy || !file}
              onClick={handleAiAutofill}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy ? 'Se completează…' : 'Completează automat cu AI'}
            </Button>
            {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
          </div>
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
          <DialogFooter>
            <Button type="submit" disabled={saving || !form.grade || !file}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  useEffect(() => {
    if (open) {
      competitionAPI.list({ event_type: 'training_seminar' }).then((r) => setEvents(r.data?.results ?? r.data ?? [])).catch(() => {});
      setForm({ event: '' });
      setFile(null);
      setError('');
      setAiNote('');
    }
  }, [open]);

  async function handleAiAutofill() {
    if (!file) {
      setError('Încarcă mai întâi poza cu certificatul pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await seminarAPI.submissions.extractDiploma(formData);
      const suggested = data?.suggested || {};
      setForm((f) => ({ ...f, event: suggested.event_id ? String(suggested.event_id) : f.event }));
      setAiNote('Câmpurile au fost completate automat pe baza certificatului. Verifică-le înainte de a adăuga.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Este necesară o fotografie cu certificatul de participare.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('event', form.event);
      formData.append('participation_certificate', file);
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
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Adaugă participare la seminar</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <FileField label="Poză certificat de participare" file={file} onChange={setFile} required />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 w-fit"
              disabled={aiBusy || !file}
              onClick={handleAiAutofill}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy ? 'Se completează…' : 'Completează automat cu AI'}
            </Button>
            {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label>Eveniment<Req /></Label>
            <Select value={form.event} onValueChange={(v) => setForm({ event: v })}>
              <SelectTrigger><SelectValue placeholder="Alege seminarul" /></SelectTrigger>
              <SelectContent>
                {events.map((ev) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !form.event || !file}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ issued_date: '' });
      setFile(null);
      setError('');
      setAiNote('');
    }
  }, [open]);

  async function handleAiAutofill() {
    if (!file) {
      setError('Încarcă mai întâi poza cu legitimația pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await visaAPI.submissions.extractDiploma(formData);
      const suggested = data?.suggested || {};
      setForm((f) => ({ ...f, issued_date: suggested.issued_date || f.issued_date }));
      setAiNote('Data a fost completată automat pe baza legitimației. Verific-o înainte de a adăuga.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează data manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Este necesară o fotografie cu documentul.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('athlete', athlete.id);
      formData.append('visa_type', visaType);
      formData.append('issued_date', form.issued_date);
      formData.append('image', file);
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
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Adaugă viză {visaType === 'medical' ? 'medicală' : 'anuală'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <FileField
              label={visaType === 'medical' ? 'Poză legitimație / dovadă control medical' : 'Poză document'}
              file={file}
              onChange={setFile}
              required
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 w-fit"
              disabled={aiBusy || !file}
              onClick={handleAiAutofill}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy ? 'Se completează…' : 'Completează automat cu AI'}
            </Button>
            {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="visa_date">Data emiterii<Req /></Label>
            <Input id="visa_date" type="date" required value={form.issued_date} onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !file}>{saving ? 'Se salvează…' : 'Adaugă'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Preview dialog shown after picking a new profile photo - matches the
 * "confirm before it's applied/sent for approval" flow used everywhere
 * else this photo-edit affordance appears (public site, athlete dashboard). */
function PhotoPreviewDialog({ preview, uploading, error, onConfirm, onCancel }) {
  return (
    <Dialog open={!!preview} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Previzualizare poză de profil</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {preview && (
            <img
              src={preview.url}
              alt="Previzualizare poză de profil"
              className="aspect-[3/2] w-full max-w-sm rounded-lg object-cover"
            />
          )}
          <Alert>Orice schimbare a pozei de profil necesită aprobarea unui admin sau antrenor înainte de a deveni vizibilă public.</Alert>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex w-full gap-3">
            <Button type="button" disabled={uploading} onClick={onConfirm} className="flex-1">
              {uploading ? 'Se trimite…' : 'Trimite'}
            </Button>
            <Button type="button" variant="outline" disabled={uploading} onClick={onCancel} className="flex-1">
              Anulează
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AthleteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isSelf = user?.athlete_id != null && String(user.athlete_id) === String(id);
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [certificatePreview, setCertificatePreview] = useState(null);
  const photoInputRef = useRef(null);

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
  // A coach can't review/approve their own pending submissions - even
  // though they're their own club's reviewer, that'd be self-approval.
  // Everything else canReview gates (seeing CNP/phone, editing, adding a
  // result/grade/etc) still applies to a coach viewing their own profile.
  const canApprove = canReview && !isSelf;

  // Below `lg`, the sidebar's own bottom tab bar has no room for a
  // "Deconectare" tab anymore (nav items + a direct site link already fill
  // it) - it lives here instead, on your own profile only, since that's
  // the one place every role always lands on first.
  async function handleLogout() {
    await logout();
    navigate('/');
  }

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

  // Selecting a file just stages it locally (object URL preview) - nothing
  // is uploaded until confirmed. A coach uploading their own photo applies
  // instantly (backend trusts a coach's own upload); for a roster athlete
  // it's staged the same way as an athlete's own self-submission would be,
  // needing a coach/admin to review it.
  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  function cancelPhotoUpload() {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function confirmPhotoUpload() {
    if (!photoPreview) return;
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      await athleteAPI.updatePhoto(athlete.id, photoPreview.file);
      URL.revokeObjectURL(photoPreview.url);
      setPhotoPreview(null);
      await load();
    } catch {
      setPhotoError('Nu am putut încărca poza. Încearcă din nou.');
    } finally {
      setUploadingPhoto(false);
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
      {!isSelf && (
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Înapoi la sportivi
        </Button>
      )}

      {reviewError && <Alert variant="destructive">{reviewError}</Alert>}

      {/* Hero */}
      <div className="relative flex flex-col items-center gap-4 rounded-lg bg-sidebar px-6 py-6 text-sidebar-foreground sm:flex-row sm:items-center sm:justify-between">
        {isSelf && (
          <button
            type="button"
            onClick={handleLogout}
            title="Deconectare"
            aria-label="Deconectare"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 lg:hidden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="relative aspect-[3/2] w-40 shrink-0 bg-white/10 sm:w-52">
            {isPhotoPending && athlete.pending_profile_image ? (
              canReview ? (
                <button
                  type="button"
                  onClick={() => setCertificatePreview({ image: imgUrl(athlete.pending_profile_image), alt_text: 'Poză de profil în așteptare' })}
                  title="Vezi poza la dimensiune completă"
                  className="block h-full w-full"
                >
                  <img src={imgUrl(athlete.pending_profile_image)} alt={athlete.full_name} className="h-full w-full rounded-lg object-cover" />
                </button>
              ) : (
                <img src={imgUrl(athlete.pending_profile_image)} alt={athlete.full_name} className="h-full w-full rounded-lg object-cover opacity-50 grayscale" />
              )
            ) : athlete.profile_image ? (
              <img src={imgUrl(athlete.profile_image)} alt={athlete.full_name} className="h-full w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg text-2xl font-display font-bold text-white/40">
                {athlete.first_name?.[0]}{athlete.last_name?.[0]}
              </div>
            )}
            {isPhotoPending && athlete.pending_profile_image && (
              <span
                className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                title="Poză în așteptarea aprobării"
              >
                <Clock className="h-3 w-3" />
              </span>
            )}
            {athlete.club?.logo && (
              <img
                src={imgUrl(athlete.club.logo)}
                alt={athlete.club.name}
                title={athlete.club.name}
                className="absolute -right-3 -top-3 h-14 w-14 rounded-full object-contain drop-shadow-md"
              />
            )}
            {canReview && (
              <>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingPhoto || (isPhotoPending && !isSelf)}
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute bottom-1 right-1 h-7 w-7 rounded-full border-white/40 bg-sidebar p-0 text-white hover:bg-white/10 disabled:opacity-50"
                  title={
                    isPhotoPending && isSelf
                      ? 'Trimite o altă poză - o va înlocui pe cea în așteptare'
                      : isPhotoPending
                        ? 'O poză este deja în așteptarea aprobării'
                        : 'Schimbă poza de profil'
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <h1 className="font-display text-xl font-bold">{athlete.full_name}</h1>
            <a
              href={withSsoHandoff(`${PUBLIC_SITE_URL}/sportivi/${athlete.id}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-white/70 underline hover:text-white"
            >
              Vezi profil public <ExternalLink className="h-3 w-3" />
            </a>
            {athlete.current_grade?.name && <BeltBadge grade={athlete.current_grade.name} />}
            {canApprove && isPhotoPending && (
              <ReviewButtons light busy={reviewBusyKey === 'photo'} onApprove={() => reviewPhoto(true)} onReject={() => reviewPhoto(false)} />
            )}
          </div>
        </div>
        <div className="flex flex-row flex-wrap items-start justify-center gap-3">
          <MedalGroup label="Național" medals={medals} ribbonColors={NATIONAL_RIBBON} />
          <MedalGroup label="European" medals={europeanMedals} ribbonColors={EUROPEAN_RIBBON} />
          <MedalGroup label="Mondial" medals={worldMedals} ribbonColors={WORLD_RIBBON} />
        </div>
      </div>

      <TabBar activeKey={tab} onSelect={setTab} />

      {tab === 'info' && (
        <div className="flex flex-col">
          {canReview && (
            <Button variant="outline" onClick={() => setEditOpen(true)} className="mb-2 w-fit">
              <Pencil className="h-4 w-4" /> Editează
            </Button>
          )}
          <InfoRow label="Status cont" value={<StatusBadge status={athlete.status} />} />
          {athlete.license_image && (
            <InfoRow
              label="Legitimație"
              value={(
                <button
                  type="button"
                  onClick={() => setCertificatePreview({ image: imgUrl(athlete.license_image), alt_text: 'Legitimație' })}
                  className="text-primary underline hover:text-primary/80"
                >
                  Vezi poza
                </button>
              )}
            />
          )}
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
                <ResponsiveTable
                  head={(
                    <>
                      <th className="px-4 py-3 font-medium">Competiție</th>
                      <th className="px-4 py-3 font-medium">Categorie</th>
                      <th className="px-4 py-3 font-medium">Tip</th>
                      <th className="px-4 py-3 font-medium">Rezultat</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </>
                  )}
                  rows={results.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium">
                        {r.competition || '—'}
                        <CertificateThumb src={r.certificate_image} label="Vezi diploma" onOpen={setCertificatePreview} />
                        {canApprove && r.status === 'pending' && (
                          <ReviewButtons busy={reviewBusyKey === `result-${r.id}`} onApprove={() => reviewItem('result', r.id, true)} onReject={() => reviewItem('result', r.id, false)} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.category || '—'}{r.team_name ? ` (${r.team_name})` : ''}
                        {r.group_name ? ` · ${r.group_name}` : ''}
                        {r.team_members?.length > 0 && <><br />Membri: {r.team_members.join(' · ')}</>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{RESULT_TYPE_LABELS[r.type] || r.type}</td>
                      <td className="px-4 py-3 font-semibold">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                        {r.status === 'rejected' && r.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{r.admin_notes}</p>}
                      </td>
                    </tr>
                  ))}
                  cards={results.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{r.competition || '—'}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <CertificateThumb src={r.certificate_image} label="Vezi diploma" onOpen={setCertificatePreview} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.category || '—'}{r.team_name ? ` (${r.team_name})` : ''} · {RESULT_TYPE_LABELS[r.type] || r.type}
                        {r.group_name ? ` · ${r.group_name}` : ''}
                      </p>
                      {r.team_members?.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">Membri: {r.team_members.join(' · ')}</p>
                      )}
                      <p className="mt-2 text-sm font-semibold">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</p>
                      {r.status === 'rejected' && r.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{r.admin_notes}</p>}
                      {canApprove && r.status === 'pending' && (
                        <ReviewButtons busy={reviewBusyKey === `result-${r.id}`} onApprove={() => reviewItem('result', r.id, true)} onReject={() => reviewItem('result', r.id, false)} />
                      )}
                    </li>
                  ))}
                />
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
            <ResponsiveTable
              head={(
                <>
                  <th className="px-4 py-3 font-medium">Grad</th>
                  <th className="px-4 py-3 font-medium">Data obținerii</th>
                  <th className="px-4 py-3 font-medium">Eveniment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </>
              )}
              rows={athlete.grade_history.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-3 font-medium">
                    {g.grade?.name || '—'}
                    <CertificateThumb src={g.certificate_image} label="Vezi certificatul" onOpen={setCertificatePreview} />
                    {canApprove && g.status === 'pending' && (
                      <ReviewButtons busy={reviewBusyKey === `grade-${g.id}`} onApprove={() => reviewItem('grade', g.id, true)} onReject={() => reviewItem('grade', g.id, false)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(g.obtained_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {g.event || '—'}
                    {(g.examiner_1_name || g.examiner_2_name) && (
                      <><br />Examinatori: {[g.examiner_1_name, g.examiner_2_name].filter(Boolean).join(' · ')}</>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={g.status} />
                    {g.status === 'rejected' && g.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{g.admin_notes}</p>}
                  </td>
                </tr>
              ))}
              cards={athlete.grade_history.map((g) => (
                <li key={g.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{g.grade?.name || '—'}</p>
                    <StatusBadge status={g.status} />
                  </div>
                  <CertificateThumb src={g.certificate_image} label="Vezi certificatul" onOpen={setCertificatePreview} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(g.obtained_date)}{g.event ? ` · ${g.event}` : ''}
                  </p>
                  {(g.examiner_1_name || g.examiner_2_name) && (
                    <p className="mt-1 text-xs text-muted-foreground">Examinatori: {[g.examiner_1_name, g.examiner_2_name].filter(Boolean).join(' · ')}</p>
                  )}
                  {g.status === 'rejected' && g.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{g.admin_notes}</p>}
                  {canApprove && g.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `grade-${g.id}`} onApprove={() => reviewItem('grade', g.id, true)} onReject={() => reviewItem('grade', g.id, false)} />
                  )}
                </li>
              ))}
            />
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
            <ResponsiveTable
              head={(
                <>
                  <th className="px-4 py-3 font-medium">Eveniment</th>
                  <th className="px-4 py-3 font-medium">Perioadă</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </>
              )}
              rows={athlete.seminars.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">
                    {s.event || '—'}
                    <CertificateThumb src={s.certificate_image} label="Vezi certificatul" onOpen={setCertificatePreview} />
                    {canApprove && s.status === 'pending' && (
                      <ReviewButtons busy={reviewBusyKey === `seminar-${s.id}`} onApprove={() => reviewItem('seminar', s.id, true)} onReject={() => reviewItem('seminar', s.id, false)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.start_date)}{s.end_date ? ` – ${fmtDate(s.end_date)}` : ''}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                    {s.status === 'rejected' && s.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{s.admin_notes}</p>}
                  </td>
                </tr>
              ))}
              cards={athlete.seminars.map((s) => (
                <li key={s.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.event || '—'}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <CertificateThumb src={s.certificate_image} label="Vezi certificatul" onOpen={setCertificatePreview} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(s.start_date)}{s.end_date ? ` – ${fmtDate(s.end_date)}` : ''}{s.place ? ` · ${s.place}` : ''}
                  </p>
                  {s.status === 'rejected' && s.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{s.admin_notes}</p>}
                  {canApprove && s.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `seminar-${s.id}`} onApprove={() => reviewItem('seminar', s.id, true)} onReject={() => reviewItem('seminar', s.id, false)} />
                  )}
                </li>
              ))}
            />
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
            <ResponsiveTable
              head={(
                <>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Data obținerii</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </>
              )}
              rows={athlete.medical_visas.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5 text-muted-foreground" /> Viză medicală</span>
                    <CertificateThumb src={v.certificate_image} label="Vezi documentul" onOpen={setCertificatePreview} />
                    {canApprove && v.status === 'pending' && (
                      <ReviewButtons busy={reviewBusyKey === `medical-visa-${v.id}`} onApprove={() => reviewItem('medical-visa', v.id, true)} onReject={() => reviewItem('medical-visa', v.id, false)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(v.issued_date)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                    {v.status === 'rejected' && v.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{v.admin_notes}</p>}
                  </td>
                </tr>
              ))}
              cards={athlete.medical_visas.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5 text-muted-foreground" /> Viză medicală</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{fmtDate(v.issued_date)}</span>
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                  {v.status === 'rejected' && v.admin_notes && <p className="text-xs text-muted-foreground">{v.admin_notes}</p>}
                  <CertificateThumb src={v.certificate_image} label="Vezi documentul" onOpen={setCertificatePreview} />
                  {canApprove && v.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `medical-visa-${v.id}`} onApprove={() => reviewItem('medical-visa', v.id, true)} onReject={() => reviewItem('medical-visa', v.id, false)} />
                  )}
                </li>
              ))}
            />
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
            <ResponsiveTable
              head={(
                <>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Data obținerii</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </>
              )}
              rows={athlete.annual_visas.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5 text-muted-foreground" /> Viză anuală</span>
                    <CertificateThumb src={v.certificate_image} label="Vezi documentul" onOpen={setCertificatePreview} />
                    {canApprove && v.status === 'pending' && (
                      <ReviewButtons busy={reviewBusyKey === `annual-visa-${v.id}`} onApprove={() => reviewItem('annual-visa', v.id, true)} onReject={() => reviewItem('annual-visa', v.id, false)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(v.issued_date)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                    {v.status === 'rejected' && v.admin_notes && <p className="mt-1 text-xs text-muted-foreground">{v.admin_notes}</p>}
                  </td>
                </tr>
              ))}
              cards={athlete.annual_visas.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5 text-muted-foreground" /> Viză anuală</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{fmtDate(v.issued_date)}</span>
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                  {v.status === 'rejected' && v.admin_notes && <p className="text-xs text-muted-foreground">{v.admin_notes}</p>}
                  <CertificateThumb src={v.certificate_image} label="Vezi documentul" onOpen={setCertificatePreview} />
                  {canApprove && v.status === 'pending' && (
                    <ReviewButtons busy={reviewBusyKey === `annual-visa-${v.id}`} onApprove={() => reviewItem('annual-visa', v.id, true)} onReject={() => reviewItem('annual-visa', v.id, false)} />
                  )}
                </li>
              ))}
            />
          )}
        </div>
      )}

      {tab === 'poze' && <GalleryTab athleteId={athlete.id} />}

      <EditInfoDialog open={editOpen} onOpenChange={setEditOpen} athlete={athlete} onSaved={load} canManageRole={canApprove} />
      <AddResultDialog open={addResultOpen} onOpenChange={setAddResultOpen} athlete={athlete} onCreated={load} />
      <AddGradeDialog open={addGradeOpen} onOpenChange={setAddGradeOpen} athlete={athlete} onCreated={load} />
      <AddSeminarDialog open={addSeminarOpen} onOpenChange={setAddSeminarOpen} athlete={athlete} onCreated={load} />
      <AddVisaDialog open={!!addVisaType} onOpenChange={(v) => !v && setAddVisaType(null)} athlete={athlete} visaType={addVisaType} onCreated={load} />
      <PhotoPreviewDialog
        preview={photoPreview}
        uploading={uploadingPhoto}
        error={photoError}
        onConfirm={confirmPhotoUpload}
        onCancel={cancelPhotoUpload}
      />
      <Lightbox image={certificatePreview} onClose={() => setCertificatePreview(null)} />
    </div>
  );
}
