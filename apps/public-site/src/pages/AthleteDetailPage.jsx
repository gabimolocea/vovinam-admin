import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth, athleteAPI } from '@shared';
import { Alert, Badge, Button, Skeleton } from '../components/ui';
import Seo from '../components/Seo';
import GalleryTab from '../components/GalleryTab';
import EditAthleteProfileForm from '../components/EditAthleteProfileForm';
import ResultSubmissionForm from '../components/ResultSubmissionForm';
import { ATHLETE_STATUS_LABELS } from '../lib/athletes';
import { MapPin, Pencil } from 'lucide-react';

const RESULT_STATUS_LABELS = {
  pending: 'În așteptare',
  approved: 'Aprobat',
  rejected: 'Respins',
  revision_required: 'Necesită completări',
};

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'rezultate', label: 'Rezultate' },
  { key: 'grade', label: 'Istoric grade' },
  { key: 'seminarii', label: 'Seminarii' },
  { key: 'medical', label: 'Istoric Medical' },
  { key: 'vize', label: 'Vize anuale' },
  { key: 'poze', label: 'Poze' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

const PLACEMENT_LABELS = { '1st': '🥇 Locul 1', '2nd': '🥈 Locul 2', '3rd': '🥉 Locul 3' };
const RESULT_TYPE_LABELS = { solo: 'Solo', teams: 'Echipe', fight: 'Luptă' };

function EmptyTab({ message }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

/** `ownProfile`: renders the logged-in athlete's own profile (fetched via
 * /athletes/my-profile-detail/, which - unlike the public /public/ endpoint -
 * doesn't require status='approved') instead of a public athlete by :id.
 * Used by "Contul meu" so a pending/rejected athlete can preview their
 * profile exactly as it'll look once approved, without it being visible to
 * anyone else. */
export default function AthleteDetailPage({ ownProfile = false, showSeo = true }) {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'info';

  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [editing, setEditing] = useState(false);
  const [addingResult, setAddingResult] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (ownProfile && (authLoading || !user)) return undefined;
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = ownProfile ? await athleteAPI.myProfileDetail() : await athleteAPI.getPublic(id);
        if (isMounted) setAthlete(response.data);
      } catch {
        if (isMounted) setError(ownProfile ? 'Nu am putut încărca profilul tău.' : 'Nu am putut încărca acest sportiv.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [id, ownProfile, user, authLoading]);

  if (ownProfile && !authLoading && !user) return <Navigate to="/cont" replace />;

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      const response = await athleteAPI.updatePhoto(athlete.id, file);
      setAthlete((prev) => ({
        ...prev,
        profile_image: response.data.profile_image,
        pending_profile_image: response.data.pending_profile_image,
        profile_image_status: response.data.profile_image_status,
      }));
    } catch {
      setPhotoError('Nu am putut încărca poza. Încearcă din nou.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !athlete) {
    return <Alert variant="destructive">{error || 'Sportiv negăsit.'}</Alert>;
  }

  const medals = athlete.medals || { gold: 0, silver: 0, bronze: 0 };

  return (
    <div className="flex flex-col gap-6">
      {showSeo && (
        <Seo
          title={ownProfile ? 'Profilul meu' : athlete.full_name}
          description={ownProfile ? undefined : `Profilul sportivului ${athlete.full_name}, Federația Română de Vovinam Việt Võ Đạo.`}
          path={ownProfile ? '/cont/profil' : `/sportivi/${athlete.id}`}
          noindex={ownProfile}
        />
      )}

      {ownProfile && athlete.status === 'revision_required' && (
        <Alert variant="destructive">
          {athlete.admin_notes || 'Un administrator a cerut completări la profilul tău. Te rugăm să-l actualizezi.'}
        </Alert>
      )}
      {ownProfile && athlete.status !== 'approved' && athlete.status !== 'revision_required' && (
        <Alert>
          Acesta este profilul tău așa cum va arăta public. Cât timp este <strong>{(ATHLETE_STATUS_LABELS[athlete.status] || athlete.status).toLowerCase()}</strong>, nu este vizibil pentru nimeni altcineva.
        </Alert>
      )}

      {ownProfile && athlete.profile_image_status === 'pending' && (
        <Alert>Noua ta poză de profil așteaptă aprobarea antrenorului sau a unui administrator. Poza curentă rămâne vizibilă până atunci.</Alert>
      )}
      {ownProfile && athlete.profile_image_status === 'rejected' && athlete.profile_image_admin_notes && (
        <Alert variant="destructive">Poza de profil trimisă a fost respinsă: {athlete.profile_image_admin_notes}</Alert>
      )}

      <div className="flex flex-col gap-6 rounded-xl bg-brand-navy p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            {athlete.profile_image ? (
              <img src={athlete.profile_image} alt={athlete.full_name} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold">
                {athlete.first_name?.[0]}{athlete.last_name?.[0]}
              </div>
            )}
            {athlete.can_edit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border-white/40 bg-brand-navy p-0 text-white hover:bg-white/10"
                  title="Schimbă poza de profil"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{athlete.full_name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
              {athlete.club && (
                <Link to={`/cluburi/${athlete.club.slug}`} className="hover:underline">{athlete.club.name}</Link>
              )}
              {athlete.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {athlete.city.name}</span>}
              <Badge variant="outline" className="border-white/30 text-white">
                {ATHLETE_STATUS_LABELS[athlete.status] || athlete.status}
              </Badge>
            </div>
            {photoError && <span className="text-xs text-red-300">{photoError}</span>}
          </div>
        </div>
        <div className="flex gap-3">
          {[['🥇', 'Aur', medals.gold], ['🥈', 'Argint', medals.silver], ['🥉', 'Bronz', medals.bronze]].map(([emoji, label, value]) => (
            <div key={label} className="flex flex-col items-center gap-1 rounded-lg bg-white/10 px-4 py-2">
              <span className="text-2xl leading-none">{emoji}</span>
              <span className="text-lg font-semibold leading-none">{value}</span>
              <span className="text-[10px] uppercase tracking-wide text-white/70">{label}</span>
            </div>
          ))}
        </div>
        {ownProfile && !editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/40 bg-transparent text-white hover:bg-white/10 sm:self-start"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editează profilul
          </Button>
        )}
      </div>

      {editing && (
        <EditAthleteProfileForm
          athlete={athlete}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setAthlete((prev) => ({ ...prev, ...updated }));
            setEditing(false);
          }}
        />
      )}

      <div className="flex flex-wrap gap-2 border-b">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSearchParams(key === 'info' ? {} : { tab: key })}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-muted-foreground">Grad curent</dt>
            <dd className="font-medium">{athlete.current_grade?.name || '—'}</dd>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-muted-foreground">Club</dt>
            <dd className="font-medium">{athlete.club?.name || '—'}</dd>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-muted-foreground">Rol</dt>
            <dd className="font-medium">
              {[athlete.is_coach && 'Antrenor', athlete.is_referee && 'Arbitru'].filter(Boolean).join(', ') || 'Sportiv'}
            </dd>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-muted-foreground">Data nașterii</dt>
            <dd className="font-medium">{athlete.date_of_birth ? formatDate(athlete.date_of_birth) : '—'}</dd>
          </div>
        </dl>
      )}

      {tab === 'rezultate' && (
        <div className="flex flex-col gap-4">
          {ownProfile && !addingResult && (
            <Button type="button" size="sm" className="w-fit" onClick={() => setAddingResult(true)}>
              Adaugă rezultat
            </Button>
          )}
          {ownProfile && addingResult && (
            <ResultSubmissionForm
              athleteId={athlete.id}
              onCancel={() => setAddingResult(false)}
              onSubmitted={async () => {
                setAddingResult(false);
                const response = await athleteAPI.myProfileDetail();
                setAthlete(response.data);
              }}
            />
          )}
          {athlete.results.length === 0 ? <EmptyTab message="Niciun rezultat înregistrat." /> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Competiție</th>
                    <th className="px-4 py-3 font-medium">Categorie</th>
                    <th className="px-4 py-3 font-medium">Tip</th>
                    <th className="px-4 py-3 font-medium">Rezultat</th>
                    {ownProfile && <th className="px-4 py-3 font-medium">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {athlete.results.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">{r.competition || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.category || '—'}{r.team_name ? ` (${r.team_name})` : ''}</td>
                      <td className="px-4 py-3 text-muted-foreground">{RESULT_TYPE_LABELS[r.type] || r.type}</td>
                      <td className="px-4 py-3">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</td>
                      {ownProfile && (
                        <td className="px-4 py-3">
                          <Badge variant={r.status === 'approved' ? 'default' : 'outline'}>
                            {RESULT_STATUS_LABELS[r.status] || r.status}
                          </Badge>
                          {r.status === 'rejected' && r.admin_notes && (
                            <p className="mt-1 text-xs text-muted-foreground">{r.admin_notes}</p>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'grade' && (
        athlete.grade_history.length === 0 ? <EmptyTab message="Niciun grad înregistrat." /> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Grad</th>
                  <th className="px-4 py-3 font-medium">Data obținerii</th>
                  <th className="px-4 py-3 font-medium">Eveniment</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {athlete.grade_history.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-3 font-medium">{g.grade?.name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(g.obtained_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.event || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'seminarii' && (
        athlete.seminars.length === 0 ? <EmptyTab message="Nicio participare la seminarii." /> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Eveniment</th>
                  <th className="px-4 py-3 font-medium">Perioadă</th>
                  <th className="px-4 py-3 font-medium">Loc</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {athlete.seminars.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.event || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.start_date)}{s.end_date ? ` – ${formatDate(s.end_date)}` : ''}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.place || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'medical' && (
        athlete.medical_visas.length === 0 ? <EmptyTab message="Nicio viză medicală înregistrată." /> : (
          <ul className="flex flex-col gap-2">
            {athlete.medical_visas.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                <span>Viză medicală</span>
                <span className="text-muted-foreground">{formatDate(v.issued_date)}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'vize' && (
        athlete.annual_visas.length === 0 ? <EmptyTab message="Nicio viză anuală înregistrată." /> : (
          <ul className="flex flex-col gap-2">
            {athlete.annual_visas.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                <span>Viză anuală</span>
                <span className="text-muted-foreground">{formatDate(v.issued_date)}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'poze' && <GalleryTab athleteId={athlete.id} />}
    </div>
  );
}
