import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, athleteAPI, publicContentAPI, cityAPI } from '@shared';
import {
  Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui';
import SearchableSelect from '../components/SearchableSelect';
import Seo from '../components/Seo';
import { displayToIso, maskDateInput } from '../lib/dateFormat';

/**
 * Dedicated onboarding URL for completing the athlete/coach profile,
 * reached after choosing "Sunt sportiv / antrenor" on /cont (or directly,
 * e.g. from a bookmark/link) - kept separate from /cont so it can be
 * linked to and refreshed on its own instead of being just an inline step.
 */
export default function AthleteOnboardingPage() {
  const { user, loading, refetchUser } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    mobile_number: '',
    club: '',
    city: '',
    is_coach: false,
    is_instructor: false,
    is_referee: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    publicContentAPI.clubs.list().then((res) => setClubs(res.data ?? [])).catch(() => {});
  }, []);

  if (loading) return null;
  if (!user) return <Navigate to="/cont" replace />;
  if (user.role !== 'user' && user.profile_completed) return <Navigate to="/cont" replace />;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function searchCities(query) {
    const { data } = await cityAPI.list({ search: query });
    return data ?? [];
  }

  function handleCityChange(city) {
    setSelectedCity(city);
    update('city', city?.id ?? '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const isoDate = displayToIso(form.date_of_birth);
    if (!isoDate) {
      setError('Introdu data nașterii completă, în formatul zz.luna.an (ex: 15.03.1995).');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        ...form,
        date_of_birth: isoDate,
        club: form.club || null,
        city: form.city || null,
      };
      await athleteAPI.createMyProfile(payload);
      await refetchUser();
      navigate('/cont', { replace: true });
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut trimite profilul. Verifică datele completate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Seo title="Profil sportiv" path="/onboarding/sportiv" noindex />
      <Card>
        <CardHeader>
          <CardTitle as="h1">Profil sportiv</CardTitle>
          <p className="text-sm text-muted-foreground">
            Datele sunt trimise spre aprobare unui administrator FRVV. Poți bifa mai jos și dacă ești antrenor, instructor sau arbitru.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Alert variant="destructive">{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="first_name">Prenume</Label>
                <Input id="first_name" required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="last_name">Nume</Label>
                <Input id="last_name" required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="date_of_birth">Data nașterii</Label>
                <Input
                  id="date_of_birth"
                  required
                  inputMode="numeric"
                  placeholder="zz.ll.aaaa"
                  value={form.date_of_birth}
                  onChange={(e) => update('date_of_birth', maskDateInput(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Gen</Label>
                <Select value={form.gender} onValueChange={(value) => update('gender', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nespecificat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Masculin</SelectItem>
                    <SelectItem value="female">Feminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="mobile_number">Telefon mobil</Label>
                <Input id="mobile_number" value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Club</Label>
                <Select value={form.club ? String(form.club) : ''} onValueChange={(value) => update('club', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alege clubul" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubs.map((club) => (
                      <SelectItem key={club.id} value={String(club.id)}>{club.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label>Localitate</Label>
                <SearchableSelect
                  value={selectedCity}
                  onChange={handleCityChange}
                  onSearch={searchCities}
                  placeholder="Scrie pentru a căuta localitatea…"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_coach} onCheckedChange={(checked) => update('is_coach', checked === true)} />
                <span>Sunt Antrenor</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_instructor} onCheckedChange={(checked) => update('is_instructor', checked === true)} />
                <span>Sunt Instructor</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_referee} onCheckedChange={(checked) => update('is_referee', checked === true)} />
                <span>Sunt Arbitru</span>
              </label>
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? 'Se trimite…' : 'Trimite profilul spre aprobare'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
