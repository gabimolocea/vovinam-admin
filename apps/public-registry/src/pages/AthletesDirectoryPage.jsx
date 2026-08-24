import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';

function getAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function getAgeGroup(age) {
  if (age == null) return 'unknown';
  if (age < 12) return 'u12';
  if (age < 16) return 'u16';
  if (age < 21) return 'u21';
  return 'senior';
}

export default function AthletesDirectoryPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [clubFilter, setClubFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('approved');
  const [cityFilter, setCityFilter] = useState('all');

  useEffect(() => {
    let isMounted = true;

    async function fetchAthletes() {
      setLoading(true);
      setError('');
      try {
        const response = await athleteAPI.list();
        if (!isMounted) return;
        setAthletes(Array.isArray(response?.data) ? response.data : []);
      } catch (err) {
        if (!isMounted) return;
        const message = err?.response?.data?.detail || err?.message || 'Nu s-a putut încărca lista sportivilor.';
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAthletes();
    return () => {
      isMounted = false;
    };
  }, []);

  const clubOptions = useMemo(() => {
    const map = new Map();
    athletes.forEach((athlete) => {
      if (athlete?.club?.id) {
        map.set(String(athlete.club.id), athlete.club.name || 'Club necunoscut');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [athletes]);

  const gradeOptions = useMemo(() => {
    const set = new Set();
    athletes.forEach((athlete) => {
      const gradeName = athlete?.current_grade?.name;
      if (gradeName) set.add(gradeName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [athletes]);

  const cityOptions = useMemo(() => {
    const set = new Set();
    athletes.forEach((athlete) => {
      const cityName = athlete?.city?.name || athlete?.club?.city?.name;
      if (cityName) set.add(cityName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [athletes]);

  const filteredAthletes = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return athletes
      .filter((athlete) => (statusFilter === 'all' ? true : athlete?.status === statusFilter))
      .filter((athlete) => {
        if (clubFilter === 'all') return true;
        return String(athlete?.club?.id || '') === clubFilter;
      })
      .filter((athlete) => {
        if (gradeFilter === 'all') return true;
        return (athlete?.current_grade?.name || '') === gradeFilter;
      })
      .filter((athlete) => {
        if (ageGroupFilter === 'all') return true;
        const age = getAge(athlete?.date_of_birth);
        return getAgeGroup(age) === ageGroupFilter;
      })
      .filter((athlete) => {
        if (cityFilter === 'all') return true;
        const cityName = athlete?.city?.name || athlete?.club?.city?.name || '';
        return cityName === cityFilter;
      })
      .filter((athlete) => {
        if (!normalized) return true;
        const fullName = `${athlete?.first_name || ''} ${athlete?.last_name || ''}`.toLowerCase();
        const clubName = (athlete?.club?.name || '').toLowerCase();
        const gradeName = (athlete?.current_grade?.name || '').toLowerCase();
        const cityName = (athlete?.city?.name || athlete?.club?.city?.name || '').toLowerCase();
        return fullName.includes(normalized) || clubName.includes(normalized) || gradeName.includes(normalized) || cityName.includes(normalized);
      })
      .sort((a, b) => {
        const aLast = (a?.last_name || '').toLowerCase();
        const bLast = (b?.last_name || '').toLowerCase();
        if (aLast !== bLast) return aLast.localeCompare(bLast);
        return (a?.first_name || '').toLowerCase().localeCompare((b?.first_name || '').toLowerCase());
      });
  }, [athletes, query, clubFilter, gradeFilter, ageGroupFilter, statusFilter, cityFilter]);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="text-xl font-black text-gray-900">Registrul Public Sportivi</h1>
        <p className="mt-1 text-sm text-gray-600">
          Profiluri publice validate. Caută sportivii după nume, club sau grad.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
            placeholder="Caută nume, club, grad"
          />
          <select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate cluburile</option>
            {clubOptions.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </select>

          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate gradele</option>
            {gradeOptions.map((gradeName) => (
              <option key={gradeName} value={gradeName}>{gradeName}</option>
            ))}
          </select>

          <select
            value={ageGroupFilter}
            onChange={(e) => setAgeGroupFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate vârstele</option>
            <option value="u12">Sub 12</option>
            <option value="u16">12-15</option>
            <option value="u21">16-20</option>
            <option value="senior">21+</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="approved">Doar validați</option>
            <option value="all">Toate statusurile</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="revision_required">Revision required</option>
          </select>

          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate orașele</option>
            {cityOptions.map((cityName) => (
              <option key={cityName} value={cityName}>{cityName}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span>{loading ? 'Se încarcă...' : `${filteredAthletes.length} sportivi afișați`}</span>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setClubFilter('all');
              setGradeFilter('all');
              setAgeGroupFilter('all');
              setStatusFilter('approved');
              setCityFilter('all');
            }}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            Resetează filtre
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Sportiv</th>
              <th className="px-4 py-3">Vârstă</th>
              <th className="px-4 py-3">Club</th>
              <th className="px-4 py-3">Grad</th>
              <th className="px-4 py-3">Profil</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && filteredAthletes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">Nu au fost găsiți sportivi.</td>
              </tr>
            )}
            {filteredAthletes.map((athlete) => {
              const age = getAge(athlete?.date_of_birth);
              return (
                <tr key={athlete.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {athlete.first_name} {athlete.last_name}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{age ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{athlete?.club?.name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{athlete?.current_grade?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/athletes/${athlete.id}`}
                      className="inline-flex rounded border border-blue-600 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Vezi profil
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
