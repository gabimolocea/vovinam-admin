import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { categoryAPI, enrollmentAPI } from '@shared/lib/api';
import { Card, Spinner, EmptyState, PageHeader } from '@shared/components/ui';

export default function EventCategories() {
  const { id: eventId } = useParams();
  const [categories, setCategories] = useState([]);
  const [enrolled, setEnrolled] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    Promise.all([
      categoryAPI.list({ event: eventId }),
      enrollmentAPI.categoryAthletes.list({ event: eventId, my: true }).catch(() => ({ data: [] })),
    ]).then(([catRes, enrollRes]) => {
      const cats = Array.isArray(catRes.data) ? catRes.data : catRes.data.results ?? [];
      setCategories(cats);
      const enrolledCats = (Array.isArray(enrollRes.data) ? enrollRes.data : enrollRes.data.results ?? []);
      setEnrolled(new Set(enrolledCats.map((e) => e.category)));
      setLoading(false);
    });
  }, [eventId]);

  const handleEnroll = async (categoryId) => {
    setBusyId(categoryId);
    try {
      await enrollmentAPI.categoryAthletes.create({ category: categoryId });
      setEnrolled((prev) => new Set([...prev, categoryId]));
    } catch (err) {
      alert(err.response?.data?.detail || 'Enrollment failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Select Categories" subtitle="Choose the categories you want to compete in" />

      {categories.length === 0 ? (
        <EmptyState icon="📋" title="No categories" message="This event has no categories yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((cat) => {
            const isEnrolled = enrolled.has(cat.id);
            return (
              <Card key={cat.id} className={isEnrolled ? 'ring-2 ring-green-500' : ''}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                    <p className="text-xs text-gray-500 capitalize">
                      {cat.category_type} · {cat.gender}
                    </p>
                  </div>
                  {isEnrolled ? (
                    <span className="border border-green-600 bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      ✓ Enrolled
                    </span>
                  ) : (
                    <button
                      onClick={() => handleEnroll(cat.id)}
                      disabled={busyId === cat.id}
                      className="frvv-btn-primary px-3 py-1.5 text-xs"
                    >
                      {busyId === cat.id ? 'Enrolling…' : 'Enroll'}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
