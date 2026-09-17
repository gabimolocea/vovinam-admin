import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Input, Label, Req, Textarea,
} from './ui';
import CityAutocomplete from './CityAutocomplete';
import { MEDIA_BASE_URL } from '@shared/lib/api';
import { ImagePlus } from 'lucide-react';

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

/** Shared club data-entry fields, used both by the admin "create club"
 * dialog and the admin "edit club" page (`/cluburi/:id`). Coaches editing
 * their own club (`ClubEdit.jsx`'s EditClubDialog) intentionally has a
 * smaller field set (no name/city - those are identity fields only an
 * admin should change), so that dialog is kept separate rather than
 * reusing this one. */
export default function ClubForm({ initial, onSubmit, submitLabel, error }) {
  // A club created without a logo has no way to attach one until an admin
  // comes back and edits it - require it up front instead. An existing
  // club being edited already has one (or the admin can leave it as-is),
  // so this only applies to a brand-new club.
  const isCreating = !initial;
  const [form, setForm] = useState({
    name: '', city: '', address: '', mobile_number: '', website: '',
    facebook_url: '', instagram_url: '', youtube_url: '', description: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef();

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name || '',
        // ClubSerializer nests city as {id, name} on read but accepts a
        // plain id on write (PrimaryKeyRelatedField) - unwrap it here.
        city: initial.city?.id ? String(initial.city.id) : '',
        address: initial.address || '',
        mobile_number: initial.mobile_number || '',
        website: initial.website || '',
        facebook_url: initial.facebook_url || '',
        instagram_url: initial.instagram_url || '',
        youtube_url: initial.youtube_url || '',
        description: initial.description || '',
      });
      setLogoFile(null);
      setLogoPreview(imgUrl(initial.logo));
    }
  }, [initial]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setValidationError('');
    if (isCreating && !logoFile) {
      setValidationError('Sigla clubului este obligatorie.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, city: form.city || null };
      if (logoFile) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) formData.append(key, value);
        });
        formData.append('logo', logoFile);
        await onSubmit(formData);
      } else {
        await onSubmit(payload);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {(error || validationError) && <Alert variant="destructive" className="whitespace-pre-line">{error || validationError}</Alert>}
      <div className="flex flex-col gap-1">
        <Label>Siglă{isCreating && <Req />}</Label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-muted text-muted-foreground transition hover:bg-accent"
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Siglă club" className="h-full w-full object-contain" />
            ) : (
              <ImagePlus className="h-6 w-6" />
            )}
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
          {logoFile && <p className="max-w-[220px] truncate text-xs text-muted-foreground">{logoFile.name}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="club_name">Nume<Req /></Label>
          <Input id="club_name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Oraș</Label>
          <CityAutocomplete value={form.city} onChange={(cityId) => update('city', cityId)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="club_phone">Telefon</Label>
          <Input id="club_phone" value={form.mobile_number} onChange={(e) => update('mobile_number', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="club_website">Website</Label>
          <Input id="club_website" type="url" placeholder="https://" value={form.website} onChange={(e) => update('website', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="club_address">Adresă</Label>
          <Textarea id="club_address" rows={2} value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="club_description">Descriere (pagina publică)</Label>
          <Textarea id="club_description" rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="club_facebook">Facebook</Label>
          <Input id="club_facebook" type="url" placeholder="https://facebook.com/…" value={form.facebook_url} onChange={(e) => update('facebook_url', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="club_instagram">Instagram</Label>
          <Input id="club_instagram" type="url" placeholder="https://instagram.com/…" value={form.instagram_url} onChange={(e) => update('instagram_url', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="club_youtube">YouTube</Label>
          <Input id="club_youtube" type="url" placeholder="https://youtube.com/…" value={form.youtube_url} onChange={(e) => update('youtube_url', e.target.value)} />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving || (isCreating && !logoFile)} className="w-fit">{saving ? 'Se salvează…' : submitLabel}</Button>
    </form>
  );
}
