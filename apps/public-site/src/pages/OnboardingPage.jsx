import { useEffect, useState } from 'react';
import { useAuth, athleteAPI, onboardingAPI, publicContentAPI, cityAPI } from '@shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import Seo from '../components/Seo';

const STATUS_LABELS = {
  pending: { label: 'În așteptare', variant: 'secondary' },
  approved: { label: 'Aprobat', variant: 'default' },
  rejected: { label: 'Respins', variant: 'outline' },
  revision_required: { label: 'Necesită completări', variant: 'outline' },
};

/** Step 1: choose account type. Never offers 'admin' - self-service accounts
 * are only ever athlete/coach or supporter, matched by OnboardingRoleView's
 * server-side whitelist. */
function RoleStep({ onChoose, busy }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Ce fel de cont vrei?</CardTitle>
        <p className="text-sm text-muted-foreground">Poți completa profilul detaliat la pasul următor.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" disabled={busy} onClick={() => onChoose('athlete')}>
          Sunt sportiv / antrenor
        </Button>
        <Button className="flex-1" variant="secondary" disabled={busy} onClick={() => onChoose('supporter')}>
          Sunt susținător
        </Button>
      </CardContent>
    </Card>
  );
}

/** Step 2 (athlete/coach only): the actual Athlete profile form, submitted
 * to the existing self-service endpoint (AthleteViewSet.my_profile). */
function AthleteProfileStep({ onSubmitted }) {
  const [clubs, setClubs] = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    mobile_number: '',
    club: '',
    city: '',
    is_coach: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    publicContentAPI.clubs.list().then((res) => setClubs(res.data ?? [])).catch(() => {});
    cityAPI.list({ page_size: 500 }).then((res) => setCities(res.data?.results ?? res.data ?? [])).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        ...form,
        club: form.club || null,
        city: form.city || null,
      };
      const { data } = await athleteAPI.createMyProfile(payload);
      onSubmitted(data);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut trimite profilul. Verifică datele completate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Profil sportiv</CardTitle>
        <p className="text-sm text-muted-foreground">
          Datele sunt trimise spre aprobare unui administrator FRVV. Poți bifa mai jos și dacă ești antrenor.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Prenume</span>
              <input required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} className="site-form-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Nume</span>
              <input required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} className="site-form-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Data nașterii</span>
              <input type="date" required value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} className="site-form-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Gen</span>
              <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className="site-form-input">
                <option value="">Nespecificat</option>
                <option value="male">Masculin</option>
                <option value="female">Feminin</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Telefon mobil</span>
              <input value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} className="site-form-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Club</span>
              <select value={form.club} onChange={(e) => update('club', e.target.value)} className="site-form-input">
                <option value="">Alege clubul</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium">Localitate</span>
              <select value={form.city} onChange={(e) => update('city', e.target.value)} className="site-form-input">
                <option value="">Alege localitatea</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_coach} onChange={(e) => update('is_coach', e.target.checked)} />
            <span>Sunt și antrenor</span>
          </label>

          <Button type="submit" disabled={busy}>
            {busy ? 'Se trimite…' : 'Trimite profilul spre aprobare'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StatusStep({ user, athlete }) {
  const isSupporter = user.role === 'supporter';
  const status = athlete?.status ? STATUS_LABELS[athlete.status] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Contul tău</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p><span className="font-medium">Email:</span> {user.email}</p>
        <p><span className="font-medium">Tip cont:</span> {isSupporter ? 'Susținător' : 'Sportiv / antrenor'}</p>
        {!isSupporter && (
          <p className="flex items-center gap-2">
            <span className="font-medium">Stare profil:</span>
            {status ? <Badge variant={status.variant}>{status.label}</Badge> : <span>–</span>}
          </p>
        )}
        {!isSupporter && athlete?.status === 'pending' && (
          <Alert>Profilul tău a fost trimis și așteaptă aprobarea unui administrator FRVV.</Alert>
        )}
        {!isSupporter && athlete?.status === 'revision_required' && (
          <Alert variant="destructive">
            {athlete.admin_notes || 'Un administrator a cerut completări la profilul tău. Te rugăm să-l actualizezi.'}
          </Alert>
        )}
        {isSupporter && <Alert variant="success">Contul tău este activ. Îți mulțumim pentru susținere!</Alert>}
      </CardContent>
    </Card>
  );
}

export default function OnboardingPage() {
  const { user, refetchUser, loading } = useAuth();
  const [choosingRole, setChoosingRole] = useState(false);
  const [roleError, setRoleError] = useState('');

  if (loading || !user) return null;

  async function chooseRole(role) {
    setRoleError('');
    setChoosingRole(true);
    try {
      await onboardingAPI.setRole(role);
      await refetchUser();
    } catch {
      setRoleError('Nu am putut salva alegerea. Încearcă din nou.');
    } finally {
      setChoosingRole(false);
    }
  }

  const needsRoleChoice = user.role === 'user';
  const needsAthleteProfile = user.role === 'athlete' && !user.profile_completed;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Seo title="Contul meu" path="/cont" noindex />
      {roleError && <Alert variant="destructive">{roleError}</Alert>}
      {needsRoleChoice && <RoleStep onChoose={chooseRole} busy={choosingRole} />}
      {needsAthleteProfile && <AthleteProfileStep onSubmitted={refetchUser} />}
      {!needsRoleChoice && !needsAthleteProfile && <StatusStep user={user} athlete={user.athlete} />}
    </div>
  );
}
