import { useEffect, useState } from 'react';
import { cityAPI, competitionAPI } from '@shared/lib/api';
import {
  Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, Label, Req, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, Switch, Textarea,
} from './ui';

const EVENT_TYPES = [
  ['competition', 'Competiție'],
  ['examination', 'Examen de grad'],
  ['training_seminar', 'Seminar'],
];

const EMPTY = {
  name: '',
  event_type: 'competition',
  start_date: '',
  end_date: '',
  city: '',
  address: '',
  coach_registration_deadline: '',
  description: '',
  is_publicly_visible: true,
};

// Serverul intoarce erorile pe campuri, {camp: ["mesaj"]}, si separat un
// 403 cu explicatie cand esti pe masina din sala. Le aratam diferit:
// primele langa campul lor, a doua sus, fiindca nu e o greseala de
// completare si nu se repara reformuland.
function readErrors(err) {
  const data = err?.response?.data;
  if (!data) return { general: err?.message || 'Nu am putut salva.', fields: {} };
  if (typeof data === 'string') return { general: data, fields: {} };
  if (data.error) return { general: data.error, fields: {} };

  const fields = {};
  let general = null;
  for (const [key, value] of Object.entries(data)) {
    const text = Array.isArray(value) ? value.join(' ') : String(value);
    if (key === 'detail' || key === 'non_field_errors') general = text;
    else fields[key] = text;
  }
  return { general, fields };
}

export default function CreateCompetitionDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [cities, setCities] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({ general: null, fields: {} });

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setErrors({ general: null, fields: {} });
    cityAPI.list()
      .then(res => setCities(Array.isArray(res.data) ? res.data : res.data.results ?? []))
      .catch(() => setCities([]));
  }, [open]);

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, fields: { ...prev.fields, [key]: undefined } }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({ general: null, fields: {} });
    try {
      const payload = {
        ...form,
        city: form.city || null,
        end_date: form.end_date || form.start_date,
        coach_registration_deadline: form.coach_registration_deadline || null,
      };
      const { data } = await competitionAPI.create(payload);
      onOpenChange(false);
      onCreated?.(data);
    } catch (err) {
      setErrors(readErrors(err));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (key) => errors.fields[key];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Competiție nouă</DialogTitle>
          <DialogDescription>
            Grupele și categoriile standard se pot genera după, din centralizator.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {errors.general && <Alert variant="destructive">{errors.general}</Alert>}

          <div className="flex flex-col gap-1">
            <Label htmlFor="ev-name">Denumire<Req /></Label>
            <Input
              id="ev-name" value={form.name} autoFocus
              onChange={e => update('name', e.target.value)}
              placeholder="Campionatul Național 2027"
            />
            {fieldError('name') && <p className="text-xs text-destructive">{fieldError('name')}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Label>Tip</Label>
            <Select value={form.event_type} onValueChange={v => update('event_type', v)}>
              <SelectTrigger aria-label="Tip eveniment"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ev-start">Începe<Req /></Label>
              <Input
                id="ev-start" type="date" value={form.start_date}
                onChange={e => update('start_date', e.target.value)}
              />
              {fieldError('start_date') && <p className="text-xs text-destructive">{fieldError('start_date')}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ev-end">Se încheie</Label>
              <Input
                id="ev-end" type="date" value={form.end_date} min={form.start_date || undefined}
                onChange={e => update('end_date', e.target.value)}
              />
              {/* Lasat gol inseamna o singura zi - serverul foloseste data de inceput. */}
              <p className="text-xs text-muted-foreground">Gol = eveniment de o zi</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>Oraș</Label>
              <Select value={form.city} onValueChange={v => update('city', v)}>
                <SelectTrigger aria-label="Oraș"><SelectValue placeholder="Alege orașul" /></SelectTrigger>
                <SelectContent>
                  {cities.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {fieldError('city') && <p className="text-xs text-destructive">{fieldError('city')}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ev-address">Adresă</Label>
              <Input
                id="ev-address" value={form.address}
                onChange={e => update('address', e.target.value)}
                placeholder="Sala Polivalentă"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="ev-deadline">Termen înscrieri antrenori</Label>
            <Input
              id="ev-deadline" type="date" value={form.coach_registration_deadline}
              onChange={e => update('coach_registration_deadline', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Gol = până în ziua competiției</p>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="ev-desc">Descriere</Label>
            <Textarea
              id="ev-desc" rows={3} value={form.description}
              onChange={e => update('description', e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 rounded-md border border-input p-3">
            <Switch
              checked={form.is_publicly_visible}
              onCheckedChange={v => update('is_publicly_visible', v)}
            />
            <span className="text-sm">
              <b>Vizibilă public</b>
              <span className="block text-xs text-muted-foreground">
                Apare pe site și în lista antrenorilor. Stinge-o dacă o pregătești din timp.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Renunță
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.start_date}>
              {saving ? 'Se creează...' : 'Creează'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
