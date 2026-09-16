import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clubAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import {
  Alert, Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  EmptyState, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui';
import ClubForm from '../components/ClubForm';
import { Building2, Plus } from 'lucide-react';

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

/** Admin-only: every club in the federation (not just "my club" - see
 * ClubEdit.jsx for a coach's own-club page), with create/edit/delete -
 * the same data a federation admin used to manage through Django's
 * /admin/ site. */
export default function AdminClubs() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await clubAPI.list();
      setClubs(res.data?.results ?? res.data ?? []);
    } catch {
      setError('Nu am putut încărca lista de cluburi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(payload) {
    setCreateError('');
    try {
      await clubAPI.create(payload);
      setCreateOpen(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setCreateError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut crea clubul.');
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Cluburi</h1>
        <Button onClick={() => { setCreateError(''); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" /> Creează club
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {clubs.length === 0 ? (
        <EmptyState title="Niciun club" message="Nu există niciun club înregistrat." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Nume</TableHead>
                <TableHead>Oraș</TableHead>
                <TableHead>Antrenori</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clubs.map((club) => (
                <TableRow key={club.id} className="cursor-pointer" onClick={() => navigate(`/cluburi/${club.id}`)}>
                  <TableCell>
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
                      {club.logo ? <img src={imgUrl(club.logo)} alt={club.name} className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{club.name}</TableCell>
                  <TableCell className="text-muted-foreground">{club.city?.name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {(club.coaches || []).map((c) => `${c.first_name} ${c.last_name}`).join(', ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent fullScreen>
          <DialogHeader>
            <DialogTitle>Club nou</DialogTitle>
          </DialogHeader>
          <ClubForm onSubmit={handleCreate} submitLabel="Creează clubul" error={createError} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
