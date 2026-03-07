import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';

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

const STATUS_MAP = {
  approved: { label: 'Aprobat', color: 'bg-green-100 text-green-700' },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700' },
  rejected: { label: 'Respins', color: 'bg-red-100 text-red-700' },
  revision_required: { label: 'Necesită revizuire', color: 'bg-orange-100 text-orange-700' },
};

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
  const st = STATUS_MAP[athlete.status] || STATUS_MAP.pending;

  return (
    <div className="min-h-full bg-gray-50">
      {/* ═══ COVER + PROFILE HEADER ═══ */}
      <div className="relative">
        {/* Cover gradient */}
        <div className="h-36 sm:h-44 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-b-2xl" />

        {/* Profile card overlapping cover */}
        <div className="max-w-3xl mx-auto px-4 -mt-16 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg px-5 pt-0 pb-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-12 sm:-mt-14">
              {/* Avatar */}
              <div className="shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-blue-100 flex items-center justify-center">
                {profileImg ? (
                  <img src={profileImg} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-blue-400">{initials}</span>
                )}
              </div>

              {/* Name + meta */}
              <div className="flex-1 text-center sm:text-left pb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">{fullName}</h1>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1.5 text-sm text-gray-500">
                  {clubName !== '—' && <span>🏛 {clubName}</span>}
                  {cityName !== '—' && <span>📍 {cityName}</span>}
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                </div>
              </div>

              {/* Grade badge */}
              <div className="shrink-0 flex flex-col items-center gap-1 pb-1">
                {gradeImg ? (
                  <img src={gradeImg} alt={gradeName} className="w-12 h-12 object-contain" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">🥋</div>
                )}
                <span className="text-[10px] font-semibold text-gray-600">{gradeName}</span>
              </div>
            </div>

            {/* Role badges */}
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 ml-0 sm:ml-36">
              {athlete.is_coach && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold px-2.5 py-0.5">🎓 Antrenor</span>
              )}
              {athlete.is_referee && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-2.5 py-0.5">⚖️ Arbitru</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="max-w-3xl mx-auto px-4 mt-4 pb-8 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">

          {/* ── DATE PERSONALE ── */}
          <InfoCard title="Date personale" icon="👤">
            <InfoRow label="Data nașterii" value={fmtDate(athlete.date_of_birth)} />
            <InfoRow label="Telefon" value={athlete.mobile_number} />
            <InfoRow label="Adresă" value={athlete.address} />
          </InfoCard>

          {/* ── CONTACT URGENȚĂ ── */}
          <InfoCard title="Contact de urgență" icon="🆘">
            <InfoRow label="Nume contact" value={athlete.emergency_contact_name} />
            <InfoRow label="Telefon contact" value={athlete.emergency_contact_phone} />
          </InfoCard>

          {/* ── DATE SPORTIVE ── */}
          <InfoCard title="Date sportive" icon="🥋">
            <InfoRow label="Club" value={clubName} />
            <InfoRow label="Oraș" value={cityName} />
            <InfoRow label="Grad" value={gradeName} />
            <InfoRow label="Data înregistrării" value={fmtDate(athlete.registered_date)} />
            <InfoRow label="Data expirării" value={fmtDate(athlete.expiration_date)} />
          </InfoCard>

          {/* ── DOCUMENTE ── */}
          <InfoCard title="Documente" icon="📄">
            <InfoRow label="Fotografie" value={
              profileImg
                ? <a href={profileImg} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">Vizualizează →</a>
                : '—'
            } />
            <InfoRow label="Certificat medical" value={
              athlete.medical_certificate
                ? <a href={imgUrl(athlete.medical_certificate)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">Vizualizează →</a>
                : '—'
            } />
          </InfoCard>

        </div>

        {/* ── EXPERIENȚĂ ── */}
        {athlete.previous_experience && (
          <InfoCard title="Experiență anterioară" icon="📋">
            <p className="text-sm text-gray-700 whitespace-pre-line">{athlete.previous_experience}</p>
          </InfoCard>
        )}

        {/* Back button */}
        <div className="pt-2">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            ← Înapoi la lista de sportivi
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable card ── */
function InfoCard({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <span className="text-sm">{icon}</span>
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

/* ── Reusable row ── */
function InfoRow({ label, value }) {
  const display = value || '—';
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-xs text-gray-500 shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-gray-800 text-right">{typeof display === 'string' ? display : display}</dd>
    </div>
  );
}
