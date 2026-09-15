import { useEffect, useState } from 'react';
import { useAuth, athleteAPI } from '@shared';
import {
  Alert, Button, Input, Label, Skeleton,
} from '../components/ui';

/** The coach's own profile: account email plus the editable contact
 * details (phone, address). Identity fields (name, DOB, gender) are
 * read-only here - they're part of the athlete's legitimation record, not
 * something to self-edit - and role flags/emergency contact aren't shown
 * to coaches/instructors on this page. */
export default function MyProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    athleteAPI.myProfileDetail()
      .then((res) => {
        setForm({
          first_name: res.data.first_name || '',
          last_name: res.data.last_name || '',
          date_of_birth: res.data.date_of_birth || '',
          gender: res.data.gender || '',
          mobile_number: res.data.mobile_number || '',
          address: res.data.address || '',
          emergency_contact_name: res.data.emergency_contact_name || '',
          emergency_contact_phone: res.data.emergency_contact_phone || '',
          is_coach: !!res.data.is_coach,
          is_instructor: !!res.data.is_instructor,
          is_referee: !!res.data.is_referee,
        });
      })
      .catch(() => setLoadError('Nu am putut încărca profilul tău.'))
      .finally(() => setLoading(false));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await athleteAPI.updateMyProfile(form);
      setSuccess('Modificările au fost salvate.');
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut salva modificările.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (loadError || !form) {
    return <Alert variant="destructive">{loadError || 'Profil indisponibil.'}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Profilul meu</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="acc_email">Adresă de email</Label>
            <Input id="acc_email" type="email" disabled value={user?.email || ''} />
            <p className="text-xs text-muted-foreground">Adresa de email nu poate fi schimbată din cont.</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="acc_first_name">Prenume</Label>
            <Input id="acc_first_name" disabled value={form.first_name} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="acc_last_name">Nume</Label>
            <Input id="acc_last_name" disabled value={form.last_name} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="acc_dob">Data nașterii</Label>
            <Input id="acc_dob" type="date" disabled value={form.date_of_birth} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="acc_gender">Gen</Label>
            <Input id="acc_gender" disabled value={form.gender === 'male' ? 'Masculin' : form.gender === 'female' ? 'Feminin' : 'Nespecificat'} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="acc_mobile">Telefon mobil</Label>
            <Input id="acc_mobile" value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="acc_address">Adresă</Label>
            <Input id="acc_address" value={form.address} onChange={(e) => update('address', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează modificările'}</Button>
        </div>
      </form>
    </div>
  );
}
