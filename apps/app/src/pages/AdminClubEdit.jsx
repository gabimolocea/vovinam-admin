import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clubAPI } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import { Alert, Button, Skeleton } from '../components/ui';
import ClubForm from '../components/ClubForm';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

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

  return (
    <div className="flex flex-col gap-6">
      <Button variant="outline" size="sm" onClick={() => navigate('/cluburi')} className="w-fit">
        <ArrowLeft className="h-4 w-4" /> Înapoi la cluburi
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{club.name}</h1>
        {club.slug && (
          <a
            href={withSsoHandoff(`${PUBLIC_SITE_URL}/cluburi/${club.slug}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary underline hover:text-primary/80"
          >
            Vezi clubul public <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {success && <Alert variant="success">Datele clubului au fost salvate.</Alert>}

      <ClubForm initial={club} onSubmit={handleSave} submitLabel="Salvează" error={saveError} />

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
