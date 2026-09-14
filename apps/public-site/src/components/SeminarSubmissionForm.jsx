import { useEffect, useState } from 'react';
import { eventAPI, seminarAPI } from '@shared';
import {
  Alert, Button, Label, Req,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui';
import { Sparkles } from 'lucide-react';

/** Athlete-facing "submit seminar participation" form, shown on the own
 * profile's "Seminarii" tab. Requires a participation certificate photo and
 * can optionally pre-fill the eveniment field from it using the seminar
 * submission's `extract_diploma` AI endpoint - the athlete still
 * reviews/corrects the suggestion before submitting, and an admin still
 * has to approve it. */
export default function SeminarSubmissionForm({ athleteId, onSubmitted, onCancel }) {
  const [seminars, setSeminars] = useState([]);
  const [eventId, setEventId] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    eventAPI.list({ event_type: 'training_seminar' }).then((res) => setSeminars(res.data?.results ?? res.data ?? [])).catch(() => {});
  }, []);

  async function handleAiAutofill() {
    if (!certificateFile) {
      setError('Încarcă mai întâi poza cu certificatul pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', certificateFile);
      const { data } = await seminarAPI.submissions.extractDiploma(formData);
      const suggested = data?.suggested || {};
      if (suggested.event_id) setEventId(String(suggested.event_id));
      setAiNote('Câmpurile au fost completate automat pe baza certificatului. Verifică-le înainte de a trimite.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează câmpurile manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!eventId) {
      setError('Alege seminarul la care ai participat.');
      return;
    }
    if (!certificateFile) {
      setError('Este necesară o fotografie cu certificatul de participare.');
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('event', eventId);
      formData.append('participation_certificate', certificateFile);
      formData.append('submitted_by_athlete', 'true');
      if (athleteId) formData.append('athlete', athleteId);
      await seminarAPI.submissions.create(formData);
      onSubmitted();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut trimite participarea.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-col gap-1">
        <Label htmlFor="seminar_certificate_image">Poză certificat de participare<Req /></Label>
        <input
          id="seminar_certificate_image"
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

      <div className="flex flex-col gap-1">
        <Label>Seminar<Req /></Label>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger><SelectValue placeholder="Alege seminarul" /></SelectTrigger>
          <SelectContent className="bg-white">
            {seminars.map((ev) => (
              <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Se trimite…' : 'Trimite spre aprobare'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Anulează</Button>
      </div>
    </form>
  );
}
