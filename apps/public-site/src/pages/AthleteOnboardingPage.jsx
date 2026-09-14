import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, athleteAPI, publicContentAPI, cityAPI } from '@shared';
import {
  Alert, Button, Input, Label, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui';
import SearchableSelect from '../components/SearchableSelect';
import Lightbox from '../components/Lightbox';
import Seo from '../components/Seo';
import { Sparkles, Upload } from 'lucide-react';
import { displayToIso, formatIsoToDisplay, maskDateInput } from '../lib/dateFormat';

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
    nationality: 'Română',
    license_series: '',
    license_number: '',
    registered_date: '',
    expiration_date: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });
  const [isLicensed, setIsLicensed] = useState(true);
  const [licenseImage, setLicenseImage] = useState(null);
  const [licenseImagePreview, setLicenseImagePreview] = useState(null);
  const [licenseRequestDocument, setLicenseRequestDocument] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNotice, setOcrNotice] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [exampleZoomOpen, setExampleZoomOpen] = useState(false);

  useEffect(() => {
    publicContentAPI.clubs.list().then((res) => setClubs(res.data ?? [])).catch(() => {});
  }, []);

  // Revoke the previous object URL whenever the preview changes/unmounts,
  // so swapping the license photo doesn't leak blob URLs.
  useEffect(() => () => {
    if (licenseImagePreview) URL.revokeObjectURL(licenseImagePreview);
  }, [licenseImagePreview]);

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
    setLicenseImagePreview(null);
    setLicenseRequestDocument(null);
  }

  function handleLicenseImageChange(e) {
    const file = e.target.files?.[0] ?? null;
    setLicenseImage(file);
    setLicenseImagePreview(file ? URL.createObjectURL(file) : null);
    setOcrNotice('');
  }

  async function handleAiAutofill() {
    if (!licenseImage) return;
    setOcrBusy(true);
    setOcrNotice('');
    try {
      const formData = new FormData();
      formData.append('image', licenseImage);
      const { data } = await athleteAPI.extractLicense(formData);
      const suggested = data?.suggested ?? {};

      // Only fill fields the athlete hasn't already typed something into -
      // never overwrite what they entered themselves. Nationality starts
      // pre-filled with a default ("Română") rather than empty, so it's
      // taken from the card whenever the AI could read one, instead of
      // being gated on the field being empty like the others.
      setForm((f) => ({
        ...f,
        first_name: f.first_name || suggested.first_name || f.first_name,
        last_name: f.last_name || suggested.last_name || f.last_name,
        date_of_birth: f.date_of_birth || (suggested.date_of_birth ? formatIsoToDisplay(suggested.date_of_birth) : f.date_of_birth),
        gender: f.gender || suggested.gender || f.gender,
        cnp: f.cnp || suggested.cnp || f.cnp,
        nationality: suggested.nationality || f.nationality,
        club: f.club || (suggested.club_id ? String(suggested.club_id) : f.club),
        license_series: f.license_series || suggested.license_series || f.license_series,
        license_number: f.license_number || suggested.license_number || f.license_number,
        registered_date: f.registered_date || (suggested.license_issued_date ? formatIsoToDisplay(suggested.license_issued_date) : f.registered_date),
        expiration_date: f.expiration_date || (suggested.license_expiry_date ? formatIsoToDisplay(suggested.license_expiry_date) : f.expiration_date),
      }));
      if (!selectedCity && suggested.city_id && suggested.city_name) {
        setSelectedCity({ id: suggested.city_id, name: suggested.city_name });
        update('city', suggested.city_id);
      }
      setOcrNotice('Am completat automat câmpurile pe care le-am putut citi din poză - verifică-le și corectează-le dacă este cazul înainte de a trimite.');
    } catch {
      setOcrNotice('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setOcrBusy(false);
    }
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

    let registeredIso = null;
    let expirationIso = null;
    if (isLicensed) {
      registeredIso = displayToIso(form.registered_date);
      if (!registeredIso) {
        setError('Introdu data eliberării legitimației, în formatul zz.ll.aaaa.');
        return;
      }
      expirationIso = displayToIso(form.expiration_date);
      if (!expirationIso) {
        setError('Introdu data expirării legitimației, în formatul zz.ll.aaaa.');
        return;
      }
    }

    setBusy(true);
    try {
      const { license_series, license_number, ...formFields } = form;
      delete formFields.registered_date;
      delete formFields.expiration_date;
      const payload = new FormData();
      Object.entries({ ...formFields, date_of_birth: isoDate }).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });
      payload.append('is_licensed', isLicensed ? 'true' : 'false');
      if (isLicensed) {
        if (license_series) payload.append('license_series', license_series);
        if (license_number) payload.append('license_number', license_number);
        if (registeredIso) payload.append('registered_date', registeredIso);
        if (expirationIso) payload.append('expiration_date', expirationIso);
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
              { value: false, label: 'Doresc legitimație', disabled: true },
            ].map((option) => (
              <label
                key={String(option.value)}
                className={`flex flex-1 items-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition ${
                  isLicensed === option.value ? 'border-[#0a4c75] bg-[#0a4c75]/5' : 'border-border'
                } ${option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="isLicensed"
                  checked={isLicensed === option.value}
                  disabled={option.disabled}
                  onChange={() => handleLicenseStatusChange(option.value)}
                  className="h-4 w-4 accent-[#0a4c75]"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {isLicensed && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="license_image">Poză legitimație</Label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div
                  className={`relative flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition ${
                    dragActive ? 'border-[#0a4c75] bg-[#0a4c75]/5' : 'border-border bg-muted/30 hover:border-[#0a4c75] hover:bg-[#0a4c75]/5'
                  }`}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={() => setDragActive(false)}
                >
                  <input
                    id="license_image"
                    type="file"
                    required
                    accept="image/*"
                    onChange={handleLicenseImageChange}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  {licenseImagePreview ? (
                    <img
                      src={licenseImagePreview}
                      alt="Previzualizare legitimație"
                      className="pointer-events-none h-full w-auto rounded object-contain"
                    />
                  ) : (
                    <>
                      <Upload className="pointer-events-none h-7 w-7 text-muted-foreground" aria-hidden="true" />
                      <p className="pointer-events-none text-xs text-muted-foreground">
                        <span className="font-medium text-[#0a4c75]">Apasă pentru a încărca</span> sau trage poza aici
                      </p>
                    </>
                  )}
                </div>
                {licenseImagePreview && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    disabled={ocrBusy}
                    onClick={handleAiAutofill}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {ocrBusy ? 'Se completează…' : 'Completează datele din imagine cu AI'}
                  </Button>
                )}
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExampleZoomOpen(true)}
                  className="cursor-zoom-in border-0 bg-transparent p-0"
                  aria-label="Mărește exemplul de legitimație"
                >
                  <img
                    src="/exemplu-legitimatie.jpg"
                    alt="Exemplu de poză cu legitimația sportivă"
                    className="h-40 w-auto rounded-lg border border-border object-cover"
                  />
                </button>
                <span className="text-xs text-muted-foreground">Exemplu (apasă pentru zoom)</span>
              </div>
            </div>

            {ocrNotice && <span className="text-xs text-[#0a4c75]">{ocrNotice}</span>}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0a4c75]">Date personale</h2>
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
            <div className="flex flex-col gap-1">
              <Label>Localitate</Label>
              <SearchableSelect
                value={selectedCity}
                onChange={handleCityChange}
                onSearch={searchCities}
                placeholder="Scrie pentru a căuta localitatea…"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mobile_number">Telefon mobil</Label>
              <Input id="mobile_number" required value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="nationality">Naționalitate</Label>
              <Input id="nationality" required value={form.nationality} onChange={(e) => update('nationality', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0a4c75]">
            {isLicensed ? 'Legitimație' : 'Cerere de legitimare'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {isLicensed ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="license_series">Serie</Label>
                  <Input
                    id="license_series"
                    required
                    value={form.license_series}
                    onChange={(e) => update('license_series', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="license_number">Număr</Label>
                  <Input
                    id="license_number"
                    required
                    inputMode="numeric"
                    value={form.license_number}
                    onChange={(e) => update('license_number', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="registered_date">Eliberată la data de</Label>
                  <Input
                    id="registered_date"
                    required
                    inputMode="numeric"
                    placeholder="zz.ll.aaaa"
                    value={form.registered_date}
                    onChange={(e) => update('registered_date', maskDateInput(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="expiration_date">Expiră la data de</Label>
                  <Input
                    id="expiration_date"
                    required
                    inputMode="numeric"
                    placeholder="zz.ll.aaaa"
                    value={form.expiration_date}
                    onChange={(e) => update('expiration_date', maskDateInput(e.target.value))}
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
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0a4c75]">Contact de urgență</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="emergency_contact_name">Nume</Label>
              <Input
                id="emergency_contact_name"
                required
                value={form.emergency_contact_name}
                onChange={(e) => update('emergency_contact_name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="emergency_contact_phone">Telefon</Label>
              <Input
                id="emergency_contact_phone"
                required
                value={form.emergency_contact_phone}
                onChange={(e) => update('emergency_contact_phone', e.target.value)}
              />
            </div>
          </div>
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? 'Se trimite…' : 'Trimite profilul spre aprobare'}
        </Button>
      </form>

      <Lightbox
        image={exampleZoomOpen ? { image: '/exemplu-legitimatie.jpg', alt_text: 'Exemplu de poză cu legitimația sportivă' } : null}
        onClose={() => setExampleZoomOpen(false)}
      />
    </div>
  );
}
