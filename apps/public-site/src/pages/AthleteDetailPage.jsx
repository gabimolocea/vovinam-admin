import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth, athleteAPI } from '@shared';
import { Alert, Badge, Button, Skeleton } from '../components/ui';
import Seo from '../components/Seo';
import GalleryTab from '../components/GalleryTab';
import EditAthleteProfileForm from '../components/EditAthleteProfileForm';
import Breadcrumbs from '../components/Breadcrumbs';
import ResultSubmissionForm from '../components/ResultSubmissionForm';
import GradeSubmissionForm from '../components/GradeSubmissionForm';
import SeminarSubmissionForm from '../components/SeminarSubmissionForm';
import MedicalVisaSubmissionForm from '../components/MedicalVisaSubmissionForm';
import BeltBadge from '../components/BeltBadge';
import MedalIcon from '../components/MedalIcon';
import ResponsiveTable from '../components/ResponsiveTable';
import { ATHLETE_STATUS_LABELS } from '../lib/athletes';
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';

// Ribbon colors per competition level - national medals (computed
// automatically from in-app scoring) get the Romanian flag's 3 colors;
// European/World medals (entered manually, since the federation doesn't
// organize/score those in-app) each get their own single ribbon color so
// the three levels stay visually distinct at a glance.
const NATIONAL_RIBBON = ['#002B7F', '#FCD116', '#CE1126'];
const EUROPEAN_RIBBON = ['#003399'];
const WORLD_RIBBON = ['#0f766e'];

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

const RESULT_LEVEL_TABS = [
  { key: 'national', label: 'Competiții Naționale' },
  { key: 'european', label: 'Competiții Europene' },
  { key: 'world', label: 'Competiții Mondiale' },
];

function EmptyTab({ message }) {
  return <p className="py-6 text-center text-sm text-[#00334d]/60">{message}</p>;
}

/** European/World results aren't scored in-app (the federation doesn't
 * organize those competitions), so unlike the "Național" sub-tab there's no
 * itemized results table here - just the aggregate medal counts an admin
 * enters manually, shown the same way the hero medal row does. */
function InternationalMedalsPanel({ medals, ribbonColors }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-[#dce0e5] bg-[#f8f9fa] py-10">
      <div className="flex items-center rounded-md bg-[#00334d]/5 px-3 py-2">
        {['gold', 'silver', 'bronze'].map((tier) => (
          <MedalIcon key={tier} tier={tier} ribbonColors={ribbonColors} count={medals[tier]} className="h-14 w-11" />
        ))}
      </div>
      <p className="max-w-sm text-center text-xs text-[#00334d]/60">
        Federația nu organizează competiții internaționale în aplicație - medaliile sunt introduse manual de un administrator.
      </p>
    </div>
  );
}

/** One competition level's column of 3 medal icons (gold/silver/bronze),
 * label above the icons - the three levels sit side by side in a single
 * line (see the wrapping flex row in the hero) instead of stacked. */
function MedalGroup({ label, medals, ribbonColors }) {
  return (
    <div className="flex flex-col items-center gap-1 lg:gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50 lg:text-xs">{label}</span>
      <div className="flex items-center rounded-md bg-white/10 px-1.5 py-1 lg:px-2 lg:py-1.5">
        {['gold', 'silver', 'bronze'].map((tier) => (
          <MedalIcon key={tier} tier={tier} ribbonColors={ribbonColors} count={medals[tier]} className="h-7 w-6 lg:h-9 lg:w-7" />
        ))}
      </div>
    </div>
  );
}

/** A horizontally scrollable row of tab buttons - used for both the main
 * profile tabs (pill style) and the "Rezultate" level sub-tabs (underline
 * style). On narrow screens the tabs scroll instead of wrapping to a
 * second line; the left/right scroll arrows only render when there's
 * actually more content to scroll to in that direction. */
function ScrollableTabs({ items, activeKey, onSelect, variant = 'pill' }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    function update() {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items]);

  function scrollByStep(direction) {
    scrollRef.current?.scrollBy({ left: direction * 160, behavior: 'smooth' });
  }

  const isPill = variant === 'pill';
  const arrowClassName = `shrink-0 rounded-md p-1.5 text-[#00334d]/60 hover:text-[#00334d] ${isPill ? 'hover:bg-white' : 'hover:bg-[#e9ecef]'}`;

  return (
    <div className={`flex items-center gap-1 ${isPill ? '' : 'border-b border-[#dce0e5]'}`}>
      {canScrollLeft && (
        <button type="button" aria-label="Derulează la stânga" onClick={() => scrollByStep(-1)} className={arrowClassName}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div ref={scrollRef} role="tablist" className={`site-scrollbar-hide flex flex-1 items-center overflow-x-auto ${isPill ? 'gap-1.5' : 'gap-6'}`}>
        {items.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeKey === key}
            onClick={() => onSelect(key)}
            className={
              isPill
                ? `shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
                    activeKey === key ? 'bg-white text-[#00334d] shadow-sm' : 'text-[#00334d]/60 hover:text-[#00334d]'
                  }`
                : `-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm font-semibold transition-colors ${
                    activeKey === key ? 'border-[#da3b26] text-[#00334d]' : 'border-transparent text-[#00334d]/50 hover:text-[#00334d]'
                  }`
            }
          >
            {label}
          </button>
        ))}
      </div>
      {canScrollRight && (
        <button type="button" aria-label="Derulează la dreapta" onClick={() => scrollByStep(1)} className={arrowClassName}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Full-screen white modal used for every "add/edit" form on this page
 * (edit profile, add result/grade/seminar/medical control) - closes on
 * Escape or the X button, and never shows the underlying page content. */
function FullScreenModal({ title, onClose, children }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white" role="dialog" aria-modal="true">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#00334d]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-full p-2 text-[#00334d]/60 hover:bg-[#e9ecef] hover:text-[#00334d]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
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
  const [addingGrade, setAddingGrade] = useState(false);
  const [addingSeminar, setAddingSeminar] = useState(false);
  const [addingMedicalVisa, setAddingMedicalVisa] = useState(false);
  const [resultsLevel, setResultsLevel] = useState('national');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (authLoading || !user) return undefined;
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

  // Athlete profiles (own or another athlete's) are only visible to signed-in
  // users - anonymous visitors get sent to the login/register page instead.
  if (!authLoading && !user) return <Navigate to="/cont" replace />;

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
  const europeanMedals = athlete.international_medals?.european || { gold: 0, silver: 0, bronze: 0 };
  const worldMedals = athlete.international_medals?.world || { gold: 0, silver: 0, bronze: 0 };

  return (
    <div className="flex flex-col">
      {showSeo && (
        <Seo
          title={ownProfile ? 'Profilul meu' : athlete.full_name}
          description={ownProfile ? undefined : `Profilul sportivului ${athlete.full_name}, Federația Română de Vovinam Việt Võ Đạo.`}
          path={ownProfile ? '/cont/profil' : `/sportivi/${athlete.id}`}
          noindex
        />
      )}

      <div className={`site-full-bleed relative overflow-hidden ${ownProfile ? 'pt-4 lg:pt-5' : ''}`} style={{ backgroundColor: '#0c223d' }}>
        {!ownProfile && (
          <Breadcrumbs
            items={[
              { label: 'Federație', to: '/despre' },
              { label: 'Sportivi', to: '/sportivi' },
              { label: athlete.full_name },
            ]}
            overlay
          />
        )}

        {ownProfile && athlete.status && athlete.status !== 'approved' && athlete.status !== 'revision_required' && (
          <div className="relative mx-auto w-full max-w-6xl px-4">
            <Alert variant="info">
              Acesta este profilul tău așa cum va arăta public. Cât timp este <strong>{(ATHLETE_STATUS_LABELS[athlete.status] || athlete.status).toLowerCase()}</strong>, nu este vizibil pentru nimeni altcineva.
            </Alert>
          </div>
        )}

        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-4 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-6 lg:text-left">
          {/* Simplified landscape layout: just the photo and details side
              by side, no card border/fill - reads as part of the hero
              itself rather than a boxed panel on top of it. Centered on
              mobile/tablet (stacked, and more compact than the lg+ row
              layout); side by side and left-aligned from lg up. */}
          <div className="flex w-full flex-col items-center gap-2 lg:w-auto lg:flex-row lg:gap-3">
            <div className="relative aspect-[3/2] w-28 shrink-0 bg-white/10 sm:w-32 lg:w-40">
              {athlete.profile_image ? (
                <img src={athlete.profile_image} alt={athlete.full_name} className="h-full w-full rounded-lg object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-lg text-2xl font-display font-bold text-white/40">
                  {athlete.first_name?.[0]}{athlete.last_name?.[0]}
                </div>
              )}
              {athlete.club?.logo && (
                <Link
                  to={athlete.club.slug ? `/cluburi/${athlete.club.slug}` : '#'}
                  className="absolute -right-3 -top-3 h-14 w-14 lg:-right-4 lg:-top-4 lg:h-16 lg:w-16"
                >
                  <img
                    src={athlete.club.logo}
                    alt={athlete.club.name}
                    title={athlete.club.name}
                    className="h-full w-full rounded-full object-contain drop-shadow-md"
                  />
                </Link>
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
                    className="absolute bottom-1 right-1 h-6 w-6 rounded-full border-white/40 bg-[#0c223d] p-0 text-white hover:bg-white/10 lg:bottom-2 lg:right-2 lg:h-7 lg:w-7"
                    title="Schimbă poza de profil"
                  >
                    <Pencil className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-1 flex-col items-center gap-1 text-center lg:items-start lg:gap-1.5 lg:text-left">
              <h1 className="font-display text-lg font-bold text-white sm:text-xl lg:text-2xl">{athlete.full_name}</h1>
              {athlete.current_grade?.name && <BeltBadge grade={athlete.current_grade.name} />}
              {photoError && <span className="text-xs text-red-300">{photoError}</span>}
            </div>
          </div>
          <div className="flex w-full flex-row flex-wrap items-start justify-center gap-3 lg:w-auto lg:justify-start lg:gap-4">
            <MedalGroup label="Național" medals={medals} ribbonColors={NATIONAL_RIBBON} />
            <MedalGroup label="European" medals={europeanMedals} ribbonColors={EUROPEAN_RIBBON} />
            <MedalGroup label="Mondial" medals={worldMedals} ribbonColors={WORLD_RIBBON} />
          </div>
        </div>
      </div>

      {/* Full width edge-to-edge at every breakpoint, flush against the
          hero above; the tab buttons themselves stay aligned to the
          page's usual max-w-6xl column via the inner wrapper. */}
      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-6xl px-4 py-1.5">
          <ScrollableTabs
            items={TABS}
            activeKey={tab}
            onSelect={(key) => setSearchParams(key === 'info' ? {} : { tab: key })}
            variant="pill"
          />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6">
        {ownProfile && athlete.status === 'revision_required' && (
          <Alert variant="destructive">
            {athlete.admin_notes || 'Un administrator a cerut completări la profilul tău. Te rugăm să-l actualizezi.'}
          </Alert>
        )}

        {ownProfile && athlete.profile_image_status === 'pending' && (
          <Alert>Noua ta poză de profil așteaptă aprobarea antrenorului sau a unui administrator. Poza curentă rămâne vizibilă până atunci.</Alert>
        )}
        {ownProfile && athlete.profile_image_status === 'rejected' && athlete.profile_image_admin_notes && (
          <Alert variant="destructive">Poza de profil trimisă a fost respinsă: {athlete.profile_image_admin_notes}</Alert>
        )}

        {editing && (
          <FullScreenModal title="Editează profilul" onClose={() => setEditing(false)}>
            <EditAthleteProfileForm
              athlete={athlete}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setAthlete((prev) => ({ ...prev, ...updated }));
                setEditing(false);
              }}
            />
          </FullScreenModal>
        )}
      {tab === 'info' && (
        <div className="flex flex-col gap-4">
          {ownProfile && !editing && (
            <Button type="button" variant="outline" className="w-fit" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editează profilul
            </Button>
          )}
          <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#00334d]/60">Grad curent</dt>
            <dd className="font-display font-bold text-[#00334d]">{athlete.current_grade?.name || '—'}</dd>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#00334d]/60">Rol</dt>
            <dd className="font-display font-bold text-[#00334d]">
              {[athlete.is_coach && 'Antrenor', athlete.is_referee && 'Arbitru'].filter(Boolean).join(', ') || 'Sportiv'}
            </dd>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#00334d]/60">Data nașterii</dt>
            <dd className="font-display font-bold text-[#00334d]">{athlete.date_of_birth ? formatDate(athlete.date_of_birth) : '—'}</dd>
          </div>
          </dl>
        </div>
      )}

      {tab === 'rezultate' && (
        <div className="flex flex-col gap-4">
          <ScrollableTabs items={RESULT_LEVEL_TABS} activeKey={resultsLevel} onSelect={setResultsLevel} variant="underline" />

          {resultsLevel === 'national' && (
            <>
              {ownProfile && !addingResult && (
                <Button type="button" className="w-fit" onClick={() => setAddingResult(true)}>
                  Adaugă rezultat
                </Button>
              )}
              {ownProfile && addingResult && (
                <FullScreenModal title="Adaugă rezultat" onClose={() => setAddingResult(false)}>
                  <ResultSubmissionForm
                    athleteId={athlete.id}
                    athleteGender={athlete.gender}
                    onCancel={() => setAddingResult(false)}
                    onSubmitted={async () => {
                      setAddingResult(false);
                      const response = await athleteAPI.myProfileDetail();
                      setAthlete(response.data);
                    }}
                  />
                </FullScreenModal>
              )}
              {athlete.results.length === 0 ? <EmptyTab message="Niciun rezultat înregistrat." /> : (
                <ResponsiveTable
                  head={(
                    <>
                      <th className="px-4 py-3 font-medium">Competiție</th>
                      <th className="px-4 py-3 font-medium">Categorie</th>
                      <th className="px-4 py-3 font-medium">Tip</th>
                      <th className="px-4 py-3 font-medium">Rezultat</th>
                      {ownProfile && <th className="px-4 py-3 font-medium">Status</th>}
                    </>
                  )}
                  rows={athlete.results.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">{r.competition || '—'}</td>
                      <td className="px-4 py-3 text-[#00334d]/60">{r.category || '—'}{r.team_name ? ` (${r.team_name})` : ''}</td>
                      <td className="px-4 py-3 text-[#00334d]/60">{RESULT_TYPE_LABELS[r.type] || r.type}</td>
                      <td className="px-4 py-3">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</td>
                      {ownProfile && (
                        <td className="px-4 py-3">
                          <Badge variant={r.status === 'approved' ? 'default' : 'outline'}>
                            {RESULT_STATUS_LABELS[r.status] || r.status}
                          </Badge>
                          {r.status === 'rejected' && r.admin_notes && (
                            <p className="mt-1 text-xs text-[#00334d]/60">{r.admin_notes}</p>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  cards={athlete.results.map((r) => (
                    <li key={r.id} className="rounded-lg border border-[#dce0e5] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{r.competition || '—'}</p>
                        {ownProfile && (
                          <Badge variant={r.status === 'approved' ? 'default' : 'outline'} className="shrink-0">
                            {RESULT_STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#00334d]/60">
                        {r.category || '—'}{r.team_name ? ` (${r.team_name})` : ''} · {RESULT_TYPE_LABELS[r.type] || r.type}
                      </p>
                      <p className="mt-2 text-sm font-semibold">{PLACEMENT_LABELS[r.placement_claimed] || '—'}</p>
                      {ownProfile && r.status === 'rejected' && r.admin_notes && (
                        <p className="mt-1 text-xs text-[#00334d]/60">{r.admin_notes}</p>
                      )}
                    </li>
                  ))}
                />
              )}
            </>
          )}

          {resultsLevel === 'european' && (
            <InternationalMedalsPanel medals={europeanMedals} ribbonColors={EUROPEAN_RIBBON} />
          )}

          {resultsLevel === 'world' && (
            <InternationalMedalsPanel medals={worldMedals} ribbonColors={WORLD_RIBBON} />
          )}
        </div>
      )}

      {tab === 'grade' && (
        <div className="flex flex-col gap-4">
          {ownProfile && !addingGrade && (
            <Button type="button" className="w-fit" onClick={() => setAddingGrade(true)}>
              Adaugă grad
            </Button>
          )}
          {ownProfile && addingGrade && (
            <FullScreenModal title="Adaugă grad" onClose={() => setAddingGrade(false)}>
              <GradeSubmissionForm
                athleteId={athlete.id}
                onCancel={() => setAddingGrade(false)}
                onSubmitted={async () => {
                  setAddingGrade(false);
                  const response = await athleteAPI.myProfileDetail();
                  setAthlete(response.data);
                }}
              />
            </FullScreenModal>
          )}
          {athlete.grade_history.length === 0 ? <EmptyTab message="Niciun grad înregistrat." /> : (
            <ResponsiveTable
              head={(
                <>
                  <th className="px-4 py-3 font-medium">Grad</th>
                  <th className="px-4 py-3 font-medium">Data obținerii</th>
                  <th className="px-4 py-3 font-medium">Eveniment</th>
                  {ownProfile && <th className="px-4 py-3 font-medium">Status</th>}
                </>
              )}
              rows={athlete.grade_history.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-3 font-medium">{g.grade?.name || '—'}</td>
                  <td className="px-4 py-3 text-[#00334d]/60">{formatDate(g.obtained_date)}</td>
                  <td className="px-4 py-3 text-[#00334d]/60">{g.event || '—'}</td>
                  {ownProfile && (
                    <td className="px-4 py-3">
                      <Badge variant={g.status === 'approved' ? 'default' : 'outline'}>
                        {RESULT_STATUS_LABELS[g.status] || g.status}
                      </Badge>
                      {g.status === 'rejected' && g.admin_notes && (
                        <p className="mt-1 text-xs text-[#00334d]/60">{g.admin_notes}</p>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              cards={athlete.grade_history.map((g) => (
                <li key={g.id} className="rounded-lg border border-[#dce0e5] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{g.grade?.name || '—'}</p>
                    {ownProfile && (
                      <Badge variant={g.status === 'approved' ? 'default' : 'outline'} className="shrink-0">
                        {RESULT_STATUS_LABELS[g.status] || g.status}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#00334d]/60">{formatDate(g.obtained_date)}{g.event ? ` · ${g.event}` : ''}</p>
                  {ownProfile && g.status === 'rejected' && g.admin_notes && (
                    <p className="mt-1 text-xs text-[#00334d]/60">{g.admin_notes}</p>
                  )}
                </li>
              ))}
            />
          )}
        </div>
      )}

      {tab === 'seminarii' && (
        <div className="flex flex-col gap-4">
          {ownProfile && !addingSeminar && (
            <Button type="button" className="w-fit" onClick={() => setAddingSeminar(true)}>
              Adaugă seminar
            </Button>
          )}
          {ownProfile && addingSeminar && (
            <FullScreenModal title="Adaugă seminar" onClose={() => setAddingSeminar(false)}>
              <SeminarSubmissionForm
                athleteId={athlete.id}
                onCancel={() => setAddingSeminar(false)}
                onSubmitted={async () => {
                  setAddingSeminar(false);
                  const response = await athleteAPI.myProfileDetail();
                  setAthlete(response.data);
                }}
              />
            </FullScreenModal>
          )}
          {athlete.seminars.length === 0 ? <EmptyTab message="Nicio participare la seminarii." /> : (
            <ResponsiveTable
              head={(
                <>
                  <th className="px-4 py-3 font-medium">Eveniment</th>
                  <th className="px-4 py-3 font-medium">Perioadă</th>
                  <th className="px-4 py-3 font-medium">Loc</th>
                  {ownProfile && <th className="px-4 py-3 font-medium">Status</th>}
                </>
              )}
              rows={athlete.seminars.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">{s.event || '—'}</td>
                  <td className="px-4 py-3 text-[#00334d]/60">{formatDate(s.start_date)}{s.end_date ? ` – ${formatDate(s.end_date)}` : ''}</td>
                  <td className="px-4 py-3 text-[#00334d]/60">{s.place || '—'}</td>
                  {ownProfile && (
                    <td className="px-4 py-3">
                      <Badge variant={s.status === 'approved' ? 'default' : 'outline'}>
                        {RESULT_STATUS_LABELS[s.status] || s.status}
                      </Badge>
                      {s.status === 'rejected' && s.admin_notes && (
                        <p className="mt-1 text-xs text-[#00334d]/60">{s.admin_notes}</p>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              cards={athlete.seminars.map((s) => (
                <li key={s.id} className="rounded-lg border border-[#dce0e5] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.event || '—'}</p>
                    {ownProfile && (
                      <Badge variant={s.status === 'approved' ? 'default' : 'outline'} className="shrink-0">
                        {RESULT_STATUS_LABELS[s.status] || s.status}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#00334d]/60">
                    {formatDate(s.start_date)}{s.end_date ? ` – ${formatDate(s.end_date)}` : ''}{s.place ? ` · ${s.place}` : ''}
                  </p>
                  {ownProfile && s.status === 'rejected' && s.admin_notes && (
                    <p className="mt-1 text-xs text-[#00334d]/60">{s.admin_notes}</p>
                  )}
                </li>
              ))}
            />
          )}
        </div>
      )}

      {tab === 'medical' && (
        <div className="flex flex-col gap-4">
          {ownProfile && !addingMedicalVisa && (
            <Button type="button" className="w-fit" onClick={() => setAddingMedicalVisa(true)}>
              Adaugă viză medicală
            </Button>
          )}
          {ownProfile && addingMedicalVisa && (
            <FullScreenModal title="Adaugă viză medicală" onClose={() => setAddingMedicalVisa(false)}>
              <MedicalVisaSubmissionForm
                onCancel={() => setAddingMedicalVisa(false)}
                onSubmitted={async () => {
                  setAddingMedicalVisa(false);
                  const response = await athleteAPI.myProfileDetail();
                  setAthlete(response.data);
                }}
              />
            </FullScreenModal>
          )}
          {athlete.medical_visas.length === 0 ? <EmptyTab message="Nicio viză medicală înregistrată." /> : (
            <ul className="flex flex-col gap-2">
              {athlete.medical_visas.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 rounded-lg border border-[#dce0e5] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>Viză medicală</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#00334d]/60">{formatDate(v.issued_date)}</span>
                    {ownProfile && (
                      <Badge variant={v.status === 'approved' ? 'default' : 'outline'}>
                        {RESULT_STATUS_LABELS[v.status] || v.status}
                      </Badge>
                    )}
                  </div>
                  {ownProfile && v.status === 'rejected' && v.admin_notes && (
                    <p className="text-xs text-[#00334d]/60">{v.admin_notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'vize' && (
        athlete.annual_visas.length === 0 ? <EmptyTab message="Nicio viză anuală înregistrată." /> : (
          <ul className="flex flex-col gap-2">
            {athlete.annual_visas.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border border-[#dce0e5] px-4 py-3 text-sm">
                <span>Viză anuală</span>
                <span className="text-[#00334d]/60">{formatDate(v.issued_date)}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'poze' && <GalleryTab athleteId={athlete.id} />}
      </div>
    </div>
  );
}
