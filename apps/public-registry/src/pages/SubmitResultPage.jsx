import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { categoryAPI, scoreAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Textarea } from '../components/ui';

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
    <section className="space-y-5">
      <Card className="registry-panel">
        <CardHeader>
        <Badge variant="outline" className="mb-2 w-fit"><Send className="mr-1.5 h-3.5 w-3.5" />Transmitere oficială</Badge>
        <CardTitle className="font-display text-2xl">Trimite rezultat nou</CardTitle>
        <CardDescription>
          Rezultatul este salvat cu status pending și devine public după validarea admin.
        </CardDescription>
        </CardHeader>
      </Card>

      <Card className="registry-panel"><CardContent className="pt-5">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span>Cont curent</span><Badge variant="secondary">{user?.email || 'necunoscut'}</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Label className="space-y-2">
            <span>Categorie</span>
            <Select
              value={form.category}
              onChange={onChange('category')}
              disabled={loadingCategories}
              required
            >
              <option value="">Selectează categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}{category?.competition_name ? ` - ${category.competition_name}` : ''}
                </option>
              ))}
            </Select>
          </Label>

          <Label className="space-y-2">
            <span>Tip</span>
            <Select
              value={form.type}
              onChange={onChange('type')}
            >
              <option value="solo">Individual (solo)</option>
              <option value="fight">Fight</option>
              <option value="teams">Echipă</option>
            </Select>
          </Label>

          <Label className="space-y-2">
            <span>Scor</span>
            <Input
              type="number"
              value={form.score}
              onChange={onChange('score')}
              placeholder="ex: 95"
            />
          </Label>

          <Label className="space-y-2">
            <span>Podium revendicat</span>
            <Select
              value={form.placement_claimed}
              onChange={onChange('placement_claimed')}
            >
              <option value="">Nespecificat</option>
              <option value="1st">Locul 1</option>
              <option value="2nd">Locul 2</option>
              <option value="3rd">Locul 3</option>
            </Select>
          </Label>

          <Label className="space-y-2 md:col-span-2">
            <span>Note</span>
            <Textarea
              value={form.notes}
              onChange={onChange('notes')}
              placeholder="ex: finală câștigată la puncte"
              rows={4}
            />
          </Label>
        </div>

        {selectedCategory && (
          <Alert>
            Categorie selectată: <span className="font-semibold">{selectedCategory.name}</span>
          </Alert>
        )}

        {error && <Alert variant="destructive">{error}</Alert>}
        {success && <Alert variant="success"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={submitting}
          >
            <Send className="h-4 w-4" />{submitting ? 'Se trimite...' : 'Trimite rezultat'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />Înapoi
          </Button>
        </div>
      </form>
      </CardContent></Card>
    </section>
  );
}
