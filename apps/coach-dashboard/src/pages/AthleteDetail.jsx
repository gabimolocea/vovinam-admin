import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';
import { PageHeader, Card, Spinner, StatusBadge } from '@shared/components/ui';

export default function AthleteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    athleteAPI.get(id).then(({ data }) => {
      setAthlete(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!athlete) return <p className="py-20 text-center text-gray-500">Athlete not found.</p>;

  const fullName = `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() || athlete.full_name || 'Athlete';

  return (
    <>
      <PageHeader title={fullName}>
        <StatusBadge status={athlete.status} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Personal Info</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Birth Date</dt>
              <dd className="font-medium">{athlete.birth_date || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Gender</dt>
              <dd className="font-medium capitalize">{athlete.gender || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Weight</dt>
              <dd className="font-medium">{athlete.weight ? `${athlete.weight} kg` : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Club</dt>
              <dd className="font-medium">{athlete.club_name || '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Grade & Visas</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Current Grade</dt>
              <dd className="font-medium">{athlete.current_grade_name || athlete.current_grade || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Annual Visa</dt>
              <dd className="font-medium">{athlete.has_annual_visa ? '✅ Valid' : '❌ Missing'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Medical Visa</dt>
              <dd className="font-medium">{athlete.has_medical_visa ? '✅ Valid' : '❌ Missing'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-6">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          ← Back
        </button>
      </div>
    </>
  );
}
