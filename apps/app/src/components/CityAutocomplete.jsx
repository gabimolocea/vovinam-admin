import { useEffect, useMemo, useRef, useState } from 'react';
import { cityAPI } from '@shared/lib/api';
import { Input } from './ui';
import { Search } from 'lucide-react';

const MAJOR_CITIES = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov'];

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Searchable city picker - cityAPI.list() returns every commune/village in
 * Romania (thousands of rows), so a plain <Select> would dump the entire
 * list into the DOM unusably; this mirrors CreateAthlete.jsx's own
 * search-as-you-type combobox instead. `value` is a city id (or ''/null),
 * `onChange` receives the new city id. */
export default function CityAutocomplete({ value, onChange }) {
  const [cities, setCities] = useState([]);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    cityAPI.list().then((r) => setCities(r.data?.results ?? r.data ?? [])).catch(() => {});
  }, []);

  // Once cities are loaded, show the current value's name instead of a
  // blank box (e.g. when opening the edit form for a club that already has
  // a city set).
  useEffect(() => {
    if (!value || !cities.length) return;
    const match = cities.find((c) => String(c.id) === String(value));
    if (match) setQuery(match.name);
  }, [value, cities]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCities = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    const sorted = [...cities].sort((a, b) => {
      const aMajor = MAJOR_CITIES.includes(a.name) ? 0 : 1;
      const bMajor = MAJOR_CITIES.includes(b.name) ? 0 : 1;
      if (aMajor !== bMajor) return aMajor - bMajor;
      return a.name.localeCompare(b.name, 'ro');
    });
    if (!normalizedQuery) return sorted;
    return sorted.filter((city) => normalizeText(city.name).includes(normalizedQuery));
  }, [cities, query]);

  function selectCity(city) {
    onChange(city.id);
    setQuery(city.name);
    setShowSuggestions(false);
  }

  function handleQueryChange(e) {
    const next = e.target.value;
    setQuery(next);
    setShowSuggestions(true);
    const exact = cities.find((c) => normalizeText(c.name) === normalizeText(next));
    onChange(exact ? exact.id : '');
  }

  function handleBlur() {
    const exact = cities.find((c) => normalizeText(c.name) === normalizeText(query));
    if (!exact || !query.trim()) onChange('');
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={handleQueryChange}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleBlur}
          placeholder="Caută orașul…"
          className="pr-9"
          autoComplete="off"
        />
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {showSuggestions && filteredCities.length > 0 && (
        <div className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {filteredCities.map((city) => {
            const selected = String(value) === String(city.id);
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
              </button>
            );
          })}
        </div>
      )}
      {showSuggestions && filteredCities.length === 0 && query.trim() && (
        <div className="absolute top-full z-30 mt-1 w-full rounded-md border border-border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-md">
          Niciun oraș găsit.
        </div>
      )}
    </div>
  );
}
