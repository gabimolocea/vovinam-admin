import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cityAPI, competitionAPI } from '@shared/lib/api';
import { Alert, Button, Card, Input, Label, Textarea } from '../components/ui';

const INITIAL_FORM = {
  name: '',
  city: '',
  address: '',
  start_date: '',
  end_date: '',
  coach_registration_deadline: '',
  description: '',
};

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
        coach_registration_deadline: form.coach_registration_deadline || form.start_date,
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
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>← Înapoi</Button>
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Competiție nouă</h1>
          <p className="text-sm text-muted-foreground">Completează evenimentul în același stil ca în panoul de administrare.</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 whitespace-pre-line">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card as="fieldset" className="p-4 md:p-5">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Detalii eveniment</legend>
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
        </Card>

        <Card as="fieldset" className="p-4 md:p-5">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Dată și locație</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Data de început *" name="start_date" type="datetime-local" value={form.start_date} onChange={setField('start_date')} required />
            <Field label="Data de sfârșit" name="end_date" type="datetime-local" value={form.end_date} onChange={setField('end_date')} />
            <Field
              label="Deadline antrenori"
              name="coach_registration_deadline"
              type="datetime-local"
              value={form.coach_registration_deadline}
              onChange={setField('coach_registration_deadline')}
              placeholder="Implicit: data de început"
            />
            <div ref={cityBoxRef} className="relative sm:col-span-1">
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">Oraș</Label>
              <Input
                type="text"
                value={cityQuery}
                onChange={handleCityChange}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={handleCityBlur}
                placeholder="Caută orașul din backend..."
                className="pr-10"
                autoComplete="off"
              />
              <div className="pointer-events-none absolute right-3 top-[34px] text-xs text-muted-foreground">⌕</div>
              {showCitySuggestions && filteredCities.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {filteredCities.map((city) => {
                    const selected = Number(form.city) === Number(city.id);
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCity(city)}
                        className={`flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm transition last:border-b-0 ${
                          selected ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-accent/60'
                        }`}
                      >
                        <span>{city.name}</span>
                        {selected && <span className="text-xs font-bold text-emerald-600">SELECTAT</span>}
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
            <Field
              label="Adresă / locație"
              name="address"
              value={form.address}
              onChange={setField('address')}
              placeholder="Sală, stradă, număr, detalii suplimentare"
            />
          </div>
        </Card>

        <div className="flex flex-col justify-end gap-3 pt-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Anulează
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Se creează...' : 'Creează competiția'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', required, multiline, placeholder }) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {multiline ? (
        <Textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={5}
          placeholder={placeholder}
          className="min-h-[136px] resize-none"
        />
      ) : (
        <Input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
