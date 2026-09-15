import { useState, useEffect } from 'react';
import { clubAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import { Alert, Button, Input, Label, Skeleton, Textarea } from '../components/ui';
import { useAuth } from '@shared';
import { Building2, Link2 } from 'lucide-react';

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

/** Section heading used to separate page areas without a bordered box -
 * spacing and typography carry the grouping instead of a Card. */
function SectionHeading({ children }) {
  return <h2 className="font-display text-lg font-semibold text-foreground">{children}</h2>;
}

export default function ClubEdit() {
  const { user } = useAuth();
  const clubId = user?.athlete?.club;

  const [club, setClub] = useState(null);
  const [form, setForm] = useState({ address: '', mobile_number: '', website: '', facebook_url: '', instagram_url: '', youtube_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    clubAPI.get(clubId).then((r) => {
      const c = r.data;
      setClub(c);
      setForm({
        address: c.address || '',
        mobile_number: c.mobile_number || '',
        website: c.website || '',
        facebook_url: c.facebook_url || '',
        instagram_url: c.instagram_url || '',
        youtube_url: c.youtube_url || '',
      });
    }).catch(() => setError('Nu s-au putut încărca datele clubului.'));
  }, [clubId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      const res = await clubAPI.update(clubId, payload);
      setClub(res.data);
      setSuccess(true);
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'object' ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n') : 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  if (!clubId) {
    return <Alert>Contul tău nu este asociat unui club.</Alert>;
  }

  if (!club) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const logoUrl = imgUrl(club.logo);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-bold">Club</h1>

      {error && <Alert variant="destructive" className="whitespace-pre-line">{error}</Alert>}
      {success && <Alert variant="success">Datele clubului au fost salvate.</Alert>}

      <section className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
          {logoUrl ? (
            <img src={logoUrl} alt={club.name} className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-8 w-8" />
          )}
        </div>
        <div>
          <p className="font-display text-lg font-bold">{club.name}</p>
          <p className="text-sm text-muted-foreground">{club.city?.name || 'Oraș nespecificat'}</p>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <SectionHeading>Date de contact</SectionHeading>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_phone">Telefon</Label>
              <Input id="club_phone" name="mobile_number" value={form.mobile_number} onChange={handleChange} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="club_website">Website</Label>
              <Input id="club_website" name="website" value={form.website} onChange={handleChange} type="url" placeholder="https://" />
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="club_address">Adresă</Label>
              <Textarea id="club_address" name="address" value={form.address} onChange={handleChange} rows={3} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium text-foreground">Rețele sociale</Label>
            <p className="text-xs text-muted-foreground">Link-urile apar pe pagina publică a clubului.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_facebook" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Facebook</Label>
              <Input id="club_facebook" name="facebook_url" value={form.facebook_url} onChange={handleChange} type="url" placeholder="https://facebook.com/…" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_instagram" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Instagram</Label>
              <Input id="club_instagram" name="instagram_url" value={form.instagram_url} onChange={handleChange} type="url" placeholder="https://instagram.com/…" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="club_youtube" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> YouTube</Label>
              <Input id="club_youtube" name="youtube_url" value={form.youtube_url} onChange={handleChange} type="url" placeholder="https://youtube.com/…" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
