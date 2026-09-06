import { useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Button, Input, Label, Textarea } from '../components/ui';

const INITIAL_FORM = { name: '', email: '', phone: '', subject: '', message: '' };

export default function ContactPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message }
  const [fieldErrors, setFieldErrors] = useState({});

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    setFieldErrors({});
    try {
      await publicContentAPI.contact.submit(form);
      setStatus({ type: 'success', message: 'Mesajul a fost trimis cu succes. Vă vom contacta în curând.' });
      setForm(INITIAL_FORM);
    } catch (err) {
      if (err?.response?.status === 400 && err.response.data) {
        setFieldErrors(err.response.data);
        setStatus({ type: 'error', message: 'Vă rugăm corectați câmpurile marcate.' });
      } else {
        setStatus({ type: 'error', message: 'A apărut o eroare. Vă rugăm încercați din nou.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl flex-col gap-6">
      <h1 className="font-display mb-6 text-3xl font-semibold">Contact</h1>

      {status && <Alert variant={status.type === 'error' ? 'destructive' : 'success'} className="mb-4">{status.message}</Alert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nume</Label>
          <Input id="name" required value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email[0]}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telefon (opțional)</Label>
          <Input id="phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject">Subiect</Label>
          <Input id="subject" required value={form.subject} onChange={(e) => updateField('subject', e.target.value)} />
          {fieldErrors.subject && <p className="text-xs text-destructive">{fieldErrors.subject[0]}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="message">Mesaj</Label>
          <Textarea id="message" required value={form.message} onChange={(e) => updateField('message', e.target.value)} />
          {fieldErrors.message && <p className="text-xs text-destructive">{fieldErrors.message[0]}</p>}
        </div>

        <Button type="submit" disabled={submitting}>{submitting ? 'Se trimite…' : 'Trimite mesajul'}</Button>
      </form>
    </div>
  );
}
