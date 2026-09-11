import { useEffect, useState } from 'react';
import { eventAPI, gradeAPI, gradeHistoryAPI } from '@shared';
import {
  Alert, Button, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui';
import { Sparkles } from 'lucide-react';

/** Athlete-facing "submit a grade exam" form, shown on the own profile's
 * "Istoric grade" tab. Requires a certificate photo and can optionally
 * pre-fill the grad/eveniment/data fields from it using the grade
 * submission's `extract_diploma` AI endpoint - the athlete still
 * reviews/corrects the suggestion before submitting, and an admin still
 * has to approve it. */
export default function GradeSubmissionForm({ athleteId, onSubmitted, onCancel }) {
  const [grades, setGrades] = useState([]);
  const [exams, setExams] = useState([]);
  const [gradeId, setGradeId] = useState('');
  const [eventId, setEventId] = useState('');
  const [obtainedDate, setObtainedDate] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    gradeAPI.list().then((res) => setGrades(res.data?.results ?? res.data ?? [])).catch(() => {});
    eventAPI.list({ event_type: 'examination' }).then((res) => setExams(res.data?.results ?? res.data ?? [])).catch(() => {});
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
      const { data } = await gradeHistoryAPI.submissions.extractDiploma(formData);
      const suggested = data?.suggested || {};
      if (suggested.grade_id) setGradeId(String(suggested.grade_id));
      if (suggested.event_id) setEventId(String(suggested.event_id));
      if (suggested.obtained_date) setObtainedDate(suggested.obtained_date);
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
    if (!gradeId) {
      setError('Alege gradul obținut.');
      return;
    }
    if (!certificateFile) {
      setError('Este necesară o fotografie cu certificatul.');
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('grade', gradeId);
      if (eventId) formData.append('event', eventId);
      if (obtainedDate) formData.append('obtained_date', obtainedDate);
      formData.append('certificate_image', certificateFile);
      formData.append('submitted_by_athlete', 'true');
      if (athleteId) formData.append('athlete', athleteId);
      await gradeHistoryAPI.submissions.create(formData);
      onSubmitted();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut trimite gradul.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-col gap-1">
        <Label htmlFor="grade_certificate_image">Poză certificat de grad</Label>
        <input
          id="grade_certificate_image"
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
          <Label>Grad</Label>
          <Select value={gradeId} onValueChange={setGradeId}>
            <SelectTrigger><SelectValue placeholder="Alege gradul" /></SelectTrigger>
            <SelectContent className="bg-white">
              {grades.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Eveniment (examen)</Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger><SelectValue placeholder="Alege examenul (opțional)" /></SelectTrigger>
            <SelectContent className="bg-white">
              {exams.map((ev) => (
                <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="obtained_date">Data obținerii</Label>
          <input
            id="obtained_date"
            type="date"
            value={obtainedDate}
            onChange={(e) => setObtainedDate(e.target.value)}
            className="site-form-input"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Se trimite…' : 'Trimite spre aprobare'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Anulează</Button>
      </div>
    </form>
  );
}
