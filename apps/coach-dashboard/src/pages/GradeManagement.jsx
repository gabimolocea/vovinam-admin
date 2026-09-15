import { useEffect, useState } from 'react';
import { useAuth } from '@shared';
import { competitionAPI, gradeHistoryAPI, athleteAPI, gradeAPI, clubAPI } from '@shared/lib/api';
import {
  Alert, Badge, Button, Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, EmptyState, Input, Label, Req, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, Skeleton,
} from '../components/ui';
import { Calendar, MapPin, Plus } from 'lucide-react';

function fmtDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(value).slice(0, 10);
  }
}

function normalizeList(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function CreateExamDialog({ open, onOpenChange, clubName, onCreated }) {
  const [form, setForm] = useState({ start_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Title has no free-text field: it's always derived from the club and
  // exam date, e.g. "Examen Club Phuong - 23 martie 2026".
  const title = form.start_date
    ? `Examen ${clubName || 'club'} - ${new Date(form.start_date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `Examen ${clubName || 'club'}`;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { title, start_date: form.start_date, end_date: form.start_date };
      const res = await competitionAPI.createExam(payload);
      onCreated(res.data);
      setForm({ start_date: '' });
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut crea examenul.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Examen nou</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Titlu (generat automat)</Label>
            <Input value={title} disabled readOnly />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="exam_start">Data<Req /></Label>
            <Input id="exam_start" type="date" required value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Se creează…' : 'Creează examenul'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddGradeResultDialog({ open, onOpenChange, exams, athletes, grades, onCreated }) {
  const [form, setForm] = useState({ athlete: '', event: '', grade: '', obtained_date: '', level: 'good' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await gradeHistoryAPI.submissions.create({
        athlete: form.athlete,
        event: form.event,
        grade: form.grade,
        obtained_date: form.obtained_date,
        level: form.level,
      });
      onCreated();
      setForm({ athlete: '', event: '', grade: '', obtained_date: '', level: 'good' });
      onOpenChange(false);
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setError((Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut înregistra rezultatul.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Înregistrează rezultat examen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-col gap-1">
            <Label>Sportiv<Req /></Label>
            <Select value={form.athlete} onValueChange={(v) => update('athlete', v)}>
              <SelectTrigger><SelectValue placeholder="Alege sportivul" /></SelectTrigger>
              <SelectContent>
                {athletes.map((a) => <SelectItem key={a.id} value={String(a.id)}>{`${a.last_name || ''} ${a.first_name || ''}`.trim()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Examen<Req /></Label>
            <Select value={form.event} onValueChange={(v) => update('event', v)}>
              <SelectTrigger><SelectValue placeholder="Alege examenul" /></SelectTrigger>
              <SelectContent>
                {exams.map((ev) => <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Grad obținut<Req /></Label>
            <Select value={form.grade} onValueChange={(v) => update('grade', v)}>
              <SelectTrigger><SelectValue placeholder="Alege gradul" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="result_date">Data obținerii<Req /></Label>
              <Input id="result_date" type="date" required value={form.obtained_date} onChange={(e) => update('obtained_date', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Nivel</Label>
              <Select value={form.level} onValueChange={(v) => update('level', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Bine</SelectItem>
                  <SelectItem value="bad">Slab</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Înregistrează'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GradeManagement() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [grades, setGrades] = useState([]);
  const [clubName, setClubName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [addResultOpen, setAddResultOpen] = useState(false);

  useEffect(() => {
    const clubId = user?.athlete?.club;
    if (!clubId) return;
    clubAPI.get(clubId).then((r) => setClubName(r.data?.name || '')).catch(() => {});
  }, [user?.athlete?.club]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [examsRes, athletesRes, gradesRes] = await Promise.all([
        competitionAPI.list({ event_type: 'examination' }),
        athleteAPI.list({ my_club: true }).catch(() => ({ data: [] })),
        gradeAPI.list().catch(() => ({ data: [] })),
      ]);
      setExams(normalizeList(examsRes.data));
      setAthletes(normalizeList(athletesRes.data));
      setGrades(normalizeList(gradesRes.data));
    } catch {
      setError('Nu am putut încărca examenele.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = exams.filter((ev) => (ev.end_date || ev.start_date || '') >= today);
  const past = exams.filter((ev) => (ev.end_date || ev.start_date || '') < today);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Examene</h1>
          <p className="text-sm text-muted-foreground">Examenele de grad ale clubului tău</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddResultOpen(true)}>Înregistrează rezultat</Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Examen nou
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {exams.length === 0 ? (
        <EmptyState title="Fără examene" message="Nu există examene create momentan." />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examene viitoare ({upcoming.length})</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border p-4">
                    <p className="font-medium">{ev.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {ev.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(ev.start_date)}</span>}
                      {ev.place && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.place}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examene încheiate ({past.length})</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {past.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border p-4 opacity-70">
                    <p className="font-medium">{ev.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {ev.start_date && <Badge variant="outline">{fmtDate(ev.start_date)}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <CreateExamDialog open={createOpen} onOpenChange={setCreateOpen} clubName={clubName} onCreated={(ev) => setExams((prev) => [ev, ...prev])} />
      <AddGradeResultDialog open={addResultOpen} onOpenChange={setAddResultOpen} exams={exams} athletes={athletes} grades={grades} onCreated={load} />
    </div>
  );
}
