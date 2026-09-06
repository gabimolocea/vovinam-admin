import { useEffect, useRef, useState } from 'react';

/**
 * Minimal dependency-free searchable dropdown ("combobox"): a text input
 * that calls `onSearch(query)` (debounced) and renders the returned
 * options in a list below the input. Built for fields backed by very
 * large tables (e.g. the ~13.8k Romanian cities) where a plain <select>
 * with every option is unusable - `onSearch` is expected to hit a
 * server-side search endpoint and return only a handful of matches.
 */
export default function SearchableSelect({
  value,
  onChange,
  onSearch,
  placeholder = 'Caută…',
  minChars = 2,
  debounceMs = 250,
}) {
  const [query, setQuery] = useState(value?.name || '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Keep the input text in sync when the selected value changes from
  // outside this component (e.g. form reset).
  useEffect(() => {
    setQuery(value?.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.id]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInputChange(e) {
    const next = e.target.value;
    setQuery(next);
    setOpen(true);
    if (value) onChange(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < minChars) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await onSearch(next.trim());
        setOptions(results || []);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  }

  function handleSelect(option) {
    setQuery(option.name);
    setOptions([]);
    setOpen(false);
    onChange(option);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        className="site-form-input"
        autoComplete="off"
      />
      {open && (query.trim().length >= minChars) && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Se caută…</div>}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Niciun rezultat.</div>
          )}
          {!loading && options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => handleSelect(option)}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
