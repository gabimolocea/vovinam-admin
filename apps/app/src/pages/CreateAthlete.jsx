import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { athleteAPI, cityAPI, clubAPI, gradeAPI, competitionAPI, visaAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import {
  Alert, Button, Checkbox, Input, Label, Req,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui';
import Lightbox from '../components/Lightbox';
import { ArrowLeft, ImagePlus, Plus, Search, Sparkles, X } from 'lucide-react';

const MAJOR_CITIES = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov'];

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Legitimații often print names in ALL CAPS - the AI reads them verbatim, so
// normalize to "Title Case" (incl. after hyphens/spaces) before prefilling.
function toTitleCase(text) {
  if (!text) return text;
  return text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
}

const INITIAL = {
  first_name: '',
  last_name: '',
  club: '',
  gender: '',
  license_series: '',
  license_number: '',
  cnp: '',
  date_of_birth: '',
  mobile_number: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  city: '',
  is_coach: false,
  is_instructor: false,
  is_referee: false,
  referee_level: '',
  referee_category: '',
  registered_date: '',
  expiration_date: '',
};

const REFEREE_LEVEL_OPTIONS = [
  { id: 'national', name: 'Național' },
  { id: 'international', name: 'Internațional' },
];

const REFEREE_CATEGORY_OPTIONS = [
  { id: 'A', name: 'Categoria A' },
  { id: 'B', name: 'Categoria B' },
  { id: 'C', name: 'Categoria C' },
  { id: 'stagiar', name: 'Stagiar' },
];

const INITIAL_GRADE = {
  grade: '',
  event: '',
  obtained_date: new Date().toISOString().split('T')[0],
  level: 'good',
};

const GENDER_OPTIONS = [
  { id: 'male', name: 'Masculin' },
  { id: 'female', name: 'Feminin' },
];

const LEVEL_OPTIONS = [
  { id: 'good', name: 'Bun' },
  { id: 'bad', name: 'Nesatisfăcător' },
];

function SectionHeading({ children }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

export default function CreateAthlete() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const clubParam = searchParams.get('club') || '';
  const backTo = isAdmin ? `/cluburi/${clubParam}` : '/club?tab=sportivi';
  const [form, setForm] = useState({ ...INITIAL, club: clubParam });
  const [clubs, setClubs] = useState([]);
  const [gradeForm, setGradeForm] = useState(INITIAL_GRADE);
  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [medicalVisaImage, setMedicalVisaImage] = useState(null);
  const [medicalVisaPreview, setMedicalVisaPreview] = useState(null);
  const [medicalVisaDate, setMedicalVisaDate] = useState('');
  const [licenseImage, setLicenseImage] = useState(null);
  const [licensePreview, setLicensePreview] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [exampleZoomOpen, setExampleZoomOpen] = useState(false);
  const [cities, setCities] = useState([]);
  const [grades, setGrades] = useState([]);
  const [exams, setExams] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef();
  const licenseInputRef = useRef();
  const medicalVisaInputRef = useRef();
  const cityBoxRef = useRef(null);
  const [cityQuery, setCityQuery] = useState('');
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  useEffect(() => {
    cityAPI.list().then(r => setCities(r.data?.results || r.data || [])).catch(() => {});
    gradeAPI.list().then(r => setGrades(r.data?.results || r.data || [])).catch(() => {});
    competitionAPI.list({ event_type: 'examination' })
      .then(r => setExams(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
      .catch(() => {});
    if (isAdmin) {
      clubAPI.list().then(r => setClubs(r.data?.results || r.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (cityBoxRef.current && !cityBoxRef.current.contains(event.target)) {
        setShowCitySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCities = useMemo(() => {
    const normalizedQuery = normalizeText(cityQuery.trim());
    const sortedCities = [...cities].sort((a, b) => {
      const aMajor = MAJOR_CITIES.includes(a.name) ? 0 : 1;
      const bMajor = MAJOR_CITIES.includes(b.name) ? 0 : 1;
      if (aMajor !== bMajor) return aMajor - bMajor;
      return a.name.localeCompare(b.name, 'ro');
    });

    if (!normalizedQuery) {
      return sortedCities;
    }

    return sortedCities.filter((city) => normalizeText(city.name).includes(normalizedQuery));
  }, [cities, cityQuery]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const update = (name, value) => setForm(prev => ({ ...prev, [name]: value }));

  const selectCity = (city) => {
    setForm((prev) => ({ ...prev, city: city.id }));
    setCityQuery(city.name);
    setShowCitySuggestions(false);
  };

  const handleCityChange = (e) => {
    const value = e.target.value;
    setCityQuery(value);
    setShowCitySuggestions(true);

    const exact = cities.find((city) => normalizeText(city.name) === normalizeText(value));
    setForm((prev) => ({ ...prev, city: exact ? exact.id : '' }));
  };

  const handleCityBlur = () => {
    const exact = cities.find((city) => normalizeText(city.name) === normalizeText(cityQuery));
    if (!exact) {
      setForm((prev) => ({ ...prev, city: '' }));
    }
    if (!cityQuery.trim()) {
      setForm((prev) => ({ ...prev, city: '' }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setProfilePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleLicenseImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLicenseImage(file);
    setAiNote('');
    const reader = new FileReader();
    reader.onloadend = () => setLicensePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleMedicalVisaImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMedicalVisaImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setMedicalVisaPreview(reader.result);
    reader.readAsDataURL(file);
  };

  async function handleAiAutofill() {
    if (!licenseImage) return;
    setAiBusy(true);
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', licenseImage);
      const { data } = await athleteAPI.extractLicense(formData);
      const suggested = data?.suggested ?? {};

      setForm((f) => ({
        ...f,
        first_name: f.first_name || toTitleCase(suggested.first_name) || f.first_name,
        last_name: f.last_name || toTitleCase(suggested.last_name) || f.last_name,
        date_of_birth: f.date_of_birth || suggested.date_of_birth || f.date_of_birth,
        gender: f.gender || suggested.gender || f.gender,
        cnp: f.cnp || suggested.cnp || f.cnp,
        license_series: f.license_series || suggested.license_series || f.license_series,
        license_number: f.license_number || suggested.license_number || f.license_number,
        registered_date: f.registered_date || suggested.license_issued_date || f.registered_date,
        expiration_date: f.expiration_date || suggested.license_expiry_date || f.expiration_date,
      }));
      if (!form.city && suggested.city_id && suggested.city_name) {
        selectCity({ id: suggested.city_id, name: suggested.city_name });
      }
      setAiNote('Câmpurile au fost completate automat pe baza legitimației. Verifică-le înainte de a salva.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setAiBusy(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (isAdmin && !form.club) {
      setError('Clubul este obligatoriu.');
      return;
    }

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('Prenumele și numele sunt obligatorii.');
      return;
    }

    if (!form.gender) {
      setError('Genul este obligatoriu.');
      return;
    }

    if (!form.date_of_birth) {
      setError('Data nașterii este obligatorie.');
      return;
    }

    if (!licenseImage) {
      setError('Poza legitimației este obligatorie.');
      return;
    }

    if (!form.license_series.trim() || !form.license_number.trim()) {
      setError('Seria și numărul legitimației sunt obligatorii.');
      return;
    }

    if (!form.cnp.trim()) {
      setError('CNP-ul este obligatoriu.');
      return;
    }

    if (!form.emergency_contact_name.trim() || !form.emergency_contact_phone.trim()) {
      setError('Numele și telefonul contactului de urgență sunt obligatorii.');
      return;
    }

    if (medicalVisaImage && !medicalVisaDate) {
      setError('Data obținerii vizei medicale este obligatorie.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('coach_create', 'true');

      Object.entries(form).forEach(([key, val]) => {
        if (val !== '' && val !== null && val !== undefined) {
          fd.append(key, val);
        }
      });

      if (profileImage) fd.append('profile_image', profileImage);
      if (licenseImage) fd.append('license_image', licenseImage);

      const athlete = await api.post('/athletes/', fd);

      if (gradeForm.grade) {
        await api.post('/grade-histories/', {
          athlete: athlete.data.id,
          grade: gradeForm.grade,
          event: gradeForm.event || null,
          obtained_date: gradeForm.obtained_date,
          level: gradeForm.level,
        });
      }

      if (medicalVisaImage) {
        const visaFd = new FormData();
        visaFd.append('athlete', athlete.data.id);
        visaFd.append('visa_type', 'medical');
        visaFd.append('issued_date', medicalVisaDate);
        visaFd.append('image', medicalVisaImage);
        await visaAPI.submissions.create(visaFd);
      }

      navigate(backTo);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const msgs = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        setError(msgs.join('\n'));
      } else {
        setError('Eroare la salvare. Încearcă din nou.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate(backTo)}>
          <ArrowLeft className="h-4 w-4" /> Înapoi
        </Button>
        <h1 className="font-display text-2xl font-bold">Adaugă sportiv</h1>
      </div>

      {error && <Alert variant="destructive" className="whitespace-pre-line">{error}</Alert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <SectionHeading>Legitimație<Req /></SectionHeading>
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex flex-col items-start gap-2">
              <button
                type="button"
                onClick={() => licenseInputRef.current?.click()}
                className="flex aspect-[3/2] w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-muted text-muted-foreground transition hover:bg-accent"
              >
                {licensePreview ? (
                  <img src={licensePreview} alt="Previzualizare legitimație" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
              </button>
              <input ref={licenseInputRef} type="file" accept="image/*" onChange={handleLicenseImageChange} className="hidden" />
              {licenseImage && <p className="max-w-[220px] truncate text-xs font-medium text-muted-foreground">{licenseImage.name}</p>}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={aiBusy || !licenseImage}
                onClick={handleAiAutofill}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiBusy ? 'Se completează…' : 'Completează automat cu AI'}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setExampleZoomOpen(true)}
              className="flex cursor-zoom-in flex-col items-center gap-1"
              aria-label="Mărește exemplul de legitimație"
            >
              <img
                src="/exemplu-legitimatie.jpg"
                alt="Exemplu de poză cu legitimația sportivă"
                className="h-24 w-auto rounded-md border border-border object-cover transition hover:opacity-90"
              />
              <span className="text-xs text-muted-foreground">Exemplu</span>
            </button>
          </div>
          {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}

          <Lightbox
            image={exampleZoomOpen ? { image: '/exemplu-legitimatie.jpg', alt_text: 'Exemplu de poză cu legitimația sportivă' } : null}
            onClose={() => setExampleZoomOpen(false)}
          />
        </section>

        {isAdmin && (
          <section className="flex flex-col gap-4 border-t border-border pt-6">
            <SectionHeading>Club</SectionHeading>
            <div className="flex flex-col gap-1 sm:w-1/2 sm:pr-2">
              <Label>Club<Req /></Label>
              <Select value={form.club} onValueChange={(v) => update('club', v)}>
                <SelectTrigger><SelectValue placeholder="Alege clubul" /></SelectTrigger>
                <SelectContent>
                  {clubs.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <SectionHeading>Date personale</SectionHeading>
          <div className="flex flex-col gap-1">
            <Label>Fotografie sportiv</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-[3/2] w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-muted text-muted-foreground transition hover:bg-accent"
              >
                {profilePreview ? (
                  <img src={profilePreview} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              {profileImage && (
                <div className="text-xs text-muted-foreground">
                  <p className="max-w-[140px] truncate font-medium">{profileImage.name}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setProfileImage(null); setProfilePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="mt-1 h-auto px-0 text-destructive hover:bg-transparent"
                  >
                    <X className="h-3 w-3" /> Șterge
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_first_name">Prenume<Req /></Label>
              <Input id="ca_first_name" name="first_name" value={form.first_name} onChange={handleChange} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_last_name">Nume<Req /></Label>
              <Input id="ca_last_name" name="last_name" value={form.last_name} onChange={handleChange} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Gen<Req /></Label>
              <Select value={form.gender} onValueChange={(v) => update('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Alege" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_dob">Data nașterii<Req /></Label>
              <Input id="ca_dob" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_license">Serie legitimație<Req /></Label>
              <Input id="ca_license" name="license_series" value={form.license_series} onChange={handleChange} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_license_number">Număr legitimație<Req /></Label>
              <Input id="ca_license_number" name="license_number" value={form.license_number} onChange={handleChange} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_cnp">CNP<Req /></Label>
              <Input id="ca_cnp" name="cnp" value={form.cnp} onChange={handleChange} maxLength={13} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_phone">Telefon</Label>
              <Input id="ca_phone" name="mobile_number" value={form.mobile_number} onChange={handleChange} />
            </div>
            <div ref={cityBoxRef} className="relative flex flex-col gap-1">
              <Label>Oraș</Label>
              <div className="relative">
                <Input
                  value={cityQuery}
                  onChange={handleCityChange}
                  onFocus={() => setShowCitySuggestions(true)}
                  onBlur={handleCityBlur}
                  placeholder="Caută orașul…"
                  className="pr-9"
                  autoComplete="off"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {showCitySuggestions && filteredCities.length > 0 && (
                <div className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {filteredCities.map((city, index) => {
                    const selected = Number(form.city) === Number(city.id);
                    const isMajor = MAJOR_CITIES.includes(city.name);
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCity(city)}
                        className={`flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm transition last:border-b-0 ${
                          selected ? 'bg-accent font-semibold' : 'hover:bg-accent'
                        }`}
                      >
                        <span className="truncate">{city.name}</span>
                        <span className="ml-3 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {selected ? 'SELECTAT' : (!cityQuery.trim() && isMajor && index < MAJOR_CITIES.length ? 'SUGERAT' : '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {showCitySuggestions && filteredCities.length === 0 && cityQuery.trim() && (
                <div className="absolute top-full z-30 mt-1 w-full rounded-md border border-border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-md">
                  Niciun oraș găsit.
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_registered">Data înregistrării</Label>
              <Input id="ca_registered" name="registered_date" type="date" value={form.registered_date} onChange={handleChange} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_expiration">Data expirării</Label>
              <Input id="ca_expiration" name="expiration_date" type="date" value={form.expiration_date} onChange={handleChange} />
            </div>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex cursor-pointer items-center gap-2.5 text-base">
                  <Checkbox
                    className="h-5 w-5"
                    checked={form.is_coach}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, is_coach: checked === true, is_instructor: checked === true ? false : f.is_instructor }))}
                  />
                  Antrenor
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-base">
                  <Checkbox
                    className="h-5 w-5"
                    checked={form.is_instructor}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, is_instructor: checked === true, is_coach: checked === true ? false : f.is_coach }))}
                  />
                  Instructor
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-base">
                  <Checkbox
                    className="h-5 w-5"
                    checked={form.is_referee}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, is_referee: checked === true, referee_level: checked === true ? f.referee_level : '', referee_category: checked === true ? f.referee_category : '' }))}
                  />
                  Arbitru
                </label>
              </div>
              {form.is_referee && (
                <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/50 p-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label>Nivel arbitraj</Label>
                    <Select value={form.referee_level} onValueChange={(v) => update('referee_level', v)}>
                      <SelectTrigger><SelectValue placeholder="Alege" /></SelectTrigger>
                      <SelectContent>
                        {REFEREE_LEVEL_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.referee_level === 'national' && (
                    <div className="flex flex-col gap-1">
                      <Label>Categorie arbitru</Label>
                      <Select value={form.referee_category} onValueChange={(v) => update('referee_category', v)}>
                        <SelectTrigger><SelectValue placeholder="Alege" /></SelectTrigger>
                        <SelectContent>
                          {REFEREE_CATEGORY_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <SectionHeading>Contact de urgență (părinte, tutore)</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_emg_name">Nume contact<Req /></Label>
              <Input id="ca_emg_name" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_emg_phone">Telefon contact<Req /></Label>
              <Input id="ca_emg_phone" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} required />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <SectionHeading>Grad (opțional)</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>Grad acordat</Label>
              <Select value={gradeForm.grade} onValueChange={(v) => setGradeForm(prev => ({ ...prev, grade: v }))}>
                <SelectTrigger><SelectValue placeholder="Alege" /></SelectTrigger>
                <SelectContent>
                  {grades.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Examen</Label>
              <Select value={gradeForm.event} onValueChange={(v) => setGradeForm(prev => ({ ...prev, event: v }))}>
                <SelectTrigger><SelectValue placeholder="Alege examenul" /></SelectTrigger>
                <SelectContent>
                  {exams.map((ev) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca_grade_date">Data obținerii</Label>
              <Input
                id="ca_grade_date"
                type="date"
                value={gradeForm.obtained_date}
                onChange={(e) => setGradeForm(prev => ({ ...prev, obtained_date: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Nivel</Label>
              <Select value={gradeForm.level} onValueChange={(v) => setGradeForm(prev => ({ ...prev, level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <SectionHeading>Viză medicală</SectionHeading>
          <div className="flex flex-col gap-1">
            <Label>Dovadă (poză)</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => medicalVisaInputRef.current?.click()}
                className="flex aspect-[3/2] w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-muted text-muted-foreground transition hover:bg-accent"
              >
                {medicalVisaPreview ? (
                  <img src={medicalVisaPreview} alt="Previzualizare dovadă viză medicală" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
              </button>
              <input ref={medicalVisaInputRef} type="file" accept="image/*" onChange={handleMedicalVisaImageChange} className="hidden" />
              {medicalVisaImage && <p className="max-w-[220px] truncate text-xs font-medium text-muted-foreground">{medicalVisaImage.name}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1 sm:w-1/2 sm:pr-2">
            <Label htmlFor="ca_medical_visa_date">Data obținerii</Label>
            <Input
              id="ca_medical_visa_date"
              type="date"
              value={medicalVisaDate}
              onChange={(e) => setMedicalVisaDate(e.target.value)}
            />
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
          <Button type="button" variant="outline" onClick={() => navigate(backTo)}>
            Anulează
          </Button>
          <Button
            type="submit"
            disabled={
              saving
              || (isAdmin && !form.club)
              || !licenseImage
              || !form.license_series.trim()
              || !form.license_number.trim()
              || !form.cnp.trim()
              || !form.emergency_contact_name.trim()
              || !form.emergency_contact_phone.trim()
            }
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Se salvează…' : 'Salvează sportivul'}
          </Button>
        </div>
      </form>
    </div>
  );
}
