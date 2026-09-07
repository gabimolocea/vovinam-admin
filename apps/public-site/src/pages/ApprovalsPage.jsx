import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, athleteAPI, scoreAPI } from '@shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui';
import Seo from '../components/Seo';

const PLACEMENT_LABELS = { '1st': '🥇 Locul 1', '2nd': '🥈 Locul 2', '3rd': '🥉 Locul 3' };

/** Coach/admin-only page listing pending profile-picture changes and pending
 * competition results awaiting review - the UI surface for the "antrenorul
 * sau adminul aprobă" approval workflows. */
export default function ApprovalsPage() {
  const { user, loading: authLoading, isAdmin, isCoach } = useAuth();
  const [images, setImages] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const canReview = isAdmin || isCoach;

  useEffect(() => {
    if (!canReview) return undefined;
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [imgRes, resultsRes] = await Promise.all([
          athleteAPI.pendingImageApprovals(),
          scoreAPI.pendingReview(),
        ]);
        if (isMounted) {
          setImages(imgRes.data ?? []);
          setResults(resultsRes.data ?? []);
        }
      } catch {
        if (isMounted) setError('Nu am putut încărca cererile în așteptare.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [canReview]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/cont" replace />;
  if (!canReview) return <Navigate to="/cont" replace />;

  async function handleImageDecision(athleteId, approve) {
    setBusyId(`image-${athleteId}`);
    try {
      if (approve) await athleteAPI.approveImage(athleteId);
      else await athleteAPI.rejectImage(athleteId, 'Poza nu a fost aprobată.');
      setImages((prev) => prev.filter((a) => a.id !== athleteId));
    } catch {
      setError('Nu am putut procesa cererea de imagine.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleResultDecision(resultId, approve) {
    setBusyId(`result-${resultId}`);
    try {
      if (approve) await scoreAPI.approve(resultId, {});
      else await scoreAPI.reject(resultId, { notes: 'Rezultatul nu a fost aprobat.' });
      setResults((prev) => prev.filter((r) => r.id !== resultId));
    } catch {
      setError('Nu am putut procesa rezultatul.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Seo title="Aprobări" path="/cont/aprobari" noindex />
      <h1 className="font-display text-2xl font-semibold">Aprobări în așteptare</h1>
      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Poze de profil ({images.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio poză în așteptare.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {images.map((athlete) => (
                    <li key={athlete.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <img
                          src={athlete.pending_profile_image}
                          alt={`${athlete.first_name} ${athlete.last_name}`}
                          className="h-16 w-16 rounded-full object-cover"
                        />
                        <div>
                          <p className="font-medium">{athlete.first_name} {athlete.last_name}</p>
                          <p className="text-sm text-muted-foreground">{athlete.club?.name || '—'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busyId === `image-${athlete.id}`} onClick={() => handleImageDecision(athlete.id, true)}>
                          Aprobă
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === `image-${athlete.id}`} onClick={() => handleImageDecision(athlete.id, false)}>
                          Respinge
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Rezultate ({results.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun rezultat în așteptare.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {results.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{r.athlete?.name || '—'}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.competition_name || '—'} · {r.category_name || '—'} · <Badge variant="outline">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</Badge>
                        </p>
                        {r.certificate_image && (
                          <a href={r.certificate_image} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                            Vezi diploma
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busyId === `result-${r.id}`} onClick={() => handleResultDecision(r.id, true)}>
                          Aprobă
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === `result-${r.id}`} onClick={() => handleResultDecision(r.id, false)}>
                          Respinge
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
