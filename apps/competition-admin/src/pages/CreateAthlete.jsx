import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { cityAPI, gradeAPI } from '@shared/lib/api';
import {
  Button,
  Input,
  Textarea,
  Label,
  Checkbox,
  Card,
  Alert,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui';

const MAJOR_CITIES = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov'];

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const INITIAL = {
  first_name: '',
  last_name: '',
  gender: '',
  license_series: '',
  cnp: '',
  date_of_birth: '',
  address: '',
  mobile_number: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  previous_experience: '',
  city: '',
  current_grade: '',
  is_coach: false,
  is_referee: false,
  registered_date: '',
  expiration_date: '',
};

export default function CreateAthlete() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [medicalCert, setMedicalCert] = useState(null);
  const [cities, setCities] = useState([]);
  const [grades, setGrades] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef();
  const cityBoxRef = useRef(null);
  const [cityQuery, setCityQuery] = useState('');
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  useEffect(() => {
    cityAPI.list().then((r) => setCities(r.data?.results || r.data || [])).catch(() => {});
    gradeAPI.list().then((r) => setGrades(r.data?.results || r.data || [])).catch(() => {});
  }, []);

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

    if (!normalizedQuery) return sortedCities;
    return sortedCities.filter((city) => normalizeText(city.name).includes(normalizedQuery));
  }, [cities, cityQuery]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

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
      if (medicalCert) fd.append('medical_certificate', medicalCert);

      await api.post('/athletes/', fd);
      navigate('/');
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
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/')}>← Înapoi</Button>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-foreground">Adaugă sportiv</h1>
          <p className="text-sm text-muted-foreground">Completează profilul și documentele sportivului.</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 whitespace-pre-line">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card as="fieldset" className="p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Date personale</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Prenume *" name="first_name" value={form.first_name} onChange={handleChange} required />
            <Field label="Nume *" name="last_name" value={form.last_name} onChange={handleChange} required />
            <SelectField label="Gen *" name="gender" value={form.gender} onChange={handleChange} options={GENDER_OPTIONS} required />
            <Field label="Serie legitimație" name="license_series" value={form.license_series} onChange={handleChange} />
            <Field label="CNP" name="cnp" value={form.cnp} onChange={handleChange} maxLength={13} />
            <Field label="Data nașterii *" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} required />
            <Field label="Telefon" name="mobile_number" value={form.mobile_number} onChange={handleChange} />
            <div className="sm:col-span-2">
              <Field label="Adresă" name="address" value={form.address} onChange={handleChange} multiline />
            </div>
          </div>
        </Card>

        <Card as="fieldset" className="p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Contact de urgență</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nume contact" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
            <Field label="Telefon contact" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
          </div>
        </Card>

        <Card as="fieldset" className="p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Date sportive</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div ref={cityBoxRef} className="relative">
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">Oraș</Label>
              <Input
                type="text"
                value={cityQuery}
                onChange={handleCityChange}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={handleCityBlur}
                placeholder="Caută orașul..."
                className="pr-10"
                autoComplete="off"
              />
              <div className="pointer-events-none absolute right-3 top-[34px] text-xs text-muted-foreground">⌕</div>
              {showCitySuggestions && filteredCities.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
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
                          selected ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className="truncate">{city.name}</span>
                        <span className="ml-3 shrink-0 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                          {selected ? 'SELECTAT' : (!cityQuery.trim() && isMajor && index < MAJOR_CITIES.length ? 'SUGERAT' : '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {showCitySuggestions && filteredCities.length === 0 && cityQuery.trim() && (
                <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-md">
                  Niciun oraș găsit.
                </div>
              )}
            </div>
            <SelectField label="Grad curent" name="current_grade" value={form.current_grade} onChange={handleChange} options={grades} labelKey="name" />
            <Field label="Data înregistrării" name="registered_date" type="date" value={form.registered_date} onChange={handleChange} />
            <Field label="Data expirării" name="expiration_date" type="date" value={form.expiration_date} onChange={handleChange} />
            <div className="flex items-center gap-6 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_coach"
                  checked={form.is_coach}
                  onCheckedChange={(checked) => handleChange({ target: { name: 'is_coach', type: 'checkbox', checked: checked === true } })}
                />
                <Label htmlFor="is_coach" className="cursor-pointer font-normal">Antrenor</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_referee"
                  checked={form.is_referee}
                  onCheckedChange={(checked) => handleChange({ target: { name: 'is_referee', type: 'checkbox', checked: checked === true } })}
                />
                <Label htmlFor="is_referee" className="cursor-pointer font-normal">Arbitru</Label>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Field label="Experiență anterioară" name="previous_experience" value={form.previous_experience} onChange={handleChange} multiline />
            </div>
          </div>
        </Card>

        <Card as="fieldset" className="p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Documente</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">Fotografie sportiv</Label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-input bg-muted transition hover:bg-accent"
                >
                  {profilePreview ? (
                    <img src={profilePreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-xs text-muted-foreground">Click pentru a alege</span>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                {profileImage && (
                  <div className="text-xs text-muted-foreground">
                    <p className="max-w-[140px] truncate font-medium">{profileImage.name}</p>
                    <button
                      type="button"
                      onClick={() => { setProfileImage(null); setProfilePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="mt-1 text-destructive hover:text-destructive/80"
                    >
                      Șterge
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">Certificat medical</Label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setMedicalCert(e.target.files?.[0] || null)}
                className="block w-full cursor-pointer text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-accent-foreground hover:file:bg-accent/80"
              />
              {medicalCert && <p className="mt-1 truncate text-[10px] text-muted-foreground">{medicalCert.name}</p>}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/')}>Anulează</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Se salvează…' : '+ Salvează sportivul'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', required, multiline, maxLength }) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {multiline ? (
        <Textarea name={name} value={value} onChange={onChange} rows={3} className="min-h-[96px] resize-none" />
      ) : (
        <Input type={type} name={name} value={value} onChange={onChange} required={required} maxLength={maxLength} />
      )}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options, labelKey = 'name', required = false }) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      <Select
        value={value ? String(value) : ''}
        onValueChange={(val) => onChange({ target: { name, value: val, type: 'select-one' } })}
        required={required}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="— Alege —" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={String(option.id)}>{option[labelKey]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const GENDER_OPTIONS = [
  { id: 'male', name: 'Masculin' },
  { id: 'female', name: 'Feminin' },
];
