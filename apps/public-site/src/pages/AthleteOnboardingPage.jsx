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

/** Marks a field's label as required. */
function Req() {
  return <span className="text-destructive"> *</span>;
}

const ERROR_INPUT_CLASS = '!border-destructive focus-visible:!ring-destructive';

/** IDs/legitimații often print names in ALL CAPS - the AI reads them
 * verbatim, so normalize to "Title Case" (incl. after hyphens/spaces,
 * e.g. "Ana-Maria Popescu-Ionescu") before prefilling the form. */
function toTitleCase(text) {
  if (!text) return text;
  return text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
}

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
  const [fieldErrors, setFieldErrors] = useState({});
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
  // Supporters never need this form, and an athlete/coach who already has
  // a profile record shouldn't submit a second one. Gate on `user.athlete`
  // itself rather than `user.profile_completed` - that flag can drift out
  // of sync (e.g. an admin later deletes/rejects the profile), which would
  // otherwise bounce the user straight back to /cont with no way to reach
  // this form again.
  if (user.role === 'supporter' || user.athlete) return <Navigate to="/cont" replace />;

  function clearFieldError(field) {
    setFieldErrors((errs) => (errs[field] ? { ...errs, [field]: false } : errs));
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    clearFieldError(field);
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
    clearFieldError('license_image');
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
        first_name: f.first_name || toTitleCase(suggested.first_name) || f.first_name,
        last_name: f.last_name || toTitleCase(suggested.last_name) || f.last_name,
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

  function getFieldErrors() {
    const errors = {};
    if (!form.first_name.trim()) errors.first_name = true;
    if (!form.last_name.trim()) errors.last_name = true;
    if (!displayToIso(form.date_of_birth)) errors.date_of_birth = true;
    if (!form.gender) errors.gender = true;
    if (!form.club) errors.club = true;
    if (!form.city) errors.city = true;
    if (!form.mobile_number.trim()) errors.mobile_number = true;
    if (!form.cnp.trim()) errors.cnp = true;
    if (!form.nationality.trim()) errors.nationality = true;
    if (isLicensed) {
      if (!form.license_series.trim()) errors.license_series = true;
      if (!form.license_number.trim()) errors.license_number = true;
      if (!displayToIso(form.registered_date)) errors.registered_date = true;
      if (!displayToIso(form.expiration_date)) errors.expiration_date = true;
      if (!licenseImage) errors.license_image = true;
    } else if (!licenseRequestDocument) {
      errors.license_request_document = true;
    }
    if (!form.emergency_contact_name.trim()) errors.emergency_contact_name = true;
    if (!form.emergency_contact_phone.trim()) errors.emergency_contact_phone = true;
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = getFieldErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('Completează toate câmpurile obligatorii, marcate mai jos.');
      return;
    }

    const isoDate = displayToIso(form.date_of_birth);
    const registeredIso = isLicensed ? displayToIso(form.registered_date) : null;
    const expirationIso = isLicensed ? displayToIso(form.expiration_date) : null;

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
      navigate('/cont/profil', { replace: true });
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
            <Label htmlFor="license_image">Poză legitimație<Req /></Label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div
                  className={`relative flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition ${
                    dragActive
                      ? 'border-[#0a4c75] bg-[#0a4c75]/5'
                      : fieldErrors.license_image
                        ? 'border-destructive bg-destructive/5'
                        : 'border-border bg-muted/30 hover:border-[#0a4c75] hover:bg-[#0a4c75]/5'
                  }`}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={() => setDragActive(false)}
                >
                  <input
                    id="license_image"
                    type="file"
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
              <Label htmlFor="first_name">Prenume<Req /></Label>
              <Input
                id="first_name"
                className={fieldErrors.first_name ? ERROR_INPUT_CLASS : ''}
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="last_name">Nume<Req /></Label>
              <Input
                id="last_name"
                className={fieldErrors.last_name ? ERROR_INPUT_CLASS : ''}
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="date_of_birth">Data nașterii<Req /></Label>
              <Input
                id="date_of_birth"
                inputMode="numeric"
                placeholder="zz.ll.aaaa"
                className={fieldErrors.date_of_birth ? ERROR_INPUT_CLASS : ''}
                value={form.date_of_birth}
                onChange={(e) => update('date_of_birth', maskDateInput(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Gen<Req /></Label>
              <Select value={form.gender} onValueChange={(value) => update('gender', value)}>
                <SelectTrigger className={fieldErrors.gender ? ERROR_INPUT_CLASS : ''}>
                  <SelectValue placeholder="Nespecificat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Masculin</SelectItem>
                  <SelectItem value="female">Feminin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Club<Req /></Label>
              <Select value={form.club ? String(form.club) : ''} onValueChange={(value) => update('club', value)}>
                <SelectTrigger className={fieldErrors.club ? ERROR_INPUT_CLASS : ''}>
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
              <Label>Localitate<Req /></Label>
              <SearchableSelect
                value={selectedCity}
                onChange={handleCityChange}
                onSearch={searchCities}
                placeholder="Scrie pentru a căuta localitatea…"
                error={fieldErrors.city}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mobile_number">Telefon mobil<Req /></Label>
              <Input
                id="mobile_number"
                className={fieldErrors.mobile_number ? ERROR_INPUT_CLASS : ''}
                value={form.mobile_number}
                onChange={(e) => update('mobile_number', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cnp">CNP<Req /></Label>
              <Input
                id="cnp"
                inputMode="numeric"
                maxLength={13}
                className={fieldErrors.cnp ? ERROR_INPUT_CLASS : ''}
                value={form.cnp}
                onChange={(e) => update('cnp', e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="nationality">Naționalitate<Req /></Label>
              <Select
                value={form.nationality === 'Română' ? 'Română' : '__custom__'}
                onValueChange={(value) => update('nationality', value === '__custom__' ? '' : value)}
              >
                <SelectTrigger id="nationality" className={fieldErrors.nationality ? ERROR_INPUT_CLASS : ''}>
                  <SelectValue placeholder="Alege naționalitatea" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Română">Română</SelectItem>
                  <SelectItem value="__custom__">Altă naționalitate</SelectItem>
                </SelectContent>
              </Select>
              {form.nationality !== 'Română' && (
                <Input
                  placeholder="Scrie naționalitatea"
                  className={`mt-1 ${fieldErrors.nationality ? ERROR_INPUT_CLASS : ''}`}
                  value={form.nationality}
                  onChange={(e) => update('nationality', e.target.value)}
                />
              )}
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
                  <Label htmlFor="license_series">Serie<Req /></Label>
                  <Input
                    id="license_series"
                    className={fieldErrors.license_series ? ERROR_INPUT_CLASS : ''}
                    value={form.license_series}
                    onChange={(e) => update('license_series', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="license_number">Număr<Req /></Label>
                  <Input
                    id="license_number"
                    inputMode="numeric"
                    className={fieldErrors.license_number ? ERROR_INPUT_CLASS : ''}
                    value={form.license_number}
                    onChange={(e) => update('license_number', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="registered_date">Eliberată la data de<Req /></Label>
                  <Input
                    id="registered_date"
                    inputMode="numeric"
                    placeholder="zz.ll.aaaa"
                    className={fieldErrors.registered_date ? ERROR_INPUT_CLASS : ''}
                    value={form.registered_date}
                    onChange={(e) => update('registered_date', maskDateInput(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="expiration_date">Expiră la data de<Req /></Label>
                  <Input
                    id="expiration_date"
                    inputMode="numeric"
                    placeholder="zz.ll.aaaa"
                    className={fieldErrors.expiration_date ? ERROR_INPUT_CLASS : ''}
                    value={form.expiration_date}
                    onChange={(e) => update('expiration_date', maskDateInput(e.target.value))}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="license_request_document">Cerere de legitimare<Req /></Label>
                <Input
                  id="license_request_document"
                  type="file"
                  accept="image/*,.pdf"
                  className={fieldErrors.license_request_document ? ERROR_INPUT_CLASS : ''}
                  onChange={(e) => {
                    setLicenseRequestDocument(e.target.files?.[0] ?? null);
                    clearFieldError('license_request_document');
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0a4c75]">Contact de urgență</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="emergency_contact_name">Nume<Req /></Label>
              <Input
                id="emergency_contact_name"
                className={fieldErrors.emergency_contact_name ? ERROR_INPUT_CLASS : ''}
                value={form.emergency_contact_name}
                onChange={(e) => update('emergency_contact_name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="emergency_contact_phone">Telefon<Req /></Label>
              <Input
                id="emergency_contact_phone"
                className={fieldErrors.emergency_contact_phone ? ERROR_INPUT_CLASS : ''}
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
