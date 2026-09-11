import { useEffect, useState } from 'react';
import { eventAPI, categoryAPI, scoreAPI } from '@shared';
import {
  Alert, Button, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui';
import { Sparkles } from 'lucide-react';

const GENDER_LABELS = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };

const PLACEMENT_OPTIONS = [
  { value: '1st', label: '🥇 Locul 1' },
  { value: '2nd', label: '🥈 Locul 2' },
  { value: '3rd', label: '🥉 Locul 3' },
];

/** Athlete-facing "submit a competition result" form, shown on the own
 * profile's "Rezultate" tab. Requires a diploma/certificate photo and can
 * optionally pre-fill the competiție/categorie/loc fields from it using the
 * `extract_diploma` AI endpoint - the athlete still reviews/corrects the
 * suggestion before submitting, and the coach/admin still has to approve. */
export default function ResultSubmissionForm({ athleteId, athleteGender, onSubmitted, onCancel }) {
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [eventId, setEventId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [placement, setPlacement] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    eventAPI.list().then((res) => setEvents(res.data?.results ?? res.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!eventId) {
      setCategories([]);
      return;
    }
    categoryAPI.list({ event: eventId }).then((res) => setCategories(res.data?.results ?? res.data ?? [])).catch(() => {});
  }, [eventId]);

  const visibleCategories = (athleteGender === 'male' || athleteGender === 'female')
    ? categories.filter((cat) => cat.gender === athleteGender || cat.gender === 'mixt')
    : categories;

  async function handleAiAutofill() {
    if (!certificateFile) {
      setError('Încarcă mai întâi poza cu diploma pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', certificateFile);
      const { data } = await scoreAPI.extractDiploma(formData);
      const suggested = data?.suggested || {};
      if (suggested.event_id) setEventId(String(suggested.event_id));
      if (suggested.category_id) setCategoryId(String(suggested.category_id));
      if (suggested.placement_claimed) setPlacement(suggested.placement_claimed);
      setAiNote('Câmpurile au fost completate automat pe baza diplomei. Verifică-le înainte de a trimite.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!categoryId) {
      setError('Alege competiția și categoria.');
      return;
    }
    if (!placement) {
      setError('Alege locul obținut.');
      return;
    }
    if (!certificateFile) {
      setError('Este necesară o fotografie cu diploma.');
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('category', categoryId);
      formData.append('placement_claimed', placement);
      formData.append('certificate_image', certificateFile);
      formData.append('submitted_by_athlete', 'true');
      if (athleteId) formData.append('athlete', athleteId);
      await scoreAPI.create(formData);
      onSubmitted();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut trimite rezultatul.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-col gap-1">
        <Label htmlFor="certificate_image">Poză diplomă / certificat</Label>
        <input
          id="certificate_image"
          type="file"
          accept="image/*"
          required
          onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
          className="site-form-input"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-1 w-fit"
          disabled={aiBusy || !certificateFile}
          onClick={handleAiAutofill}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {aiBusy ? 'Se completează…' : 'Completează automat cu AI'}
        </Button>
        {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label>Competiție</Label>
          <Select value={eventId} onValueChange={(value) => { setEventId(value); setCategoryId(''); }}>
            <SelectTrigger><SelectValue placeholder="Alege competiția" /></SelectTrigger>
            <SelectContent className="bg-white">
              {events.map((ev) => (
                <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Categorie</Label>
          <Select value={categoryId} onValueChange={setCategoryId} disabled={!eventId}>
            <SelectTrigger><SelectValue placeholder="Alege categoria" /></SelectTrigger>
            <SelectContent className="bg-white">
              {visibleCategories.map((cat) => {
                const details = [cat.group_name, GENDER_LABELS[cat.gender]].filter(Boolean).join(', ');
                return (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.name}{details ? ` (${details})` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label>Locul obținut</Label>
          <Select value={placement} onValueChange={setPlacement}>
            <SelectTrigger><SelectValue placeholder="Alege locul" /></SelectTrigger>
            <SelectContent className="bg-white">
              {PLACEMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Se trimite…' : 'Trimite spre aprobare'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Anulează</Button>
      </div>
    </form>
  );
}
