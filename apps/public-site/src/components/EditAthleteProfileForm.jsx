import { useEffect, useState } from 'react';
import { athleteAPI, publicContentAPI, cityAPI } from '@shared';
import {
  Alert, Button, Checkbox, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui';
import SearchableSelect from './SearchableSelect';
import { displayToIso, formatIsoToDisplay, maskDateInput } from '../lib/dateFormat';

/** Inline "edit my profile" form shown on the own-profile ("Vezi Profil")
 * page. Reuses the same field set/shape as the onboarding form, but PATCHes
 * the existing athlete record instead of creating a new one. Profile picture
 * changes are handled separately by the hero photo uploader (they go through
 * the coach/admin approval flow), so this form intentionally excludes it. */
export default function EditAthleteProfileForm({ athlete, onCancel, onSaved }) {
  const [clubs, setClubs] = useState([]);
  const [selectedCity, setSelectedCity] = useState(athlete.city || null);
  const [form, setForm] = useState({
    first_name: athlete.first_name || '',
    last_name: athlete.last_name || '',
    date_of_birth: formatIsoToDisplay(athlete.date_of_birth),
    gender: athlete.gender || '',
    mobile_number: athlete.mobile_number || '',
    address: athlete.address || '',
    club: athlete.club?.id ? String(athlete.club.id) : '',
    city: athlete.city?.id || '',
    previous_experience: athlete.previous_experience || '',
    emergency_contact_name: athlete.emergency_contact_name || '',
    emergency_contact_phone: athlete.emergency_contact_phone || '',
    is_coach: !!athlete.is_coach,
    is_instructor: !!athlete.is_instructor,
    is_referee: !!athlete.is_referee,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    publicContentAPI.clubs.list().then((res) => setClubs(res.data ?? [])).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function searchCities(query) {
    const { data } = await cityAPI.list({ search: query });
    return data ?? [];
  }

  function handleCityChange(city) {
    setSelectedCity(city);
    update('city', city?.id ?? '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const isoDate = displayToIso(form.date_of_birth);
    if (!isoDate) {
      setError('Introdu data nașterii completă, în formatul zz.luna.an (ex: 15.03.1995).');
      return;
    }

    setBusy(true);
    try {
      const payload = { ...form, date_of_birth: isoDate, club: form.club || null, city: form.city || null };
      const response = await athleteAPI.update(athlete.id, payload);
      onSaved(response.data);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut salva modificările.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border p-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit_first_name">Prenume</Label>
          <Input id="edit_first_name" required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit_last_name">Nume</Label>
          <Input id="edit_last_name" required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit_date_of_birth">Data nașterii</Label>
          <Input
            id="edit_date_of_birth"
            required
            inputMode="numeric"
            placeholder="zz.ll.aaaa"
            value={form.date_of_birth}
            onChange={(e) => update('date_of_birth', maskDateInput(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Gen</Label>
          <Select value={form.gender} onValueChange={(value) => update('gender', value)}>
            <SelectTrigger><SelectValue placeholder="Nespecificat" /></SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="male">Masculin</SelectItem>
              <SelectItem value="female">Feminin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit_mobile_number">Telefon mobil</Label>
          <Input id="edit_mobile_number" value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Club</Label>
          <Select value={form.club ? String(form.club) : ''} onValueChange={(value) => update('club', value)}>
            <SelectTrigger><SelectValue placeholder="Alege clubul" /></SelectTrigger>
            <SelectContent className="bg-white">
              {clubs.map((club) => (
                <SelectItem key={club.id} value={String(club.id)}>{club.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label>Localitate</Label>
          <SearchableSelect value={selectedCity} onChange={handleCityChange} onSearch={searchCities} placeholder="Scrie pentru a căuta localitatea…" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="edit_address">Adresă</Label>
          <Input id="edit_address" value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit_emergency_name">Contact de urgență (nume)</Label>
          <Input id="edit_emergency_name" value={form.emergency_contact_name} onChange={(e) => update('emergency_contact_name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit_emergency_phone">Contact de urgență (telefon)</Label>
          <Input id="edit_emergency_phone" value={form.emergency_contact_phone} onChange={(e) => update('emergency_contact_phone', e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.is_coach} onCheckedChange={(checked) => update('is_coach', checked === true)} />
          <span>Sunt Antrenor</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.is_instructor} onCheckedChange={(checked) => update('is_instructor', checked === true)} />
          <span>Sunt Instructor</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.is_referee} onCheckedChange={(checked) => update('is_referee', checked === true)} />
          <span>Sunt Arbitru</span>
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Se salvează…' : 'Salvează modificările'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Anulează</Button>
      </div>
    </form>
  );
}
