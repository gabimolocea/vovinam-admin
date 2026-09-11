import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, athleteAPI, publicContentAPI, cityAPI } from '@shared';
import {
  Alert, Button, Input, Label, Skeleton,
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
    cnp: '',
    license_series: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });
  const [isLicensed, setIsLicensed] = useState(true);
  const [licenseImage, setLicenseImage] = useState(null);
  const [licenseRequestDocument, setLicenseRequestDocument] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    publicContentAPI.clubs.list().then((res) => setClubs(res.data ?? [])).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pt-10 sm:pt-16">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
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

  function handleLicenseStatusChange(licensed) {
    setIsLicensed(licensed);
    setLicenseImage(null);
    setLicenseRequestDocument(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const isoDate = displayToIso(form.date_of_birth);
    if (!isoDate) {
      setError('Introdu data nașterii completă, în formatul zz.luna.an (ex: 15.03.1995).');
      return;
    }
    if (!form.gender) {
      setError('Alege genul.');
      return;
    }
    if (!form.club) {
      setError('Alege clubul.');
      return;
    }
    if (!form.city) {
      setError('Alege localitatea.');
      return;
    }
    if (isLicensed && !licenseImage) {
      setError('Încarcă poza legitimației.');
      return;
    }
    if (!isLicensed && !licenseRequestDocument) {
      setError('Încarcă cererea de legitimare.');
      return;
    }

    setBusy(true);
    try {
      const { license_series, ...formFields } = form;
      const payload = new FormData();
      Object.entries({ ...formFields, date_of_birth: isoDate }).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });
      payload.append('is_licensed', isLicensed ? 'true' : 'false');
      if (isLicensed) {
        if (license_series) payload.append('license_series', license_series);
        if (licenseImage) payload.append('license_image', licenseImage);
      } else if (licenseRequestDocument) {
        payload.append('license_request_document', licenseRequestDocument);
      }
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pt-10 sm:pt-16">
      <Seo title="Profil sportiv" path="/onboarding/sportiv" noindex />
      <h1 className="font-display text-3xl font-semibold leading-snug tracking-normal">Profil sportiv</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Stare legitimare</span>
          <div className="flex gap-3">
            {[
              { value: true, label: 'Sunt sportiv legitimat' },
              { value: false, label: 'Doresc legitimație' },
            ].map((option) => (
              <label
                key={String(option.value)}
                className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition ${
                  isLicensed === option.value ? 'border-[#0a4c75] bg-[#0a4c75]/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="isLicensed"
                  checked={isLicensed === option.value}
                  onChange={() => handleLicenseStatusChange(option.value)}
                  className="h-4 w-4 accent-[#0a4c75]"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

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
            <Input id="mobile_number" required value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
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
          <div className="flex flex-col gap-1">
            <Label htmlFor="cnp">CNP</Label>
            <Input
              id="cnp"
              required
              inputMode="numeric"
              maxLength={13}
              value={form.cnp}
              onChange={(e) => update('cnp', e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {isLicensed ? (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="license_series">Serie legitimație</Label>
                <Input
                  id="license_series"
                  required
                  value={form.license_series}
                  onChange={(e) => update('license_series', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="license_image">Poză legitimație</Label>
                <Input
                  id="license_image"
                  type="file"
                  required
                  accept="image/*"
                  onChange={(e) => setLicenseImage(e.target.files?.[0] ?? null)}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="license_request_document">Cerere de legitimare</Label>
              <Input
                id="license_request_document"
                type="file"
                required
                accept="image/*,.pdf"
                onChange={(e) => setLicenseRequestDocument(e.target.files?.[0] ?? null)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="emergency_contact_name">Contact de urgență - nume</Label>
            <Input
              id="emergency_contact_name"
              required
              value={form.emergency_contact_name}
              onChange={(e) => update('emergency_contact_name', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="emergency_contact_phone">Contact de urgență - telefon</Label>
            <Input
              id="emergency_contact_phone"
              required
              value={form.emergency_contact_phone}
              onChange={(e) => update('emergency_contact_phone', e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? 'Se trimite…' : 'Trimite profilul spre aprobare'}
        </Button>
      </form>
    </div>
  );
}
