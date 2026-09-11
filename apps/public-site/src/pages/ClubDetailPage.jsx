import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicContentAPI, athleteAPI, clubAPI } from '@shared/lib/api';
import { Alert, Button, EmptyState, Input, Label, Skeleton, Textarea } from '../components/ui';
import { PersonGrid } from '../components/PersonCard';
import Seo from '../components/Seo';
import AthletesTable from '../components/AthletesTable';
import GalleryTab from '../components/GalleryTab';
import Breadcrumbs from '../components/Breadcrumbs';
import MedalIcon from '../components/MedalIcon';
import TrophyIcon from '../components/TrophyIcon';
import { ExternalLink, Globe, MapPin, Pencil, Phone } from 'lucide-react';

const SOCIAL_LINKS = [
  { key: 'facebook_url', label: 'Facebook', Icon: ExternalLink },
  { key: 'instagram_url', label: 'Instagram', Icon: ExternalLink },
  { key: 'tiktok_url', label: 'TikTok', Icon: ExternalLink },
];

// Same Romanian-flag ribbon used for an athlete's national medals - a
// club's medal count is likewise aggregated from national competitions.
const NATIONAL_RIBBON = ['#002B7F', '#FCD116', '#CE1126'];

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'sportivi', label: 'Sportivi' },
  { key: 'poze', label: 'Poze' },
];

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
  const trophies = club.trophies || { gold: 0, silver: 0, bronze: 0 };
  const socialLinks = SOCIAL_LINKS.filter(({ key }) => club[key]);
  const contactLinks = [
    club.address && {
      key: 'address',
      value: club.address,
      Icon: MapPin,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.address)}`,
    },
    club.mobile_number && {
      key: 'mobile_number',
      value: club.mobile_number,
      Icon: Phone,
      href: `tel:${club.mobile_number.replace(/\s+/g, '')}`,
    },
    club.website && {
      key: 'website',
      value: club.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
      Icon: Globe,
      href: club.website,
    },
  ].filter(Boolean);

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
    <div className="flex flex-col">
      <Seo
        title={club.name}
        description={club.description || `Pagina clubului ${club.name}, afiliat Federației Române de Vovinam Việt Võ Đạo.`}
        path={`/cluburi/${club.slug}`}
      />

      <div className="site-full-bleed" style={{ backgroundColor: '#0c223d' }}>
        <Breadcrumbs
          items={[
            { label: 'Federație', to: '/despre' },
            { label: 'Cluburi', to: '/cluburi' },
            { label: club.name },
          ]}
          overlay
        />

        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-10 text-center lg:flex-row lg:items-center lg:justify-between lg:py-14 lg:text-left">
          <div className="flex w-full flex-col items-center gap-4 lg:w-auto lg:flex-row">
            {club.logo ? (
              <img src={club.logo} alt={club.name} className="h-40 w-40 shrink-0 object-contain" />
            ) : (
              <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg bg-white/10 text-2xl font-display font-bold text-white/40">
                {club.name?.[0]}
              </div>
            )}
            <div className="flex flex-1 flex-col items-center gap-1.5 text-center lg:items-start lg:text-left">
              <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{club.name}</h1>
              {(contactLinks.length > 0 || socialLinks.length > 0) && (
                <div className="flex flex-wrap justify-center gap-2 pt-1 lg:justify-start">
                  {contactLinks.map(({ key, value, Icon, href }) => (
                    <a
                      key={key}
                      href={href}
                      {...(href.startsWith('tel:') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/90 transition hover:bg-white/20"
                    >
                      <Icon className="h-3.5 w-3.5" /> {value}
                    </a>
                  ))}
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
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-4 lg:w-auto lg:justify-start">
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Medalii</span>
              <div className="flex items-center gap-2">
                {['gold', 'silver', 'bronze'].map((tierKey) => (
                  <div key={tierKey} className="flex items-center rounded-md bg-white/10 px-2 py-1.5">
                    <MedalIcon tier={tierKey} ribbonColors={NATIONAL_RIBBON} count={medals[tierKey]} className="h-9 w-7" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Cupe</span>
              <div className="flex items-center gap-2">
                {['gold', 'silver', 'bronze'].map((tierKey) => (
                  <div key={tierKey} className="flex items-center rounded-md bg-white/10 px-2 py-1.5">
                    <TrophyIcon tier={tierKey} count={trophies[tierKey]} className="h-9 w-8" />
                  </div>
                ))}
              </div>
            </div>
            {club.can_edit && tab === 'info' && !isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/40 bg-transparent text-white hover:bg-white/10"
                onClick={startEditing}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editează
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1.5 px-4 py-1.5">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setSearchParams(key === 'info' ? {} : { tab: key })}
              className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
                tab === key ? 'bg-white text-[#00334d] shadow-sm' : 'text-[#00334d]/60 hover:text-[#00334d]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">

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
    </div>
  );
}
