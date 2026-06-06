import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { cityAPI, gradeAPI } from '@shared/lib/api';

const MAJOR_CITIES = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov'];

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

      await api.post('/athletes/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
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
        <button onClick={() => navigate('/')} className="frvv-btn-secondary">← Înapoi</button>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-black">Adaugă sportiv</h1>
          <p className="text-sm text-gray-500">Completează profilul și documentele sportivului.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 whitespace-pre-line border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Date personale</legend>
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
        </fieldset>

        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Contact de urgență</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nume contact" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
            <Field label="Telefon contact" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
          </div>
        </fieldset>

        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Date sportive</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div ref={cityBoxRef} className="relative">
              <label className="mb-1 block text-xs font-medium text-gray-600">Oraș</label>
              <input
                type="text"
                value={cityQuery}
                onChange={handleCityChange}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={handleCityBlur}
                placeholder="Caută orașul..."
                className="frvv-input w-full pr-10"
                autoComplete="off"
              />
              <div className="pointer-events-none absolute right-3 top-[34px] text-xs text-gray-500">⌕</div>
              {showCitySuggestions && filteredCities.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border-2 border-black bg-white">
                  {filteredCities.map((city, index) => {
                    const selected = Number(form.city) === Number(city.id);
                    const isMajor = MAJOR_CITIES.includes(city.name);
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCity(city)}
                        className={`flex w-full items-center justify-between border-b border-black/10 px-3 py-2 text-left text-sm transition last:border-b-0 ${
                          selected ? 'bg-yellow-100 font-semibold text-gray-900' : 'bg-white text-gray-700 hover:bg-yellow-50'
                        }`}
                      >
                        <span className="truncate">{city.name}</span>
                        <span className="ml-3 shrink-0 text-[10px] font-black uppercase tracking-wide text-gray-400">
                          {selected ? 'SELECTAT' : (!cityQuery.trim() && isMajor && index < MAJOR_CITIES.length ? 'SUGERAT' : '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {showCitySuggestions && filteredCities.length === 0 && cityQuery.trim() && (
                <div className="absolute z-30 mt-1 w-full border-2 border-black bg-white px-3 py-3 text-sm text-gray-500">
                  Niciun oraș găsit.
                </div>
              )}
            </div>
            <SelectField label="Grad curent" name="current_grade" value={form.current_grade} onChange={handleChange} options={grades} labelKey="name" />
            <Field label="Data înregistrării" name="registered_date" type="date" value={form.registered_date} onChange={handleChange} />
            <Field label="Data expirării" name="expiration_date" type="date" value={form.expiration_date} onChange={handleChange} />
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="is_coach" checked={form.is_coach} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                Antrenor
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="is_referee" checked={form.is_referee} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                Arbitru
              </label>
            </div>
            <div className="sm:col-span-2">
              <Field label="Experiență anterioară" name="previous_experience" value={form.previous_experience} onChange={handleChange} multiline />
            </div>
          </div>
        </fieldset>

        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Documente</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Fotografie sportiv</label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-black bg-gray-50 transition hover:bg-yellow-50"
                >
                  {profilePreview ? (
                    <img src={profilePreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-xs text-gray-400">Click pentru a alege</span>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                {profileImage && (
                  <div className="text-xs text-gray-500">
                    <p className="max-w-[140px] truncate font-medium">{profileImage.name}</p>
                    <button
                      type="button"
                      onClick={() => { setProfileImage(null); setProfilePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="mt-1 text-red-500 hover:text-red-700"
                    >
                      Șterge
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Certificat medical</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setMedicalCert(e.target.files?.[0] || null)}
                className="block w-full cursor-pointer text-xs text-gray-500 file:mr-2 file:border file:border-black file:bg-yellow-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-black hover:file:bg-yellow-200"
              />
              {medicalCert && <p className="mt-1 truncate text-[10px] text-gray-400">{medicalCert.name}</p>}
            </div>
          </div>
        </fieldset>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/')} className="frvv-btn-secondary">Anulează</button>
          <button type="submit" disabled={saving} className="frvv-btn-add">
            <span className="frvv-btn-add-icon">+</span>
            {saving ? 'Se salvează…' : 'Salvează sportivul'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', required, multiline, maxLength }) {
  const cls = 'frvv-input w-full';
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {multiline ? (
        <textarea name={name} value={value} onChange={onChange} rows={3} className={`${cls} resize-none min-h-[96px]`} />
      ) : (
        <input type={type} name={name} value={value} onChange={onChange} required={required} maxLength={maxLength} className={cls} />
      )}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options, labelKey = 'name', required = false }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <select name={name} value={value} onChange={onChange} required={required} className="frvv-input w-full bg-white">
        <option value="">— Alege —</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option[labelKey]}</option>
        ))}
      </select>
    </div>
  );
}

const GENDER_OPTIONS = [
  { id: 'male', name: 'Masculin' },
  { id: 'female', name: 'Feminin' },
];