import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, athleteAPI, scoreAPI, gradeHistoryAPI, visaAPI } from '@shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui';
import Seo from '../components/Seo';

const PLACEMENT_LABELS = { '1st': '🥇 Locul 1', '2nd': '🥈 Locul 2', '3rd': '🥉 Locul 3' };
const VISA_TYPE_LABELS = { medical: 'Medicală', annual: 'Anuală' };

/** Admin-only page listing pending profile-picture changes, results, grade
 * exams and visas awaiting review, across every club - coaches now review
 * their own club's athletes directly from the coach dashboard instead
 * (see apps/coach-dashboard's AthleteDetail/GradeManagement pages), so this
 * flat cross-club queue is admin-only. */
export default function ApprovalsPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [images, setImages] = useState([]);
  const [results, setResults] = useState([]);
  const [grades, setGrades] = useState([]);
  const [visas, setVisas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const canReview = isAdmin;

  useEffect(() => {
    if (!canReview) return undefined;
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [imgRes, resultsRes, gradesRes, visasRes] = await Promise.all([
          athleteAPI.pendingImageApprovals(),
          scoreAPI.pendingReview(),
          gradeHistoryAPI.submissions.pendingReview(),
          visaAPI.submissions.pendingReview(),
        ]);
        if (isMounted) {
          setImages(imgRes.data ?? []);
          setResults(resultsRes.data ?? []);
          setGrades(gradesRes.data ?? []);
          setVisas(visasRes.data ?? []);
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
    } catch (err) {
      // Approving can fail for a real, actionable reason (e.g. the claimed
      // place is already held by someone else) - show that instead of a
      // generic message, so the admin knows what to do next.
      setError(err?.response?.data?.error || 'Nu am putut procesa rezultatul.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGradeDecision(gradeId, approve) {
    setBusyId(`grade-${gradeId}`);
    try {
      if (approve) await gradeHistoryAPI.submissions.approve(gradeId, {});
      else await gradeHistoryAPI.submissions.reject(gradeId, { notes: 'Examenul de grad nu a fost aprobat.' });
      setGrades((prev) => prev.filter((g) => g.id !== gradeId));
    } catch {
      setError('Nu am putut procesa examenul de grad.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleVisaDecision(visaId, approve) {
    setBusyId(`visa-${visaId}`);
    try {
      if (approve) await visaAPI.submissions.approve(visaId, {});
      else await visaAPI.submissions.reject(visaId, { notes: 'Viza nu a fost aprobată.' });
      setVisas((prev) => prev.filter((v) => v.id !== visaId));
    } catch {
      setError('Nu am putut procesa viza.');
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

          <Card>
            <CardHeader>
              <CardTitle as="h2">Examene de grad ({grades.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {grades.length === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun examen de grad în așteptare.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {grades.map((g) => (
                    <li key={g.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{g.athlete_name || '—'}</p>
                        <p className="text-sm text-muted-foreground">
                          {g.grade_name || '—'} {g.event_name ? `· ${g.event_name}` : ''}
                        </p>
                        {g.certificate_image && (
                          <a href={g.certificate_image} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                            Vezi certificatul
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busyId === `grade-${g.id}`} onClick={() => handleGradeDecision(g.id, true)}>
                          Aprobă
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === `grade-${g.id}`} onClick={() => handleGradeDecision(g.id, false)}>
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
              <CardTitle as="h2">Vize ({visas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {visas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio viză în așteptare.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {visas.map((v) => (
                    <li key={v.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{v.athlete_name || '—'}</p>
                        <p className="text-sm text-muted-foreground">
                          <Badge variant="outline">{VISA_TYPE_LABELS[v.visa_type] || v.visa_type}</Badge>
                          {v.issued_date ? ` · Emisă la ${v.issued_date}` : ''}
                        </p>
                        {v.image && (
                          <a href={v.image} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                            Vezi documentul
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busyId === `visa-${v.id}`} onClick={() => handleVisaDecision(v.id, true)}>
                          Aprobă
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === `visa-${v.id}`} onClick={() => handleVisaDecision(v.id, false)}>
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
