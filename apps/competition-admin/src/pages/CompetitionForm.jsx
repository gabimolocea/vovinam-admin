import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cityAPI, competitionAPI } from '@shared/lib/api';

const INITIAL_FORM = {
  name: '',
  city: '',
  address: '',
  start_date: '',
  end_date: '',
  description: '',
};

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function CompetitionForm() {
  const navigate = useNavigate();
  const cityBoxRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cities, setCities] = useState([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [cityQuery, setCityQuery] = useState('');

  useEffect(() => {
    cityAPI
      .list()
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.results || [];
        setCities(items);
      })
      .catch(() => setCities([]));
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
    const query = normalizeText(cityQuery.trim());
    if (!query) return cities;
    return cities.filter((city) => normalizeText(city.name).includes(query));
  }, [cities, cityQuery]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

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
    if (!exact && cityQuery.trim()) {
      setForm((prev) => ({ ...prev, city: '' }));
    }
    if (!cityQuery.trim()) {
      setForm((prev) => ({ ...prev, city: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        city: form.city || null,
        address: form.address.trim(),
        start_date: form.start_date,
        end_date: form.end_date || form.start_date,
        description: form.description,
      };
      const { data } = await competitionAPI.create(payload);
      navigate(`/competitions/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to create competition');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="frvv-btn-secondary">← Înapoi</button>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-black">Competiție nouă</h1>
          <p className="text-sm text-gray-500">Completează evenimentul în același stil ca în panoul de administrare.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Detalii eveniment</legend>
          <div className="mt-2 grid grid-cols-1 gap-4">
            <Field label="Titlu competiție *" name="name" value={form.name} onChange={setField('name')} required />
            <Field
              label="Descriere"
              name="description"
              value={form.description}
              onChange={setField('description')}
              multiline
              placeholder="Descriere opțională, similar cu formularul din backend."
            />
          </div>
        </fieldset>

        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Dată și locație</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Data de început *" name="start_date" type="datetime-local" value={form.start_date} onChange={setField('start_date')} required />
            <Field label="Data de sfârșit" name="end_date" type="datetime-local" value={form.end_date} onChange={setField('end_date')} />
            <div ref={cityBoxRef} className="relative sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Oraș</label>
              <input
                type="text"
                value={cityQuery}
                onChange={handleCityChange}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={handleCityBlur}
                placeholder="Caută orașul din backend..."
                className="frvv-input w-full pr-10"
                autoComplete="off"
              />
              <div className="pointer-events-none absolute right-3 top-[34px] text-xs text-gray-500">⌕</div>
              {showCitySuggestions && filteredCities.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border-2 border-black bg-white">
                  {filteredCities.map((city) => {
                    const selected = Number(form.city) === Number(city.id);
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
                        <span>{city.name}</span>
                        {selected && <span className="text-xs font-black text-green-700">SELECTAT</span>}
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
            <Field
              label="Adresă / locație"
              name="address"
              value={form.address}
              onChange={setField('address')}
              placeholder="Sală, stradă, număr, detalii suplimentare"
            />
          </div>
        </fieldset>

        <div className="flex flex-col justify-end gap-3 pt-2 sm:flex-row">
          <button type="button" onClick={() => navigate(-1)} className="frvv-btn-secondary">
            Anulează
          </button>
          <button type="submit" disabled={busy} className="frvv-btn-primary">
            {busy ? 'Se creează...' : 'Creează competiția'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', required, multiline, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={5}
          placeholder={placeholder}
          className="frvv-input min-h-[136px] w-full resize-none"
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          className="frvv-input w-full"
        />
      )}
    </div>
  );
}
