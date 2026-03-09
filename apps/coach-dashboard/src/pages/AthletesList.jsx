import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { athleteAPI, visaAPI } from '@shared/lib/api';
import { PageHeader, Spinner, EmptyState, DataTable, StatusBadge } from '@shared/components/ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:8000';

const STATUS_LABELS = {
  approved: 'Aprobat',
  pending: 'În așteptare',
  rejected: 'Respins',
  revision_required: 'Necesită revizie',
};

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${API_BASE}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

const AVATAR_PLACEHOLDER = '/avatar-placeholder.svg';

function normalizeList(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function getLatestVisaByAthlete(items) {
  const map = new Map();
  items.forEach((item) => {
    const athleteId = item?.athlete;
    if (!athleteId) return;
    const current = map.get(athleteId);
    const currentDate = current?.issued_date ? new Date(current.issued_date).getTime() : 0;
    const nextDate = item?.issued_date ? new Date(item.issued_date).getTime() : 0;
    if (!current || nextDate >= currentDate) {
      map.set(athleteId, item);
    }
  });
  return map;
}

function VisaBadge({ visa }) {
  if (!visa) {
    return <span className="inline-flex rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">Lipsește</span>;
  }

  return visa.is_valid ? (
    <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Validă</span>
  ) : (
    <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Invalidă</span>
  );
}

function ApprovalInfoIcon() {
  return (
    <span
      title="Sportivii trebuie aprobați de adminul federației înainte să fie validați complet în sistem."
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-blue-300 bg-blue-100 text-[10px] font-black text-blue-700"
    >
      i
    </span>
  );
}

export default function AthletesList() {
  const [athletes, setAthletes] = useState([]);
  const [annualVisas, setAnnualVisas] = useState([]);
  const [medicalVisas, setMedicalVisas] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      athleteAPI.list({ my_club: true }),
      visaAPI.annual.list().catch(() => ({ data: [] })),
      visaAPI.medical.list().catch(() => ({ data: [] })),
    ]).then(([athletesRes, annualRes, medicalRes]) => {
      setAthletes(normalizeList(athletesRes.data));
      setAnnualVisas(normalizeList(annualRes.data));
      setMedicalVisas(normalizeList(medicalRes.data));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const latestAnnualVisaByAthlete = useMemo(() => getLatestVisaByAthlete(annualVisas), [annualVisas]);
  const latestMedicalVisaByAthlete = useMemo(() => getLatestVisaByAthlete(medicalVisas), [medicalVisas]);

  const columns = [
    {
      key: 'photo',
      label: '',
      render: (r) => {
        const profileImageUrl = imgUrl(r.profile_image);
        return (
          <div className="h-10 w-10 rounded-full overflow-hidden shrink-0 border border-gray-200 bg-gray-100">
            <img
              src={profileImageUrl || AVATAR_PLACEHOLDER}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = AVATAR_PLACEHOLDER;
              }}
            />
          </div>
        );
      },
    },
    { key: 'name', label: 'Nume', render: (r) => `${r.last_name || ''} ${r.first_name || ''}`.trim() || r.full_name || '—' },
    { key: 'current_grade', label: 'Grad', render: (r) => r.current_grade?.name || r.current_grade_name || '—' },
    { key: 'date_of_birth', label: 'Data nașterii', render: (r) => r.date_of_birth || '—' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} label={STATUS_LABELS[r.status] || r.status || '—'} />
          <ApprovalInfoIcon />
        </div>
      ),
    },
    {
      key: 'annual_visa',
      label: 'Viza anuală',
      render: (r) => <VisaBadge visa={latestAnnualVisaByAthlete.get(r.id)} />,
    },
    {
      key: 'medical_visa',
      label: 'Viza medicală',
      render: (r) => <VisaBadge visa={latestMedicalVisaByAthlete.get(r.id)} />,
    },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="p-6">
      <PageHeader title="Sportivi" subtitle="Sportivii din clubul tău">
        <button
          onClick={() => navigate('/athletes/new')}
          className="frvv-btn-add"
        >
          <span className="frvv-btn-add-icon">+</span>
          Adaugă sportiv
        </button>
      </PageHeader>
      {athletes.length === 0 ? (
        <EmptyState icon="🥋" title="Fără sportivi" message="Nu au fost găsiți sportivi în clubul tău." />
      ) : (
        <DataTable columns={columns} rows={athletes} onRowClick={(r) => navigate(`/athletes/${r.id}`)} />
      )}
    </div>
  );
}
