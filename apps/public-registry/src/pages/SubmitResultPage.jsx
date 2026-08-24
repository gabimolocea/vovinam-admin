import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoryAPI, scoreAPI } from '@shared/lib/api';
import { useAuth } from '@shared';

const EMPTY_FORM = {
  category: '',
  type: 'solo',
  score: '',
  placement_claimed: '',
  notes: '',
};

export default function SubmitResultPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function fetchCategories() {
      setLoadingCategories(true);
      setError('');
      try {
        const response = await categoryAPI.list();
        if (!isMounted) return;
        setCategories(Array.isArray(response?.data) ? response.data : []);
      } catch (err) {
        if (!isMounted) return;
        const message = err?.response?.data?.detail || err?.message || 'Nu s-au putut încărca categoriile.';
        setError(message);
      } finally {
        if (isMounted) setLoadingCategories(false);
      }
    }

    fetchCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === String(form.category)),
    [categories, form.category],
  );

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.category) {
      setError('Selectează o categorie.');
      return;
    }

    const payload = {
      category: Number(form.category),
      type: form.type,
      score: form.score !== '' ? Number(form.score) : null,
      placement_claimed: form.placement_claimed || null,
      notes: form.notes || null,
    };

    setSubmitting(true);
    try {
      await scoreAPI.create(payload);
      setSuccess('Rezultatul a fost trimis și este în așteptarea validării de către admin.');
      setForm(EMPTY_FORM);
    } catch (err) {
      const fallback = 'Nu am putut trimite rezultatul. Verifică datele și încearcă din nou.';
      const message = err?.response?.data?.detail || err?.response?.data?.error || fallback;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="text-xl font-black text-gray-900">Trimite rezultat nou</h1>
        <p className="mt-1 text-sm text-gray-600">
          Rezultatul este salvat cu status pending și devine public după validarea admin.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          Cont curent: <span className="font-semibold">{user?.email || 'necunoscut'}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Categorie</span>
            <select
              value={form.category}
              onChange={onChange('category')}
              disabled={loadingCategories}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
              required
            >
              <option value="">Selectează categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}{category?.competition_name ? ` - ${category.competition_name}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Tip</span>
            <select
              value={form.type}
              onChange={onChange('type')}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
            >
              <option value="solo">Individual (solo)</option>
              <option value="fight">Fight</option>
              <option value="teams">Echipă</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Scor</span>
            <input
              type="number"
              value={form.score}
              onChange={onChange('score')}
              placeholder="ex: 95"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Podium revendicat</span>
            <select
              value={form.placement_claimed}
              onChange={onChange('placement_claimed')}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
            >
              <option value="">Nespecificat</option>
              <option value="1st">Locul 1</option>
              <option value="2nd">Locul 2</option>
              <option value="3rd">Locul 3</option>
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-semibold text-gray-700">Note</span>
            <textarea
              value={form.notes}
              onChange={onChange('notes')}
              placeholder="ex: finală câștigată la puncte"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
              rows={4}
            />
          </label>
        </div>

        {selectedCategory && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Categorie selectată: <span className="font-semibold">{selectedCategory.name}</span>
          </div>
        )}

        {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Se trimite...' : 'Trimite rezultat'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Înapoi
          </button>
        </div>
      </form>
    </section>
  );
}
