import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';
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

export default function AthleteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    athleteAPI.get(id).then(({ data }) => {
      setAthlete(data);
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
  return (
    <div className="min-h-full bg-white p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="frvv-surface flex flex-col items-center gap-3 p-4">
              <div className="flex h-36 w-36 items-center justify-center overflow-hidden border-2 border-black bg-blue-100 text-4xl font-black text-blue-500">
                {profileImg ? <img src={profileImg} alt={fullName} className="h-full w-full object-cover" /> : initials || '?'}
              </div>
              <div className="w-full space-y-2 text-sm text-gray-700">
                <DetailLine label="Club" value={clubName} />
                <DetailLine label="Oraș" value={cityName} />
                <DetailLine label="Naștere" value={fmtDate(athlete.date_of_birth)} />
              </div>
          </div>

          <div className="space-y-4">
            <div className="frvv-surface overflow-hidden">
              <div className="border-b-2 border-black bg-yellow-300 px-5 py-3">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-gray-700">Profil sportiv</p>
                    <h1 className="mt-1 text-2xl font-black uppercase tracking-wide text-gray-900 md:text-3xl">{fullName}</h1>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={athlete.status} />
                    {athlete.is_coach && <span className="frvv-chip">Antrenor</span>}
                    {athlete.is_referee && <span className="frvv-chip">Arbitru</span>}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
              <InfoCard title="Date personale">
                <InfoRow label="Telefon" value={athlete.mobile_number} />
                <InfoRow label="Adresă" value={athlete.address} />
                <InfoRow label="Data înregistrării" value={fmtDate(athlete.registered_date)} />
                <InfoRow label="Expirare" value={fmtDate(athlete.expiration_date)} />
              </InfoCard>

              <InfoCard title="Contact de urgență">
                <InfoRow label="Persoană" value={athlete.emergency_contact_name} />
                <InfoRow label="Telefon" value={athlete.emergency_contact_phone} />
              </InfoCard>

              <InfoCard title="Documente">
                <InfoRow label="Fotografie" value={
                  profileImg
                    ? <a href={profileImg} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 hover:underline">Vizualizează</a>
                    : '—'
                } />
                <InfoRow label="Certificat medical" value={
                  athlete.medical_certificate
                    ? <a href={imgUrl(athlete.medical_certificate)} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 hover:underline">Vizualizează</a>
                    : '—'
                } />
              </InfoCard>

              <InfoCard title="Observații sportive">
                <InfoRow label="Grad curent" value={gradeName} />
                <InfoRow label="Imagine grad" value={gradeImg ? <img src={gradeImg} alt={gradeName} className="ml-auto h-10 w-auto object-contain" /> : '—'} />
              </InfoCard>
            </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">

          {/* ── DATE PERSONALE ── */}
          <InfoCard title="Date sportive suplimentare">
            <InfoRow label="Club" value={clubName} />
            <InfoRow label="Oraș" value={cityName} />
            <InfoRow label="Grad" value={gradeName} />
          </InfoCard>

          <InfoCard title="Calendar administrativ">
            <InfoRow label="Înregistrare" value={fmtDate(athlete.registered_date)} />
            <InfoRow label="Expirare legitimație" value={fmtDate(athlete.expiration_date)} />
          </InfoCard>
        </div>

        {athlete.previous_experience && (
          <InfoCard title="Experiență anterioară">
            <p className="text-sm text-gray-700 whitespace-pre-line">{athlete.previous_experience}</p>
          </InfoCard>
        )}

        <div className="pt-2">
          <button
            onClick={() => navigate(-1)}
            className="frvv-btn-secondary"
          >
            ← Înapoi la lista de sportivi
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable card ── */
function InfoCard({ title, children }) {
  return (
    <div className="frvv-surface overflow-hidden">
      <div className="border-b border-black bg-yellow-100 px-4 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gray-700">{title}</h3>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

/* ── Reusable row ── */
function InfoRow({ label, value }) {
  const display = value || '—';
  return (
    <div className="flex justify-between items-start gap-3 border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs uppercase tracking-wide text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm font-semibold text-gray-800 text-right">{typeof display === 'string' ? display : display}</dd>
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">{value || '—'}</div>
    </div>
  );
}
