import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { athleteAPI, clubAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import {
  Alert, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, Skeleton,
} from '../components/ui';
import ClubForm from '../components/ClubForm';
import BeltBadge from '../components/BeltBadge';
import {
  ArrowLeft, Building2, ExternalLink, Globe, Link2, MapPin, Phone, Plus, Settings, Trash2,
} from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

const STATUS_LABELS = { pending: 'În așteptare', approved: 'Aprobat', rejected: 'Respins' };
const STATUS_CLASSES = {
  pending: 'border-transparent bg-amber-100 text-amber-800',
  approved: 'border-transparent bg-emerald-100 text-emerald-800',
  rejected: 'border-transparent bg-destructive/10 text-destructive',
};

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

/** The club's roster, reached from its admin edit page - lets an admin
 * see and add/edit any club's athletes without going through a coach
 * account, same data as ClubEdit.jsx's own RosterTab but scoped to an
 * explicit club id (admin has no club of their own) rather than
 * `?my_club=true`. */
function RosterSection({ clubId }) {
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    athleteAPI.list({ club: clubId })
      .then((r) => { if (active) setAthletes(Array.isArray(r.data) ? r.data : r.data?.results ?? []); })
      .catch(() => { if (active) setError('Nu am putut încărca sportivii clubului.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clubId]);

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Sportivi</h2>
        <Button size="sm" onClick={() => navigate(`/athletes/new?club=${clubId}`)}>
          <Plus className="h-4 w-4" /> Adaugă sportiv
        </Button>
      </div>

      {loading && <Skeleton className="h-48" />}
      {!loading && error && <Alert variant="destructive">{error}</Alert>}
      {!loading && !error && athletes.length === 0 && (
        <EmptyState title="Fără sportivi" message="Nu au fost găsiți sportivi în acest club." />
      )}
      {!loading && !error && athletes.length > 0 && (
        <div className="flex flex-col gap-2">
          {athletes.map((a) => (
            <Link
              key={a.id}
              to={`/athletes/${a.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm transition hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <div className="relative aspect-[3/2] w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {a.profile_image ? (
                    <img src={imgUrl(a.profile_image)} alt={a.full_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                      {`${a.first_name?.[0] || ''}${a.last_name?.[0] || ''}`.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium">{a.full_name || `${a.first_name} ${a.last_name}`}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.is_coach && <Badge className="border-transparent bg-primary/10 text-primary">Antrenor</Badge>}
                    {a.current_grade?.name && <BeltBadge grade={a.current_grade.name} />}
                  </div>
                </div>
              </div>
              <Badge className={STATUS_CLASSES[a.status] || ''}>{STATUS_LABELS[a.status] || a.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Admin-only: edit (or delete) any single club - reached from
 * AdminClubs.jsx's list. Coaches use the smaller edit dialog on their own
 * `/club` page instead; this is the full identity-including form (name,
 * city) an admin needs when managing every club in the federation. */
export default function AdminClubEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const res = await clubAPI.get(id);
      setClub(res.data);
    } catch {
      setLoadError('Nu am putut încărca datele clubului.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave(payload) {
    setSaveError('');
    setSuccess(false);
    try {
      await clubAPI.update(id, payload);
      setSuccess(true);
      setEditOpen(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setSaveError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut salva modificările.');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await clubAPI.delete(id);
      navigate('/cluburi', { replace: true });
    } catch {
      setSaveError('Nu am putut șterge clubul.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (loadError || !club) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/cluburi')} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Înapoi la cluburi
        </Button>
        <Alert variant="destructive">{loadError || 'Club negăsit.'}</Alert>
      </div>
    );
  }

  const socialLinks = [
    club.facebook_url && { label: 'Facebook', href: club.facebook_url },
    club.instagram_url && { label: 'Instagram', href: club.instagram_url },
    club.youtube_url && { label: 'YouTube', href: club.youtube_url },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="outline" size="sm" onClick={() => navigate('/cluburi')} className="w-fit">
        <ArrowLeft className="h-4 w-4" /> Înapoi la cluburi
      </Button>

      {success && <Alert variant="success">Datele clubului au fost salvate.</Alert>}

      <section className="relative flex flex-col gap-3 rounded-lg border border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold">{club.name}</h1>
            {club.slug && (
              <a
                href={withSsoHandoff(`${PUBLIC_SITE_URL}/cluburi/${club.slug}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary underline hover:text-primary/80"
              >
                Vezi clubul public <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} aria-label="Editează clubul">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {club.city?.name || 'Oraș nespecificat'}</span>
          {club.mobile_number && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {club.mobile_number}</span>}
          {club.website && (
            <a href={club.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground hover:underline">
              <Globe className="h-3.5 w-3.5" /> {club.website}
            </a>
          )}
          {club.address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {club.address}</span>}
        </div>
        {socialLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {socialLinks.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                <Link2 className="h-3.5 w-3.5" /> {s.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent fullScreen>
          <DialogHeader>
            <DialogTitle>Editează clubul</DialogTitle>
          </DialogHeader>
          <ClubForm initial={club} onSubmit={handleSave} submitLabel="Salvează" error={saveError} />
        </DialogContent>
      </Dialog>

      <RosterSection clubId={id} />

      <div className="border-t border-border pt-4">
        {confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">Sigur ștergi clubul „{club.name}”? Această acțiune nu poate fi anulată.</p>
            <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Se șterge…' : 'Da, șterge clubul'}
            </Button>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirmingDelete(false)}>Anulează</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="h-4 w-4" /> Șterge clubul
          </Button>
        )}
      </div>
    </div>
  );
}
