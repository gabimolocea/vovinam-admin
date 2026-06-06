import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@shared';
import { clubAPI, cityAPI } from '@shared/lib/api';

const MAJOR_CITIES = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov'];

const normalizeText = (value = '') =>
  String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ClubEdit() {
  const { user } = useAuth();
  const clubId = user?.athlete?.club;

  const [club, setClub] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', mobile_number: '', website: '', city: '' });
  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const cityBoxRef = useRef(null);
  const fileInputRef = useRef();

  useEffect(() => {
    cityAPI.list().then(r => setCities(r.data?.results || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clubId) return;
    clubAPI.get(clubId).then(r => {
      const c = r.data;
      setClub(c);
      setForm({
        name: c.name || '',
        address: c.address || '',
        mobile_number: c.mobile_number || '',
        website: c.website || '',
        city: c.city?.id || c.city || '',
      });
      if (c.city?.name) setCityQuery(c.city.name);
      if (c.logo) setLogoPreview(c.logo);
    }).catch(() => setError('Nu s-au putut încărca datele clubului.'));
  }, [clubId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cityBoxRef.current && !cityBoxRef.current.contains(e.target)) setShowCitySuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCities = useMemo(() => {
    const q = normalizeText(cityQuery.trim());
    const sorted = [...cities].sort((a, b) => {
      const aMajor = MAJOR_CITIES.includes(a.name) ? 0 : 1;
      const bMajor = MAJOR_CITIES.includes(b.name) ? 0 : 1;
      if (aMajor !== bMajor) return aMajor - bMajor;
      return a.name.localeCompare(b.name, 'ro');
    });
    return q ? sorted.filter(c => normalizeText(c.name).includes(q)) : sorted;
  }, [cities, cityQuery]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const selectCity = (city) => {
    setForm(prev => ({ ...prev, city: city.id }));
    setCityQuery(city.name);
    setShowCitySuggestions(false);
  };

  const handleCityChange = (e) => {
    const value = e.target.value;
    setCityQuery(value);
    setShowCitySuggestions(true);
    const exact = cities.find(c => normalizeText(c.name) === normalizeText(value));
    setForm(prev => ({ ...prev, city: exact ? exact.id : '' }));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogo(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!form.name.trim()) { setError('Numele clubului este obligatoriu.'); return; }
    setSaving(true);
    try {
      let res;
      if (logo) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
        fd.append('logo', logo);
        res = await clubAPI.update(clubId, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined));
        res = await clubAPI.update(clubId, payload);
      }
      setClub(res.data);
      setSuccess(true);
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'object' ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n') : 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  if (!clubId) return (
    <div className="p-6 text-sm text-gray-500">Contul tău nu este asociat unui club.</div>
  );

  if (!club) return (
    <div className="p-6 text-sm text-gray-400 italic">Se încarcă...</div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h2 className="text-lg font-black uppercase tracking-[0.18em] text-gray-800">Editează clubul</h2>

      {error && (
        <div className="border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">{error}</div>
      )}
      {success && (
        <div className="border-2 border-green-300 bg-green-50 p-3 text-sm text-green-700">Datele clubului au fost salvate.</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Date club</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">

            <div className="sm:col-span-2">
              <Field label="Nume club *" name="name" value={form.name} onChange={handleChange} required />
            </div>

            {/* City autocomplete */}
            <div ref={cityBoxRef} className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">Oraș</label>
              <input
                type="text"
                value={cityQuery}
                onChange={handleCityChange}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={() => {
                  const exact = cities.find(c => normalizeText(c.name) === normalizeText(cityQuery));
                  if (!exact) { setForm(p => ({ ...p, city: '' })); }
                }}
                placeholder="Caută oraș..."
                autoComplete="off"
                className="frvv-input w-full"
              />
              {showCitySuggestions && filteredCities.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto border-2 border-black bg-white shadow-lg">
                  {filteredCities.slice(0, 20).map(city => (
                    <button key={city.id} type="button" onMouseDown={() => selectCity(city)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-yellow-100">
                      {city.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Field label="Telefon" name="mobile_number" value={form.mobile_number} onChange={handleChange} />
            <div className="sm:col-span-2">
              <Field label="Adresă" name="address" value={form.address} onChange={handleChange} multiline />
            </div>
            <Field label="Website" name="website" value={form.website} onChange={handleChange} type="url" placeholder="https://" />

            {/* Logo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Logo club</label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 items-center justify-center overflow-hidden border-2 border-dashed border-black bg-gray-50 cursor-pointer hover:bg-yellow-50 transition"
                >
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" className="h-full w-full object-contain" />
                    : <span className="text-xs text-gray-400 text-center leading-tight px-1">Adaugă logo</span>
                  }
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                {logoPreview && (
                  <button type="button" onClick={() => { setLogo(null); setLogoPreview(null); }}
                    className="text-xs text-red-500 underline">Elimină</button>
                )}
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="border-2 border-black bg-yellow-300 px-6 py-2 text-sm font-black uppercase tracking-wide hover:bg-yellow-400 transition disabled:opacity-50">
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, required = false, type = 'text', multiline = false, placeholder = '' }) {
  const cls = 'frvv-input w-full';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {multiline
        ? <textarea name={name} value={value} onChange={onChange} rows={3} className={cls} placeholder={placeholder} />
        : <input type={type} name={name} value={value} onChange={onChange} required={required} className={cls} placeholder={placeholder} />
      }
    </div>
  );
}
