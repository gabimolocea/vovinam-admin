import { useState } from 'react';
import { visaAPI } from '@shared';
import { Alert, Button, Label } from './ui';
import { Sparkles } from 'lucide-react';

/** Athlete-facing "submit medical checkup proof" form, shown on the own
 * profile's "Istoric Medical" tab. Requires a photo of the legitimație /
 * proof of the medical checkup and the date it was done - can optionally
 * pre-fill the date from the photo using the visa submission's
 * `extract_diploma` AI endpoint. An admin still has to approve it. */
export default function MedicalVisaSubmissionForm({ onSubmitted, onCancel }) {
  const [issuedDate, setIssuedDate] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAiAutofill() {
    if (!certificateFile) {
      setError('Încarcă mai întâi poza cu legitimația pentru a folosi completarea automată.');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const formData = new FormData();
      formData.append('image', certificateFile);
      const { data } = await visaAPI.submissions.extractDiploma(formData);
      const suggested = data?.suggested || {};
      if (suggested.issued_date) setIssuedDate(suggested.issued_date);
      setAiNote('Data a fost completată automat pe baza legitimației. Verific-o înainte de a trimite.');
    } catch {
      setAiNote('Completarea automată nu a funcționat de data aceasta. Completează data manual.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!issuedDate) {
      setError('Alege data la care a fost făcut controlul medical.');
      return;
    }
    if (!certificateFile) {
      setError('Este necesară o fotografie cu legitimația.');
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('visa_type', 'medical');
      formData.append('issued_date', issuedDate);
      formData.append('image', certificateFile);
      await visaAPI.submissions.create(formData);
      onSubmitted();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut trimite viza medicală.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-col gap-1">
        <Label htmlFor="visa_certificate_image">Poză legitimație / dovadă control medical</Label>
        <input
          id="visa_certificate_image"
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
        <Label htmlFor="visa_issued_date">Data controlului medical</Label>
        <input
          id="visa_issued_date"
          type="date"
          value={issuedDate}
          onChange={(e) => setIssuedDate(e.target.value)}
          className="site-form-input"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Se trimite…' : 'Trimite spre aprobare'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Anulează</Button>
      </div>
    </form>
  );
}
