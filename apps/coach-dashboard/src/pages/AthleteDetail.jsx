import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { athleteAPI, gradeHistoryAPI, scoreAPI, visaAPI } from '@shared/lib/api';
import { Spinner, StatusBadge } from '@shared/components/ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:8000';

function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d; }
}

function LinkValue({ href, children }) {
  if (!href) return '—';
  return <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 hover:underline">{children}</a>;
}

function VisaBadge({ visa }) {
  if (!visa) {
    return (
      <span
        title="Lipsește"
        aria-label="Lipsește"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-gray-500"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 12H17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  return visa.is_valid ? (
    <span
      title="Validă"
      aria-label="Validă"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300 bg-emerald-100 text-emerald-800"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6.5 12.5L10.2 16.2L17.5 8.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span
      title="Invalidă"
      aria-label="Invalidă"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-300 bg-red-100 text-red-700"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 8L16 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M16 8L8 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function getLatestVisaForAthlete(items, athleteId) {
  return (items || [])
    .filter((item) => Number(item?.athlete) === Number(athleteId))
    .sort((a, b) => String(b?.issued_date || '').localeCompare(String(a?.issued_date || '')))[0] || null;
}

function countMedals(results = []) {
  return results.reduce((acc, item) => {
    if (item?.status !== 'approved') return acc;
    if (item?.placement_claimed === '1st') acc.gold += 1;
    if (item?.placement_claimed === '2nd') acc.silver += 1;
    if (item?.placement_claimed === '3rd') acc.bronze += 1;
    return acc;
  }, { gold: 0, silver: 0, bronze: 0 });
}

function MedalIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2H10L12 6L14 2H17L14.5 9H9.5L7 2Z" fill="currentColor" opacity="0.9" />
      <circle cx="12" cy="15" r="5" fill="currentColor" />
      <path d="M12 12.6L12.74 14.09L14.39 14.33L13.2 15.49L13.48 17.13L12 16.35L10.52 17.13L10.8 15.49L9.61 14.33L11.26 14.09L12 12.6Z" fill="white" />
    </svg>
  );
}

export default function AthleteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [gradeHistory, setGradeHistory] = useState([]);
  const [results, setResults] = useState([]);
  const [annualVisas, setAnnualVisas] = useState([]);
  const [medicalVisas, setMedicalVisas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      athleteAPI.get(id),
      gradeHistoryAPI.list({ athlete: id }).catch(() => ({ data: [] })),
      scoreAPI.list({ athlete: id }).catch(() => ({ data: [] })),
      visaAPI.annual.list({ athlete: id }).catch(() => ({ data: [] })),
      visaAPI.medical.list({ athlete: id }).catch(() => ({ data: [] })),
    ]).then(([athleteRes, gradeHistoryRes, scoreRes, annualVisaRes, medicalVisaRes]) => {
      setAthlete(athleteRes.data);
      setGradeHistory(Array.isArray(gradeHistoryRes.data) ? gradeHistoryRes.data : gradeHistoryRes.data?.results ?? []);
      setResults(Array.isArray(scoreRes.data) ? scoreRes.data : scoreRes.data?.results ?? []);
      setAnnualVisas(Array.isArray(annualVisaRes.data) ? annualVisaRes.data : annualVisaRes.data?.results ?? []);
      setMedicalVisas(Array.isArray(medicalVisaRes.data) ? medicalVisaRes.data : medicalVisaRes.data?.results ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!athlete) return <p className="py-20 text-center text-gray-500">Sportivul nu a fost găsit.</p>;

  const fullName = `${athlete.last_name || ''} ${athlete.first_name || ''}`.trim() || 'Sportiv';
  const initials = `${(athlete.first_name || '')[0] || ''}${(athlete.last_name || '')[0] || ''}`.toUpperCase();
  const profileImg = imgUrl(athlete.profile_image);
  const gradeImg = imgUrl(athlete.current_grade?.image);
  const gradeName = athlete.current_grade?.name || athlete.current_grade_details?.name || '—';
  const clubName = athlete.club?.name || '—';
  const cityName = athlete.city?.name || '—';
  const roles = [athlete.is_coach ? 'Antrenor' : null, athlete.is_referee ? 'Arbitru' : null].filter(Boolean);
  const sortedGradeHistory = [...gradeHistory].sort((a, b) => String(b.obtained_date || '').localeCompare(String(a.obtained_date || '')));
  const soloResults = results.filter((item) => item.type === 'solo');
  const teamResults = results.filter((item) => item.type === 'teams');
  const fightResults = results.filter((item) => item.type === 'fight');
  const annualVisa = getLatestVisaForAthlete(annualVisas, athlete.id);
  const medicalVisa = getLatestVisaForAthlete(medicalVisas, athlete.id);
  const medalCounts = countMedals(results);

  return (
    <div className="min-h-full bg-white p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button onClick={() => navigate(-1)} className="mb-3 frvv-btn-secondary">← Înapoi la lista de sportivi</button>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black uppercase tracking-wide text-gray-900 md:text-4xl">{fullName}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span title={`Viza anuală ${annualVisa ? (annualVisa.is_valid ? 'validă' : 'invalidă') : 'lipsește'}`} aria-label="Viza anuală">
                  <VisaBadge visa={annualVisa} />
                </span>
                <span title={`Viza medicală ${medicalVisa ? (medicalVisa.is_valid ? 'validă' : 'invalidă') : 'lipsește'}`} aria-label="Viza medicală">
                  <VisaBadge visa={medicalVisa} />
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 border border-yellow-500 bg-yellow-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-yellow-800">
                <MedalIcon className="h-4 w-4" />
                <span>{medalCounts.gold}</span>
              </span>
              <span className="inline-flex items-center gap-2 border border-gray-400 bg-gray-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
                <MedalIcon className="h-4 w-4" />
                <span>{medalCounts.silver}</span>
              </span>
              <span className="inline-flex items-center gap-2 border border-amber-700 bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
                <MedalIcon className="h-4 w-4" />
                <span>{medalCounts.bronze}</span>
              </span>
            </div>
          </div>
          <div />
        </div>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="frvv-surface overflow-hidden">
              <div className="space-y-5 p-5">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-44 w-44 items-center justify-center overflow-hidden border-2 border-black bg-blue-100 text-5xl font-black text-blue-500">
                    {profileImg ? <img src={profileImg} alt={fullName} className="h-full w-full object-cover" /> : initials || '?'}
                  </div>
                  <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <DetailTile label="Club" value={clubName} />
                    <DetailTile label="Oraș" value={cityName} />
                    <DetailTile label="Data nașterii" value={fmtDate(athlete.date_of_birth)} />
                    <DetailTile label="Telefon" value={athlete.mobile_number} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <StatPanel label="Înregistrare" value={fmtDate(athlete.registered_date)} />
                  <StatPanel label="Expirare legitimație" value={fmtDate(athlete.expiration_date)} />
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <InfoCard title="Date personale">
                <InfoRow label="Nume" value={fullName} />
                <InfoRow label="Adresă" value={athlete.address} />
                <InfoRow label="Oraș" value={cityName} />
                <InfoRow label="Telefon" value={athlete.mobile_number} />
              </InfoCard>

              <InfoCard title="Date sportive">
                <InfoRow label="Club" value={clubName} />
                <InfoRow label="Grad curent" value={gradeName} />
                <InfoRow label="Roluri" value={roles.length ? roles.join(', ') : 'Sportiv'} />
                <InfoRow label="Status cont" value={<StatusBadge status={athlete.status} />} />
              </InfoCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <InfoCard title="Contact de urgență">
                <InfoRow label="Persoană" value={athlete.emergency_contact_name} />
                <InfoRow label="Telefon" value={athlete.emergency_contact_phone} />
              </InfoCard>

              <InfoCard title="Calendar administrativ">
                <InfoRow label="Data înregistrării" value={fmtDate(athlete.registered_date)} />
                <InfoRow label="Expirare legitimație" value={fmtDate(athlete.expiration_date)} />
                <InfoRow label="Data nașterii" value={fmtDate(athlete.date_of_birth)} />
              </InfoCard>
            </div>

            <InfoCard title="Observații și experiență">
              <div className="space-y-4">
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Experiență anterioară</div>
                  <p className="text-sm leading-6 text-gray-700 whitespace-pre-line">
                    {athlete.previous_experience || 'Nu există informații suplimentare.'}
                  </p>
                </div>
              </div>
            </InfoCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <InfoCard title="Grade history">
                <TimelineList
                  items={sortedGradeHistory}
                  emptyMessage="Nu există grade în istoric."
                  renderItem={(entry) => (
                    <div>
                      <div className="text-sm font-black text-gray-900">{entry.grade_name || '—'}</div>
                      <div className="mt-1 text-xs text-gray-600">Data obținerii: {fmtDate(entry.obtained_date)}</div>
                      <div className="mt-1 text-xs text-gray-500">Eveniment: {entry.event_name || '—'}</div>
                      {(entry.examiner_1_name || entry.examiner_2_name) && (
                        <div className="mt-1 text-xs text-gray-500">
                          Examinatori: {[entry.examiner_1_name, entry.examiner_2_name].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  )}
                />
              </InfoCard>

              <InfoCard title="Rezultate solo">
                <TimelineList
                  items={soloResults}
                  emptyMessage="Nu există rezultate solo."
                  renderItem={(entry) => <ResultSummary entry={entry} />}
                />
              </InfoCard>

              <InfoCard title="Rezultate echipă">
                <TimelineList
                  items={teamResults}
                  emptyMessage="Nu există rezultate de echipă."
                  renderItem={(entry) => <ResultSummary entry={entry} showTeamMembers />}
                />
              </InfoCard>

              <InfoCard title="Rezultate luptă">
                <TimelineList
                  items={fightResults}
                  emptyMessage="Nu există rezultate de luptă."
                  renderItem={(entry) => <ResultSummary entry={entry} />}
                />
              </InfoCard>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Reusable card ── */
function InfoCard({ title, children, compact = false }) {
  return (
    <div className="frvv-surface overflow-hidden">
      <div className="border-b border-black bg-yellow-100 px-4 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gray-700">{title}</h3>
      </div>
      <div className={`space-y-2 ${compact ? 'px-4 py-3' : 'px-4 py-4 md:px-5'}`}>{children}</div>
    </div>
  );
}

/* ── Reusable row ── */
function InfoRow({ label, value }) {
  const display = value || '—';
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm font-semibold text-gray-800 sm:text-right">{typeof display === 'string' ? display : display}</dd>
    </div>
  );
}

function DetailTile({ label, value }) {
  return (
    <div className="border border-black/10 bg-gray-50 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">{value || '—'}</div>
    </div>
  );
}

function StatPanel({ label, value }) {
  return (
    <div className="border-2 border-black bg-white px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-black text-gray-900">{value || '—'}</div>
    </div>
  );
}

function TimelineList({ items, renderItem, emptyMessage }) {
  if (!items.length) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id ?? index} className="border border-black/10 bg-gray-50 px-3 py-3">
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

function ResultSummary({ entry, showTeamMembers = false }) {
  const teamMembers = Array.isArray(entry.team_members) ? entry.team_members.map((member) => member.name).join(' & ') : '';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-black text-gray-900">{entry.category_name || 'Categorie'}</div>
        {entry.placement_claimed ? <span className="frvv-chip">Loc: {entry.placement_claimed}</span> : null}
        {entry.status ? <StatusBadge status={entry.status} label={entry.status} /> : null}
      </div>
      <div className="mt-1 text-xs text-gray-600">{entry.competition_name || 'Competiție'} · {fmtDate(entry.competition_date)}</div>
      {entry.group_name ? <div className="mt-1 text-xs text-gray-500">Grupă: {entry.group_name}</div> : null}
      {entry.score != null ? <div className="mt-1 text-xs text-gray-500">Scor: {entry.score}</div> : null}
      {showTeamMembers && teamMembers ? <div className="mt-1 text-xs text-gray-500">Membri: {teamMembers}</div> : null}
      {entry.team_name ? <div className="mt-1 text-xs text-gray-500">Echipă: {entry.team_name}</div> : null}
      {entry.notes ? <div className="mt-1 text-xs text-gray-500 whitespace-pre-line">{entry.notes}</div> : null}
    </div>
  );
}
