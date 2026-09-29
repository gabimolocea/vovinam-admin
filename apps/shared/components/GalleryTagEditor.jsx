import { useEffect, useRef, useState } from 'react';
import { publicContentAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Etichetele unei poze, cu adăugare și scoatere.
 *
 * Trăiește în `shared` pentru că aceeași galerie apare în două
 * aplicații. Nu depinde de componentele de interfață ale niciuneia -
 * fiecare are propria variantă, iar o dependență în plus ar fi însemnat
 * două copii care deviază. Culorile vin din tokenii de temă, deci
 * urmează paleta aplicației în care e montat.
 *
 * `renderLink` există pentru singura diferență reală dintre aplicații -
 * una navighează cu router, cealaltă deschide site-ul public.
 */
export default function GalleryTagEditor({ photoId, tags, onChange, renderLink }) {
  const { isAuthenticated, user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const myAthleteId = user?.athlete?.id ?? null;
  const alreadyTagged = (id) => tags.some((t) => t.id === id);

  useEffect(() => {
    // Căutăm la o pauză de tastare, nu la fiecare literă: altfel un nume
    // de zece caractere înseamnă zece cereri, dintre care nouă aruncate.
    clearTimeout(timer.current);
    if (query.trim().length < 2) { setResults([]); return undefined; }
    timer.current = setTimeout(async () => {
      try {
        const { data } = await publicContentAPI.gallery.tagSearch(query.trim());
        setResults(data);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  async function add(athleteId) {
    if (busy || alreadyTagged(athleteId)) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await publicContentAPI.gallery.addTag(photoId, athleteId);
      onChange(data.tagged_athletes);
      setQuery('');
      setResults([]);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Nu am putut adăuga eticheta.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(athleteId) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await publicContentAPI.gallery.removeTag(photoId, athleteId);
      onChange(data.tagged_athletes);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Nu am putut scoate eticheta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Etichete:</span>
          {tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {renderLink ? renderLink(tag) : <span>{tag.name}</span>}
              {tag.can_remove && (
                <button
                  type="button"
                  onClick={() => remove(tag.id)}
                  disabled={busy}
                  aria-label={`Scoate eticheta ${tag.name}`}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {isAuthenticated && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-xs text-muted-foreground underline hover:text-foreground"
        >
          Etichetează pe cineva
        </button>
      )}

      {isAuthenticated && open && (
        <div className="flex flex-col gap-1.5">
          {myAthleteId && !alreadyTagged(myAthleteId) && (
            <button
              type="button"
              onClick={() => add(myAthleteId)}
              disabled={busy}
              className="self-start rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/70 disabled:opacity-40"
            >
              Sunt eu în poză
            </button>
          )}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută după nume"
            aria-label="Caută sportiv de etichetat"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />

          {results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
              {results.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => add(person.id)}
                    disabled={busy || alreadyTagged(person.id)}
                    className="flex w-full flex-col items-start px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"
                  >
                    <span>{person.name}</span>
                    {person.club && <span className="text-xs text-muted-foreground">{person.club}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground">Niciun sportiv găsit.</p>
          )}

          <button
            type="button"
            onClick={() => { setOpen(false); setQuery(''); setResults([]); }}
            className="self-start text-xs text-muted-foreground underline hover:text-foreground"
          >
            Gata
          </button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
