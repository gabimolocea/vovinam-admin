import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicContentAPI, athleteAPI, clubAPI } from '@shared/lib/api';
import { Alert, Button, EmptyState, Input, Label, Skeleton, Textarea } from '../components/ui';
import { PersonGrid } from '../components/PersonCard';
import Seo from '../components/Seo';
import AthletesTable from '../components/AthletesTable';
import GalleryTab from '../components/GalleryTab';
import { ExternalLink, Globe, MapPin, Pencil, Phone } from 'lucide-react';

const SOCIAL_LINKS = [
  { key: 'facebook_url', label: 'Facebook', Icon: ExternalLink },
  { key: 'instagram_url', label: 'Instagram', Icon: ExternalLink },
  { key: 'tiktok_url', label: 'TikTok', Icon: ExternalLink },
  { key: 'website', label: 'Website', Icon: Globe },
];

function MedalBadge({ emoji, label, value }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-white/10 px-4 py-2 text-white">
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="text-lg font-semibold leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-white/70">{label}</span>
    </div>
  );
}

export default function ClubDetailPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ['sportivi', 'poze'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'info';
  const page = Number(searchParams.get('page') || '1');

  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [athletes, setAthletes] = useState([]);
  const [athletesCount, setAthletesCount] = useState(0);
  const [athletesHasNext, setAthletesHasNext] = useState(false);
  const [athletesLoading, setAthletesLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.clubs.get(slug);
        if (isMounted) setClub(response.data);
      } catch {
        if (isMounted) setError('Nu am putut încărca acest club.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  useEffect(() => {
    if (tab !== 'sportivi' || !club?.id) return undefined;
    let isMounted = true;

    async function load() {
      setAthletesLoading(true);
      try {
        const response = await athleteAPI.list({
          club: club.id,
          paginate: true,
          page_size: 20,
          page,
        });
        if (!isMounted) return;
        setAthletes(response.data?.results ?? []);
        setAthletesCount(response.data?.count ?? 0);
        setAthletesHasNext(Boolean(response.data?.next));
      } catch {
        // keep previous athletes on error, table area is non-critical
      } finally {
        if (isMounted) setAthletesLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [tab, club?.id, page]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !club) {
    return <Alert variant="destructive">{error || 'Club negăsit.'}</Alert>;
  }

  const medals = club.medals || { gold: 0, silver: 0, bronze: 0 };
  const socialLinks = SOCIAL_LINKS.filter(({ key }) => club[key]);

  function startEditing() {
    setForm({
      description: club.description || '',
      address: club.address || '',
      mobile_number: club.mobile_number || '',
      website: club.website || '',
      facebook_url: club.facebook_url || '',
      instagram_url: club.instagram_url || '',
      tiktok_url: club.tiktok_url || '',
    });
    setSaveError('');
    setIsEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const response = await clubAPI.update(club.id, form);
      setClub((prev) => ({ ...prev, ...response.data }));
      setIsEditing(false);
    } catch {
      setSaveError('Nu am putut salva modificările. Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title={club.name}
        description={club.description || `Pagina clubului ${club.name}, afiliat Federației Române de Vovinam Việt Võ Đạo.`}
        path={`/cluburi/${club.slug}`}
      />

      <div className="overflow-hidden rounded-xl bg-brand-navy text-white">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {club.logo ? (
              <img src={club.logo} alt={club.name} className="h-20 w-20 rounded-lg bg-white object-contain p-1" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white/10 text-2xl font-semibold">
                {club.name?.[0]}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-semibold sm:text-3xl">{club.name}</h1>
              {club.city && <span className="flex items-center gap-1 text-sm text-white/70"><MapPin className="h-4 w-4" /> {club.city}</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <MedalBadge emoji="🥇" label="Aur" value={medals.gold} />
            <MedalBadge emoji="🥈" label="Argint" value={medals.silver} />
            <MedalBadge emoji="🥉" label="Bronz" value={medals.bronze} />
          </div>
        </div>

        {socialLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/10 px-6 py-3">
            {socialLinks.map(({ key, label, Icon }) => (
              <a
                key={key}
                href={club[key]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/90 transition hover:bg-white/20"
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-b">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${tab === 'info' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Info
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'sportivi' })}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${tab === 'sportivi' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Sportivi
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'poze' })}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${tab === 'poze' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Poze
          </button>
        </div>
        {club.can_edit && tab === 'info' && !isEditing && (
          <Button size="sm" variant="outline" onClick={startEditing} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Editează
          </Button>
        )}
      </div>

      {tab === 'info' && isEditing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {saveError && <Alert variant="destructive">{saveError}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descriere</Label>
            <Textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Adresă</Label>
              <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mobile_number">Telefon</Label>
              <Input id="mobile_number" value={form.mobile_number} onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="facebook_url">Facebook</Label>
              <Input id="facebook_url" value={form.facebook_url} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instagram_url">Instagram</Label>
              <Input id="instagram_url" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tiktok_url">TikTok</Label>
              <Input id="tiktok_url" value={form.tiktok_url} onChange={(e) => setForm({ ...form, tiktok_url: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</Button>
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>Anulează</Button>
          </div>
        </form>
      ) : tab === 'info' ? (
        <div className="flex flex-col gap-4">
          {club.description && <p className="whitespace-pre-line text-sm leading-relaxed">{club.description}</p>}
          <dl className="grid gap-3 sm:grid-cols-2">
            {club.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span>{club.address}</span>
              </div>
            )}
            {club.mobile_number && (
              <div className="flex items-start gap-2 text-sm">
                <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span>{club.mobile_number}</span>
              </div>
            )}
          </dl>
          {club.coach_profiles?.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-lg font-semibold">Antrenor{club.coach_profiles.length > 1 ? 'i' : ''}</h2>
              <PersonGrid people={club.coach_profiles} />
            </div>
          )}
        </div>
      ) : tab === 'poze' ? (
        <GalleryTab clubSlug={slug} />
      ) : athletesLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : athletes.length === 0 ? (
        <EmptyState title="Niciun sportiv legitimat" message="Acest club nu are încă sportivi afișați public." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{athletesCount} sportivi</p>
          <AthletesTable athletes={athletes} showClub={false} />
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setSearchParams({ tab: 'sportivi', page: String(page - 1) })}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={!athletesHasNext} onClick={() => setSearchParams({ tab: 'sportivi', page: String(page + 1) })}>
              Următor
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
