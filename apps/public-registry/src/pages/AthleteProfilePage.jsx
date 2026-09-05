import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, Pencil, X } from 'lucide-react';
import { useAuth } from '@shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Skeleton, Textarea } from '../components/ui';
import {
  athleteAPI,
  categoryAPI,
  cityAPI,
  clubAPI,
  coachAPI,
  competitionAPI,
  enrollmentAPI,
  federationRoleAPI,
  gradeAPI,
  gradeHistoryAPI,
  scoreAPI,
  titleAPI,
  visaAPI,
} from '@shared/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

function getBackendBaseUrl() {
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return API_BASE_URL.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}

function normalizeResultStatus(status) {
  if (!status) return 'unknown';
  return String(status).toLowerCase();
}

function statusChipClass(status) {
  if (status === 'approved') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'pending') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'revision_required') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ro-RO');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ro-RO');
}

function formatBoolean(value) {
  return value ? 'Da' : 'Nu';
}

function formatValue(value) {
  if (value && typeof value === 'object' && 'props' in value) return value;
  if (value === true || value === false) return formatBoolean(value);
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getRelatedId(value) {
  if (value && typeof value === 'object') return value.id || '';
  return value || '';
}

function getErrorMessage(err) {
  const data = err?.response?.data;
  if (!data) return err?.message || 'Operațiunea a eșuat.';
  if (typeof data === 'string') return data;
  if (data.detail || data.error) return data.detail || data.error;
  return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' | ');
}

function resolveMediaUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const backendBaseUrl = getBackendBaseUrl();
  if (value.startsWith('/')) return `${backendBaseUrl}${value}`;
  return `${backendBaseUrl}/media/${value.replace(/^media\//, '')}`;
}

function getAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function formatMedal(placement) {
  if (placement === '1st') return 'Aur';
  if (placement === '2nd') return 'Argint';
  if (placement === '3rd') return 'Bronz';
  return '-';
}

function getAthleteName(athlete) {
  return [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ') || '-';
}

function InfoSection({ title, action, children }) {
  return (
    <Card className="registry-panel overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}

function SectionButton({ children, onClick, active = false }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? 'secondary' : 'outline'}
      size="sm"
    >
      {active ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{children}
    </Button>
  );
}

function InfoGrid({ items }) {
  return (
    <dl className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words font-medium text-foreground">{formatValue(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function FileLink({ href, children }) {
  const resolvedHref = resolveMediaUrl(href);
  if (!resolvedHref) return '-';
  return <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={resolvedHref} target="_blank" rel="noreferrer">{children}<ExternalLink className="h-3.5 w-3.5" /></a>;
}

function TextField({ label, value, onChange, type = 'text', as = 'input', required = false }) {
  const Component = as === 'textarea' ? Textarea : Input;
  return (
    <Label className="block space-y-2">
      <span>{label}{required ? ' *' : ''}</span>
      <Component
        type={as === 'input' ? type : undefined}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </Label>
  );
}

function SelectField({ label, value, onChange, options, required = false, children }) {
  return (
    <Label className="block space-y-2">
      <span>{label}{required ? ' *' : ''}</span>
      <Select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">-</option>
        {children || options.map((option) => (
          <option key={option.id} value={option.id}>{option.name || option.title || option.full_name || option.email || option.id}</option>
        ))}
      </Select>
    </Label>
  );
}

function AdminForm({ title, onSubmit, saving, children }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-muted/40 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
      <Button
        type="submit"
        disabled={saving}
      >
        <CheckCircle2 className="h-4 w-4" />{saving ? 'Se salvează...' : 'Salvează'}
      </Button>
    </form>
  );
}

function AdminModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4 py-6 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="sm"
          >
            <X className="h-4 w-4" />Închide
          </Button>
        </CardHeader>
        <CardContent className="pt-5">{children}</CardContent>
      </Card>
    </div>
  );
}

function ProfileImage({ athlete, src }) {
  const [failed, setFailed] = useState(false);
  const initials = [athlete?.first_name?.[0], athlete?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  if (!src || failed) {
    return (
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-3xl font-black text-gray-500">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={getAthleteName(athlete)}
      onError={() => setFailed(true)}
      className="h-28 w-28 shrink-0 rounded-lg border border-gray-200 bg-gray-100 object-cover"
    />
  );
}

export default function AthleteProfilePage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [results, setResults] = useState([]);
  const [options, setOptions] = useState({ clubs: [], cities: [], grades: [], roles: [], titles: [], events: [], categories: [], coaches: [] });
  const [profileForm, setProfileForm] = useState(null);
  const [gradeForm, setGradeForm] = useState({ grade: '', obtained_date: '', level: 'good', event: '', examiner_1: '', examiner_2: '', notes: '' });
  const [visaForm, setVisaForm] = useState({ visa_type: 'medical', issued_date: '', health_status: 'approved', visa_status: 'Valid', status: 'approved', notes: '' });
  const [resultForm, setResultForm] = useState({ category: '', type: 'solo', placement_claimed: '1st', status: 'approved', notes: '' });
  const [resultEditForm, setResultEditForm] = useState(null);
  const [eventForm, setEventForm] = useState({ event: '' });
  const [activeSectionForm, setActiveSectionForm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultsWarning, setResultsWarning] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [adminError, setAdminError] = useState('');
  const [savingAction, setSavingAction] = useState('');

  async function fetchAthleteData({ showLoader = false } = {}) {
    if (showLoader) setLoading(true);
    setError('');
    setResultsWarning('');
    try {
      const athleteResponse = await athleteAPI.get(id);
      setAthlete(athleteResponse?.data || null);

      try {
        const resultResponse = await scoreAPI.allResults({ athlete_id: id });
        setResults(Array.isArray(resultResponse?.data) ? resultResponse.data : []);
      } catch (resultErr) {
        setResults([]);
        const message = resultErr?.response?.data?.detail || resultErr?.message || 'Istoricul rezultatelor este temporar indisponibil.';
        setResultsWarning(message);
      }
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Nu s-au putut încărca datele profilului.';
      setError(message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function refreshAfterSave(message) {
    await fetchAthleteData();
    setAdminMessage(message);
  }

  useEffect(() => {
    let isMounted = true;

    fetchAthleteData({ showLoader: true });
    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!athlete) return;
    setProfileForm({
      first_name: athlete.first_name || '',
      last_name: athlete.last_name || '',
      gender: athlete.gender || '',
      license_series: athlete.license_series || '',
      cnp: athlete.cnp || '',
      date_of_birth: athlete.date_of_birth || '',
      address: athlete.address || '',
      mobile_number: athlete.mobile_number || '',
      emergency_contact_name: athlete.emergency_contact_name || '',
      emergency_contact_phone: athlete.emergency_contact_phone || '',
      previous_experience: athlete.previous_experience || '',
      club: getRelatedId(athlete.club),
      city: getRelatedId(athlete.city),
      current_grade: getRelatedId(athlete.current_grade),
      federation_role: getRelatedId(athlete.federation_role),
      title: getRelatedId(athlete.title),
      team_place: athlete.team_place || '',
      registered_date: athlete.registered_date || '',
      expiration_date: athlete.expiration_date || '',
      status: athlete.status || 'approved',
      is_coach: !!athlete.is_coach,
      is_referee: !!athlete.is_referee,
      admin_notes: athlete.admin_notes || '',
    });
  }, [athlete]);

  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;

    async function fetchOptions() {
      try {
        const [clubs, cities, grades, roles, titles, competitions, examinations, categories, coaches] = await Promise.all([
          clubAPI.list(),
          cityAPI.list(),
          gradeAPI.list(),
          federationRoleAPI.list(),
          titleAPI.list(),
          competitionAPI.list(),
          competitionAPI.list({ event_type: 'examination' }),
          categoryAPI.list(),
          coachAPI.list(),
        ]);
        const eventMap = new Map([
          ...toArray(competitions.data),
          ...toArray(examinations.data),
        ].map((event) => [event.id, event]));
        if (!isMounted) return;
        setOptions({
          clubs: toArray(clubs.data),
          cities: toArray(cities.data),
          grades: toArray(grades.data),
          roles: toArray(roles.data),
          titles: toArray(titles.data),
          events: Array.from(eventMap.values()),
          categories: toArray(categories.data),
          coaches: toArray(coaches.data),
        });
      } catch (err) {
        if (isMounted) setAdminError(getErrorMessage(err));
      }
    }

    fetchOptions();
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  async function runAdminAction(action, fn) {
    setSavingAction(action);
    setAdminError('');
    setAdminMessage('');
    try {
      await fn();
    } catch (err) {
      setAdminError(getErrorMessage(err));
    } finally {
      setSavingAction('');
    }
  }

  function cleanPayload(payload) {
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value === '' ? null : value]));
  }

  function selectedCategoryType() {
    const category = options.categories.find((item) => String(item.id) === String(resultForm.category));
    const type = category?.type || resultForm.type || 'solo';
    return type === 'team' ? 'teams' : type;
  }

  const examinationEvents = options.events.filter((event) => event.event_type === 'examination');

  async function saveProfile(event) {
    event.preventDefault();
    await runAdminAction('profile', async () => {
      await athleteAPI.update(id, cleanPayload(profileForm));
      await refreshAfterSave('Profilul sportivului a fost actualizat.');
    });
  }

  async function addGrade(event) {
    event.preventDefault();
    await runAdminAction('grade', async () => {
      await gradeHistoryAPI.submissions.create(cleanPayload({
        athlete: id,
        grade: gradeForm.grade,
        obtained_date: gradeForm.obtained_date,
        level: gradeForm.level,
        event: gradeForm.event,
        examiner_1: gradeForm.examiner_1,
        examiner_2: gradeForm.examiner_2,
        status: 'approved',
        notes: gradeForm.notes,
      }));
      setGradeForm({ grade: '', obtained_date: '', level: 'good', event: '', examiner_1: '', examiner_2: '', notes: '' });
      await refreshAfterSave('Gradul a fost adăugat.');
    });
  }

  async function addVisa(event) {
    event.preventDefault();
    await runAdminAction('visa', async () => {
      const payload = cleanPayload({
        athlete: id,
        visa_type: visaForm.visa_type,
        issued_date: visaForm.issued_date,
        health_status: visaForm.health_status,
        visa_status: visaForm.visa_status,
        status: visaForm.status,
        notes: visaForm.notes,
      });
      const apiClient = visaForm.visa_type === 'annual' ? visaAPI.annual : visaAPI.medical;
      await apiClient.create(payload);
      setVisaForm({ visa_type: 'medical', issued_date: '', health_status: 'approved', visa_status: 'Valid', status: 'approved', notes: '' });
      await refreshAfterSave('Viza a fost adăugată.');
    });
  }

  async function addResult(event) {
    event.preventDefault();
    await runAdminAction('result', async () => {
      const type = selectedCategoryType();
      await scoreAPI.create(cleanPayload({
        athlete: id,
        category: resultForm.category,
        type,
        score: null,
        placement_claimed: resultForm.placement_claimed,
        status: resultForm.status,
        notes: resultForm.notes,
      }));
      setResultForm({ category: '', type: 'solo', placement_claimed: '1st', status: 'approved', notes: '' });
      await refreshAfterSave('Rezultatul a fost adăugat.');
    });
  }

  async function updateResult(event) {
    event.preventDefault();
    if (!resultEditForm?.id) return;
    await runAdminAction('result-edit', async () => {
      await scoreAPI.update(resultEditForm.id, cleanPayload({
        athlete: id,
        category: resultEditForm.category,
        type: resultEditForm.type,
        score: null,
        placement_claimed: resultEditForm.placement_claimed,
        status: resultEditForm.status,
        notes: resultEditForm.notes,
      }));
      setResultEditForm(null);
      await refreshAfterSave('Rezultatul a fost actualizat.');
    });
  }

  async function addEventParticipation(event) {
    event.preventDefault();
    await runAdminAction('event', async () => {
      await enrollmentAPI.eventEnrollments.create(cleanPayload({ athlete: id, event: eventForm.event }));
      setEventForm({ event: '' });
      await refreshAfterSave('Înscrierea la eveniment a fost adăugată.');
    });
  }

  const summary = useMemo(() => {
    const normalized = results.map((result) => normalizeResultStatus(result.status));
    const approved = normalized.filter((status) => status === 'approved').length;
    const pending = normalized.filter((status) => status === 'pending').length;
    return {
      total: results.length,
      approved,
      pending,
    };
  }, [results]);

  if (loading) {
    return <Card className="registry-panel p-5"><Skeleton className="h-28 w-full" /></Card>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4" />Înapoi la registru</Link></Button>
        <Alert variant="destructive">{error}</Alert>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4" />Înapoi la registru</Link></Button>
        <Alert>Sportivul nu a fost găsit.</Alert>
      </div>
    );
  }

  const age = getAge(athlete.date_of_birth);
  const gradeHistory = Array.isArray(athlete.grade_history) ? athlete.grade_history : [];
  const visas = Array.isArray(athlete.visas) ? athlete.visas : [];
  const eventParticipations = Array.isArray(athlete.event_participations) ? athlete.event_participations : [];
  const profileImageUrl = resolveMediaUrl(athlete.profile_image);

  return (
    <section className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-3"><Link to="/"><ArrowLeft className="h-4 w-4" />Înapoi la registru</Link></Button>

      <Card className="registry-panel overflow-hidden">
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center">
          <ProfileImage athlete={athlete} src={profileImageUrl} />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="success">Profil validat</Badge>
              {athlete.is_coach && <Badge variant="secondary">Antrenor</Badge>}
              {athlete.is_referee && <Badge variant="secondary">Arbitru</Badge>}
            </div>
            <h1 className="font-display text-3xl font-semibold text-foreground">{getAthleteName(athlete)}</h1>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <p><span className="font-medium text-foreground">Club:</span> {athlete?.club?.name || '-'}</p>
              <p><span className="font-medium text-foreground">Grad:</span> {athlete?.current_grade?.name || '-'}</p>
              <p><span className="font-medium text-foreground">Status:</span> {athlete.status_display || athlete.status || '-'}</p>
              <p><span className="font-medium text-foreground">Vârstă:</span> {age ?? '-'}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="registry-panel p-4"><p className="text-xs font-medium text-muted-foreground">Total rezultate</p><p className="font-display mt-1 text-3xl font-semibold">{summary.total}</p></Card>
        <Card className="registry-panel p-4"><p className="text-xs font-medium text-muted-foreground">Rezultate validate</p><p className="font-display mt-1 text-3xl font-semibold text-emerald-700">{summary.approved}</p></Card>
        <Card className="registry-panel p-4"><p className="text-xs font-medium text-muted-foreground">În așteptare</p><p className="font-display mt-1 text-3xl font-semibold text-amber-700">{summary.pending}</p></Card>
      </div>

      {isAdmin && adminMessage && <Alert variant="success"><CheckCircle2 className="mr-2 inline h-4 w-4" />{adminMessage}</Alert>}
      {isAdmin && adminError && <Alert variant="destructive">{adminError}</Alert>}

      <InfoSection
        title="Informații personale"
        action={isAdmin && <SectionButton active={activeSectionForm === 'personal'} onClick={() => setActiveSectionForm(activeSectionForm === 'personal' ? '' : 'personal')}>Editează</SectionButton>}
      >
        <InfoGrid items={[
          { label: 'Utilizator', value: athlete.user?.full_name || athlete.user?.email || athlete.user || '-' },
          { label: 'Prenume', value: athlete.first_name },
          { label: 'Nume', value: athlete.last_name },
          { label: 'Gen', value: athlete.gender_display || athlete.gender },
          { label: 'Serie legitimație', value: athlete.license_series },
          { label: 'CNP', value: athlete.cnp },
          { label: 'Data nașterii', value: formatDate(athlete.date_of_birth) },
          { label: 'Adresă', value: athlete.address },
          { label: 'Telefon mobil', value: athlete.mobile_number },
          { label: 'Certificat medical', value: <FileLink href={athlete.medical_certificate}>Deschide documentul</FileLink> },
          { label: 'Experiență anterioară', value: athlete.previous_experience },
        ]} />
        {isAdmin && profileForm && activeSectionForm === 'personal' && (
          <div className="mt-4">
            <AdminForm title="Editează informații personale" onSubmit={saveProfile} saving={savingAction === 'profile'}>
              <TextField label="Prenume" value={profileForm.first_name} onChange={(value) => setProfileForm({ ...profileForm, first_name: value })} required />
              <TextField label="Nume" value={profileForm.last_name} onChange={(value) => setProfileForm({ ...profileForm, last_name: value })} required />
              <SelectField label="Gen" value={profileForm.gender} onChange={(value) => setProfileForm({ ...profileForm, gender: value })} options={[]}>
                <option value="">-</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </SelectField>
              <TextField label="Serie legitimație" value={profileForm.license_series} onChange={(value) => setProfileForm({ ...profileForm, license_series: value })} />
              <TextField label="CNP" value={profileForm.cnp} onChange={(value) => setProfileForm({ ...profileForm, cnp: value })} />
              <TextField label="Data nașterii" type="date" value={profileForm.date_of_birth} onChange={(value) => setProfileForm({ ...profileForm, date_of_birth: value })} />
              <TextField label="Telefon mobil" value={profileForm.mobile_number} onChange={(value) => setProfileForm({ ...profileForm, mobile_number: value })} />
              <TextField label="Adresă" as="textarea" value={profileForm.address} onChange={(value) => setProfileForm({ ...profileForm, address: value })} />
              <TextField label="Experiență anterioară" as="textarea" value={profileForm.previous_experience} onChange={(value) => setProfileForm({ ...profileForm, previous_experience: value })} />
            </AdminForm>
          </div>
        )}
      </InfoSection>

      <InfoSection
        title="Informații sportive și club"
        action={isAdmin && <SectionButton active={activeSectionForm === 'sport'} onClick={() => setActiveSectionForm(activeSectionForm === 'sport' ? '' : 'sport')}>Editează</SectionButton>}
      >
        <InfoGrid items={[
          { label: 'Club', value: athlete.club?.name },
          { label: 'Oraș', value: athlete.city?.name },
          { label: 'Grad curent', value: athlete.current_grade?.name },
          { label: 'Rol în federație', value: athlete.federation_role_name || athlete.federation_role },
          { label: 'Titlu', value: athlete.title_name || athlete.title },
          { label: 'Data înregistrării', value: formatDate(athlete.registered_date) },
          { label: 'Data expirării', value: formatDate(athlete.expiration_date) },
          { label: 'Este antrenor', value: athlete.is_coach },
          { label: 'Este arbitru', value: athlete.is_referee },
          { label: 'Loc echipă', value: athlete.team_place },
        ]} />
        {isAdmin && profileForm && activeSectionForm === 'sport' && (
          <div className="mt-4">
            <AdminForm title="Editează informații sportive" onSubmit={saveProfile} saving={savingAction === 'profile'}>
              <SelectField label="Club" value={profileForm.club} onChange={(value) => setProfileForm({ ...profileForm, club: value })} options={options.clubs} />
              <SelectField label="Oraș" value={profileForm.city} onChange={(value) => setProfileForm({ ...profileForm, city: value })} options={options.cities} />
              <SelectField label="Grad curent" value={profileForm.current_grade} onChange={(value) => setProfileForm({ ...profileForm, current_grade: value })} options={options.grades} />
              <SelectField label="Rol în federație" value={profileForm.federation_role} onChange={(value) => setProfileForm({ ...profileForm, federation_role: value })} options={options.roles} />
              <SelectField label="Titlu" value={profileForm.title} onChange={(value) => setProfileForm({ ...profileForm, title: value })} options={options.titles} />
              <TextField label="Data înregistrării" type="date" value={profileForm.registered_date} onChange={(value) => setProfileForm({ ...profileForm, registered_date: value })} />
              <TextField label="Data expirării" type="date" value={profileForm.expiration_date} onChange={(value) => setProfileForm({ ...profileForm, expiration_date: value })} />
              <TextField label="Loc echipă" value={profileForm.team_place} onChange={(value) => setProfileForm({ ...profileForm, team_place: value })} />
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={profileForm.is_coach} onChange={(event) => setProfileForm({ ...profileForm, is_coach: event.target.checked })} /> Este antrenor
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={profileForm.is_referee} onChange={(event) => setProfileForm({ ...profileForm, is_referee: event.target.checked })} /> Este arbitru
              </label>
            </AdminForm>
          </div>
        )}
      </InfoSection>

      <InfoSection
        title="Contact de urgență"
        action={isAdmin && <SectionButton active={activeSectionForm === 'emergency'} onClick={() => setActiveSectionForm(activeSectionForm === 'emergency' ? '' : 'emergency')}>Editează</SectionButton>}
      >
        <InfoGrid items={[
          { label: 'Nume contact', value: athlete.emergency_contact_name },
          { label: 'Telefon contact', value: athlete.emergency_contact_phone },
        ]} />
        {isAdmin && profileForm && activeSectionForm === 'emergency' && (
          <div className="mt-4">
            <AdminForm title="Editează contact de urgență" onSubmit={saveProfile} saving={savingAction === 'profile'}>
              <TextField label="Nume contact" value={profileForm.emergency_contact_name} onChange={(value) => setProfileForm({ ...profileForm, emergency_contact_name: value })} />
              <TextField label="Telefon contact" value={profileForm.emergency_contact_phone} onChange={(value) => setProfileForm({ ...profileForm, emergency_contact_phone: value })} />
            </AdminForm>
          </div>
        )}
      </InfoSection>

      <InfoSection
        title="Flux de aprobare"
        action={isAdmin && <SectionButton active={activeSectionForm === 'approval'} onClick={() => setActiveSectionForm(activeSectionForm === 'approval' ? '' : 'approval')}>Editează</SectionButton>}
      >
        <InfoGrid items={[
          { label: 'Status', value: athlete.status_display || athlete.status },
          { label: 'Data trimiterii', value: formatDateTime(athlete.submitted_date) },
          { label: 'Data revizuirii', value: formatDateTime(athlete.reviewed_date) },
          { label: 'Revizuit de', value: athlete.reviewed_by_name || athlete.reviewed_by },
          { label: 'Data aprobării', value: formatDateTime(athlete.approved_date) },
          { label: 'Aprobat de', value: athlete.approved_by },
          { label: 'Notițe administrator', value: athlete.admin_notes },
          { label: 'Creat la', value: formatDateTime(athlete.created_at) },
          { label: 'Actualizat la', value: formatDateTime(athlete.updated_at) },
        ]} />
        {isAdmin && profileForm && activeSectionForm === 'approval' && (
          <div className="mt-4">
            <AdminForm title="Editează flux de aprobare" onSubmit={saveProfile} saving={savingAction === 'profile'}>
              <SelectField label="Status" value={profileForm.status} onChange={(value) => setProfileForm({ ...profileForm, status: value })} options={[]}>
                <option value="pending">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="revision_required">Revision Required</option>
              </SelectField>
              <TextField label="Notițe administrator" as="textarea" value={profileForm.admin_notes} onChange={(value) => setProfileForm({ ...profileForm, admin_notes: value })} />
            </AdminForm>
          </div>
        )}
      </InfoSection>

      {resultsWarning && (
        <Alert variant="warning">{resultsWarning}</Alert>
      )}

      <InfoSection
        title="Istoric grade"
        action={isAdmin && <SectionButton active={activeSectionForm === 'grade'} onClick={() => setActiveSectionForm(activeSectionForm === 'grade' ? '' : 'grade')}>Adaugă grad</SectionButton>}
      >
        {isAdmin && activeSectionForm === 'grade' && (
          <div className="mb-4">
            <AdminForm title="Adaugă grad" onSubmit={addGrade} saving={savingAction === 'grade'}>
              <SelectField label="Grad" value={gradeForm.grade} onChange={(value) => setGradeForm({ ...gradeForm, grade: value })} options={options.grades} required />
              <TextField label="Data obținerii" type="date" value={gradeForm.obtained_date} onChange={(value) => setGradeForm({ ...gradeForm, obtained_date: value })} />
              <SelectField label="Nivel" value={gradeForm.level} onChange={(value) => setGradeForm({ ...gradeForm, level: value })} options={[]}>
                <option value="good">Good</option>
                <option value="bad">Bad</option>
              </SelectField>
              <SelectField label="Nume examen" value={gradeForm.event} onChange={(value) => setGradeForm({ ...gradeForm, event: value })} options={examinationEvents} />
              <SelectField label="Examinator 1" value={gradeForm.examiner_1} onChange={(value) => setGradeForm({ ...gradeForm, examiner_1: value })} options={options.coaches} />
              <SelectField label="Examinator 2" value={gradeForm.examiner_2} onChange={(value) => setGradeForm({ ...gradeForm, examiner_2: value })} options={options.coaches} />
              <TextField label="Note" as="textarea" value={gradeForm.notes} onChange={(value) => setGradeForm({ ...gradeForm, notes: value })} />
            </AdminForm>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Grad</th>
                <th className="px-4 py-3">Data obținerii</th>
                <th className="px-4 py-3">Eveniment</th>
                <th className="px-4 py-3">Examinatori</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gradeHistory.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nu există istoric de grade.</td></tr>
              )}
              {gradeHistory.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{row.grade_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(row.obtained_date)}</td>
                  <td className="px-4 py-3 text-gray-700">{row.event_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{[row.examiner_1_name, row.examiner_2_name].filter(Boolean).join(' / ') || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{row.status_display || row.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection
        title="Vize"
        action={isAdmin && <SectionButton active={activeSectionForm === 'visa'} onClick={() => setActiveSectionForm(activeSectionForm === 'visa' ? '' : 'visa')}>Adaugă viză</SectionButton>}
      >
        {isAdmin && activeSectionForm === 'visa' && (
          <div className="mb-4">
            <AdminForm title="Adaugă viză" onSubmit={addVisa} saving={savingAction === 'visa'}>
              <SelectField label="Tip viză" value={visaForm.visa_type} onChange={(value) => setVisaForm({ ...visaForm, visa_type: value })} options={[]}>
                <option value="medical">Medicală</option>
                <option value="annual">Anuală</option>
              </SelectField>
              <TextField label="Data emiterii" type="date" value={visaForm.issued_date} onChange={(value) => setVisaForm({ ...visaForm, issued_date: value })} />
              <SelectField label="Status medical" value={visaForm.health_status} onChange={(value) => setVisaForm({ ...visaForm, health_status: value })} options={[]}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </SelectField>
              <SelectField label="Status viză" value={visaForm.visa_status} onChange={(value) => setVisaForm({ ...visaForm, visa_status: value })} options={[]}>
                <option value="Valid">Valid</option>
                <option value="Expired">Expired</option>
                <option value="Not available">Not available</option>
              </SelectField>
              <SelectField label="Status aprobare" value={visaForm.status} onChange={(value) => setVisaForm({ ...visaForm, status: value })} options={[]}>
                <option value="pending">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="revision_required">Revision Required</option>
              </SelectField>
              <TextField label="Note" as="textarea" value={visaForm.notes} onChange={(value) => setVisaForm({ ...visaForm, notes: value })} />
            </AdminForm>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Data emiterii</th>
                <th className="px-4 py-3">Status viză</th>
                <th className="px-4 py-3">Status aprobare</th>
                <th className="px-4 py-3">Documente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nu există vize.</td></tr>
              )}
              {visas.map((visa) => (
                <tr key={visa.id}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{visa.visa_type_display || visa.visa_type || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(visa.issued_date)}</td>
                  <td className="px-4 py-3 text-gray-700">{visa.visa_status || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{visa.status_display || visa.status || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex flex-wrap gap-2">
                      <FileLink href={visa.document}>Document</FileLink>
                      <FileLink href={visa.image}>Imagine</FileLink>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection
        title="Evenimente înscrise"
        action={isAdmin && <SectionButton active={activeSectionForm === 'event'} onClick={() => setActiveSectionForm(activeSectionForm === 'event' ? '' : 'event')}>Înscrie</SectionButton>}
      >
        {isAdmin && activeSectionForm === 'event' && (
          <div className="mb-4">
            <AdminForm title="Înscrie la eveniment" onSubmit={addEventParticipation} saving={savingAction === 'event'}>
              <SelectField label="Eveniment" value={eventForm.event} onChange={(value) => setEventForm({ event: value })} options={options.events} required />
            </AdminForm>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Eveniment</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Perioadă</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eventParticipations.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Nu există evenimente înscrise.</td></tr>
              )}
              {eventParticipations.map((participation) => (
                <tr key={participation.id}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{participation.event_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{participation.event_type || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(participation.start_date)} - {formatDate(participation.end_date)}</td>
                  <td className="px-4 py-3 text-gray-700">{participation.status_display || participation.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection
        title="Istoric rezultate"
        action={isAdmin && <SectionButton active={activeSectionForm === 'result'} onClick={() => { setResultEditForm(null); setActiveSectionForm('result'); }}>Adaugă rezultat</SectionButton>}
      >
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Competiție / Categorie</th>
              <th className="px-4 py-3">Rezultat</th>
              <th className="px-4 py-3">Status</th>
              {isAdmin && <th className="px-4 py-3 text-right">Acțiuni</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {results.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-6 text-center text-sm text-gray-500">Nu există rezultate publice.</td>
              </tr>
            )}
            {results.map((result) => {
              const status = normalizeResultStatus(result.status);
              return (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{formatDate(result.submitted_date || result.created_at)}</td>
                  <td className="px-4 py-3 text-gray-900">
                    <p className="font-semibold">{result?.competition_name || '-'}</p>
                    <p className="text-xs text-gray-600">{result?.category_name || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <p className="font-semibold text-gray-900">{getAthleteName(athlete)}</p>
                    <p>Medalie: {formatMedal(result.placement_claimed)}</p>
                    {result.notes && <p className="text-xs text-gray-600">{result.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${statusChipClass(status)}`}>
                      {status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setResultEditForm({
                          id: result.id,
                          category: result.category || '',
                          type: result.type || 'solo',
                          placement_claimed: result.placement_claimed || '',
                          status: result.status || 'approved',
                          notes: result.notes || '',
                        })}
                        className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Editează
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </InfoSection>

      {isAdmin && activeSectionForm === 'result' && (
        <AdminModal title="Adaugă rezultat" onClose={() => setActiveSectionForm('')}>
          <AdminForm title="Date rezultat" onSubmit={addResult} saving={savingAction === 'result'}>
            <SelectField label="Categorie" value={resultForm.category} onChange={(value) => setResultForm({ ...resultForm, category: value })} options={options.categories} required />
            <SelectField label="Tip" value={resultForm.type} onChange={(value) => setResultForm({ ...resultForm, type: value })} options={[]}>
              <option value="solo">Solo</option>
              <option value="teams">Teams</option>
              <option value="fight">Fight</option>
            </SelectField>
            <SelectField label="Medalie" value={resultForm.placement_claimed} onChange={(value) => setResultForm({ ...resultForm, placement_claimed: value })} options={[]}>
              <option value="1st">Aur</option>
              <option value="2nd">Argint</option>
              <option value="3rd">Bronz</option>
            </SelectField>
            <SelectField label="Status" value={resultForm.status} onChange={(value) => setResultForm({ ...resultForm, status: value })} options={[]}>
              <option value="approved">Approved</option>
              <option value="pending">Pending Approval</option>
              <option value="rejected">Rejected</option>
              <option value="revision_required">Revision Required</option>
            </SelectField>
            <TextField label="Note" as="textarea" value={resultForm.notes} onChange={(value) => setResultForm({ ...resultForm, notes: value })} />
          </AdminForm>
        </AdminModal>
      )}

      {isAdmin && resultEditForm && (
        <AdminModal title="Editează rezultat" onClose={() => setResultEditForm(null)}>
          <AdminForm title="Date rezultat" onSubmit={updateResult} saving={savingAction === 'result-edit'}>
            <SelectField label="Categorie" value={resultEditForm.category} onChange={(value) => setResultEditForm({ ...resultEditForm, category: value })} options={options.categories} required />
            <SelectField label="Tip" value={resultEditForm.type} onChange={(value) => setResultEditForm({ ...resultEditForm, type: value })} options={[]}>
              <option value="solo">Solo</option>
              <option value="teams">Teams</option>
              <option value="fight">Fight</option>
            </SelectField>
            <SelectField label="Medalie" value={resultEditForm.placement_claimed} onChange={(value) => setResultEditForm({ ...resultEditForm, placement_claimed: value })} options={[]}>
              <option value="">-</option>
              <option value="1st">Aur</option>
              <option value="2nd">Argint</option>
              <option value="3rd">Bronz</option>
            </SelectField>
            <SelectField label="Status" value={resultEditForm.status} onChange={(value) => setResultEditForm({ ...resultEditForm, status: value })} options={[]}>
              <option value="approved">Approved</option>
              <option value="pending">Pending Approval</option>
              <option value="rejected">Rejected</option>
              <option value="revision_required">Revision Required</option>
            </SelectField>
            <TextField label="Note" as="textarea" value={resultEditForm.notes} onChange={(value) => setResultEditForm({ ...resultEditForm, notes: value })} />
          </AdminForm>
        </AdminModal>
      )}
    </section>
  );
}
