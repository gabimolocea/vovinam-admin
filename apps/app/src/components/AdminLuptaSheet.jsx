import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { enrollmentAPI } from '@shared/lib/api';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui';
import { GENDER_LABELS, parseWeightBound, suggestCategory, findMatchingGroups } from '../lib/centralizator';

/**
 * "Lupta" sheet: a flat pre-registration (Etapa 1) list of every fight-
 * category enrollee, independent of club - matches apps/competition-
 * admin's LuptaPage pre-registration table, ported as a read/adjust view:
 * submit the officially-weighed-in weight, see the weight-bracket category
 * it suggests, and reassign into it.
 *
 * Shared between admin and coach: weight/reassignment is an operational
 * task, so a coach only ever sees it as editable for their own club's
 * rows (never another club's, regardless of the deadline) - and, like the
 * matrix, other clubs' rows are hidden entirely from a coach until the
 * registration deadline passes.
 */

/** Clickable column header - toggles direction if already the active sort
 * column, otherwise switches to it ascending. Matches a spreadsheet's own
 * click-the-column-to-sort convention instead of separate sort buttons. */
function SortableHeader({ label, sortKey, sortBy, sortDir, onSort }) {
  const active = sortBy === sortKey;
  return (
    <th className="border border-sidebar-border p-0 text-left text-[11px] font-bold uppercase tracking-wide">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-pressed={active}
        className={`flex w-full items-center gap-1 px-2 py-1.5 transition-colors hover:bg-accent ${active ? 'text-foreground' : 'text-foreground/90'}`}
      >
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );
}

function ageLabel(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return `${years} ani${months > 0 ? ` ${months} luni` : ''}`;
}

function LuptaRow({ ctx, row, catsInGroupGender, readOnly }) {
  const [weightValue, setWeightValue] = useState(row.weight != null ? String(row.weight) : '');
  const [busyRow, setBusyRow] = useState(false);
  const isAdminUser = ctx.myClubId == null;

  const suggested = useMemo(() => suggestCategory(parseFloat(weightValue), catsInGroupGender), [weightValue, catsInGroupGender]);

  if (readOnly) {
    return (
      <tr className="border-b border-sidebar-border transition-colors hover:bg-accent/40">
        <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap">{row.group?.name || '—'}</td>
        <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap">{GENDER_LABELS[row.gender] || row.gender}</td>
        <td className="border border-sidebar-border px-2 py-1.5">
          <span className="font-medium">{row.name}</span>
          <span className="ml-1 text-muted-foreground">({row.club})</span>
        </td>
        <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap text-muted-foreground">{ageLabel(row.dob)}</td>
        <td className="border border-sidebar-border px-2 py-1.5 text-muted-foreground">{row.weight != null ? `${row.weight} kg` : '—'}</td>
        <td className="border border-sidebar-border px-2 py-1.5" />
      </tr>
    );
  }

  // No manual reassignment here for anyone - weight is the only input:
  // if it suggests a different bracket than the athlete is currently in,
  // move them there automatically in the same save (matching how adding
  // a sportiv works - weight alone decides the category). Reassigning
  // outside of what weight suggests is an admin task done elsewhere, not
  // through this sheet.
  const saveWeight = async () => {
    const original = row.weight != null ? String(row.weight) : '';
    if (weightValue === original) return;
    setBusyRow(true);
    try {
      const payload = { weight: weightValue || null };
      if (weightValue) {
        const newSuggested = suggestCategory(parseFloat(weightValue), catsInGroupGender);
        if (newSuggested && newSuggested.id !== row.currentCat.id) payload.category = newSuggested.id;
      }
      await enrollmentAPI.categoryAthletes.update(row.enrollmentId, payload);
      await ctx.fetchAll();
    } finally {
      setBusyRow(false);
    }
  };

  const handleRemove = (e) => {
    ctx.handleUnenroll(row.enrollmentId, row.name, row.currentCat.name, e, { groupName: row.group?.name, weight: row.weight });
  };

  return (
    <tr className="border-b border-sidebar-border transition-colors hover:bg-accent/40">
      <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap">{row.group?.name || '—'}</td>
      <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap">{GENDER_LABELS[row.gender] || row.gender}</td>
      <td className="border border-sidebar-border px-2 py-1.5">
        <span className="font-medium">{row.name}</span>
        {/* Every editable row is either the viewer's own club (coach) or
            any club (admin) - only name the club when it isn't obviously
            the viewer's own, so a coach's own roster doesn't repeat their
            club name on every single line. */}
        {row.clubId !== ctx.myClubId && <span className="ml-1 text-muted-foreground">({row.club})</span>}
      </td>
      <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap text-muted-foreground">{ageLabel(row.dob)}</td>
      <td className="border border-sidebar-border px-2 py-1.5">
        <Input
          type="number"
          step="0.1"
          min="0"
          max="200"
          value={weightValue}
          onChange={(e) => setWeightValue(e.target.value)}
          onBlur={saveWeight}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          disabled={busyRow}
          placeholder="kg"
          className="h-7 w-20 text-xs"
        />
      </td>
      {isAdminUser && <td className="border border-sidebar-border px-2 py-1.5 whitespace-nowrap">{suggested ? suggested.name : '—'}</td>}
      <td className="border border-sidebar-border px-2 py-1.5">
        <button
          type="button"
          onClick={handleRemove}
          disabled={busyRow}
          aria-label={`Scoate ${row.name} din categorie`}
          title="Scoate din categorie"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

/** Coach-only add flow: no Grupă/Gen picker needed - the athlete's own
 * date of birth and gender (already on their profile) determine those
 * automatically, exactly like the backend would classify them; the coach
 * only picks who and enters their weight, which also picks the actual
 * weight-bracket category directly (no "lightest bracket, fix it after"
 * step, unlike the admin flow below - weight is known up front here). */
function CoachAddAthlete({ ctx, groupById, catsByGroupGender }) {
  const [open, setOpen] = useState(false);
  const [athleteId, setAthleteId] = useState('');
  const [weightValue, setWeightValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const athletes = ctx.clubAthleteCache[ctx.myClubId] || [];

  const openDialog = async () => {
    setError('');
    await ctx.ensureClubAthletes(ctx.myClubId);
    setOpen(true);
  };

  const handleSubmit = async () => {
    setError('');
    const athlete = athletes.find((a) => String(a.id) === athleteId);
    if (!athlete) { setError('Alege un sportiv.'); return; }
    const weight = parseFloat(weightValue);
    if (!weightValue || Number.isNaN(weight)) { setError('Introdu greutatea.'); return; }

    if (!athlete.gender) { setError('Sportivul nu are genul completat în profil.'); return; }

    // More than one group can match the same age (e.g. two open-ended
    // "Seniors" sub-groups) - try each in turn and use the first that
    // actually has fight categories for this gender, rather than assuming
    // the first age-match is always the right one.
    const candidateGroups = findMatchingGroups(athlete.date_of_birth, Object.values(groupById));
    if (candidateGroups.length === 0) { setError('Nu am găsit o grupă de vârstă pentru acest sportiv - contactează administratorul.'); return; }

    let targetCat = null;
    for (const candidate of candidateGroups) {
      const catsInGroupGender = catsByGroupGender[`${candidate.id}-${athlete.gender}`] || [];
      const cat = suggestCategory(weight, catsInGroupGender) || catsInGroupGender[catsInGroupGender.length - 1];
      if (cat) { targetCat = cat; break; }
    }
    if (!targetCat) {
      setError(`Nu există categorii de luptă pentru grupa de vârstă a sportivului (${candidateGroups.map((g) => g.name).join(' / ')}) · ${GENDER_LABELS[athlete.gender] || athlete.gender} - contactează administratorul.`);
      return;
    }

    setBusy(true);
    try {
      await enrollmentAPI.categoryAthletes.create({ athlete: athlete.id, category: targetCat.id, weight: weightValue });
      await ctx.fetchAll();
      setOpen(false);
      setAthleteId('');
      setWeightValue('');
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'A apărut o eroare la înscriere.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={openDialog} disabled={ctx.isCoachDeadlinePassed}>
        <Plus className="h-3.5 w-3.5" /> Adaugă sportiv
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă sportiv la luptă</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Select value={athleteId} onValueChange={setAthleteId}>
              <SelectTrigger aria-label="Sportiv">
                <SelectValue placeholder="Alege sportivul" />
              </SelectTrigger>
              <SelectContent>
                {athletes.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{`${a.last_name || ''} ${a.first_name || ''}`.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="200"
              placeholder="Greutate (kg)"
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value)}
              aria-label="Greutate"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Anulează</Button>
            <Button onClick={handleSubmit} disabled={busy}>Adaugă</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Admin-only add flow: unlike a coach's own club, admin picks from any
 * club, so Grupă+Gen are picked manually here (via the same club-picker →
 * athlete-list → weight-modal flow the matrix's own "+" buttons trigger,
 * ctx.handleCellClick) - enrolls into the lightest bracket in that group/
 * gender; entering a weight on the resulting row then moves them into the
 * bracket it actually suggests (see LuptaRow's saveWeight). */
function AdminAddAthlete({ ctx, groupGenderOptions }) {
  const [selectedKey, setSelectedKey] = useState('');

  const handleAdd = (e) => {
    const opt = groupGenderOptions.find((o) => o.key === selectedKey);
    if (!opt) return;
    ctx.handleCellClick(ctx.myClubId, opt.catId, e);
  };

  if (groupGenderOptions.length === 0) return null;

  return (
    <>
      <Select value={selectedKey} onValueChange={setSelectedKey}>
        <SelectTrigger aria-label="Grupă și gen pentru sportivul nou" className="h-7 w-56 text-xs">
          <SelectValue placeholder="Alege grupă și gen" />
        </SelectTrigger>
        <SelectContent>
          {groupGenderOptions.map((o) => (
            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleAdd} disabled={!selectedKey}>
        <Plus className="h-3.5 w-3.5" /> Adaugă sportiv
      </Button>
    </>
  );
}

function AddAthleteBar({ ctx, groupGenderOptions, groupById, catsByGroupGender }) {
  const isAdminUser = ctx.myClubId == null;

  if (!isAdminUser) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-sidebar-border bg-muted/40 px-2 py-1.5">
        <CoachAddAthlete ctx={ctx} groupById={groupById} catsByGroupGender={catsByGroupGender} />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-sidebar-border bg-muted/40 px-2 py-1.5">
      <AdminAddAthlete ctx={ctx} groupGenderOptions={groupGenderOptions} />
    </div>
  );
}

export default function AdminLuptaSheet({ ctx }) {
  const { categories, groups, myClubId, isCoachDeadlinePassed } = ctx;
  const isAdminUser = myClubId == null;
  const canSeeAllClubs = isAdminUser || isCoachDeadlinePassed;
  const [sortBy, setSortBy] = useState('grupa');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (key === sortBy) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const fightCats = useMemo(() => categories.filter((c) => c.type === 'fight'), [categories]);

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const catsByGroupGender = useMemo(() => {
    const map = {};
    for (const cat of fightCats) {
      const key = `${cat.group}-${cat.gender}`;
      if (!map[key]) map[key] = [];
      map[key].push(cat);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const ba = parseWeightBound(a.name);
        const bb = parseWeightBound(b.name);
        const va = ba ? (ba.sign === '+' ? Infinity : ba.value) : Infinity;
        const vb = bb ? (bb.sign === '+' ? Infinity : bb.value) : Infinity;
        return va - vb;
      });
    }
    return map;
  }, [fightCats]);

  const groupGenderOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    for (const cat of fightCats) {
      const key = `${cat.group}-${cat.gender}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const catsInThis = catsByGroupGender[key] || [cat];
      const group = groupById[cat.group];
      opts.push({
        key,
        catId: catsInThis[0].id,
        label: `${group?.name || 'Grupă'} · ${GENDER_LABELS[cat.gender] || cat.gender}`,
      });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [fightCats, catsByGroupGender, groupById]);

  const rows = useMemo(() => {
    const list = [];
    for (const cat of fightCats) {
      for (const entry of cat.enrolled_athletes || []) {
        const a = entry.athlete_details;
        list.push({
          enrollmentId: entry.id,
          name: `${a?.last_name || ''} ${a?.first_name || ''}`.trim(),
          club: a?.club?.name || '—',
          clubId: a?.club?.id ?? a?.club ?? null,
          dob: a?.date_of_birth,
          group: groupById[cat.group],
          gender: cat.gender,
          currentCat: cat,
          weight: entry.weight,
        });
      }
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === 'gen') {
        const ga = GENDER_LABELS[a.gender] || a.gender || '';
        const gb = GENDER_LABELS[b.gender] || b.gender || '';
        return dir * (ga.localeCompare(gb) || a.name.localeCompare(b.name));
      }
      if (sortBy === 'sportiv') {
        return dir * (a.name.localeCompare(b.name) || a.club.localeCompare(b.club));
      }
      // grupa (default)
      const ga = a.group?.id ?? 0;
      const gb = b.group?.id ?? 0;
      if (ga !== gb) return dir * (ga - gb);
      return dir * (a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
    });
    return list;
  }, [fightCats, groupById, sortBy, sortDir]);

  // Other clubs' fight enrollees stay hidden from a coach until the
  // registration deadline passes - same rule as the matrix.
  const visibleRows = canSeeAllClubs ? rows : rows.filter((r) => r.clubId === myClubId);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <AddAthleteBar ctx={ctx} groupGenderOptions={groupGenderOptions} groupById={groupById} catsByGroupGender={catsByGroupGender} />
      {visibleRows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm italic text-muted-foreground">
          Niciun sportiv înscris la probele de luptă.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <SortableHeader label="Grupă" sortKey="grupa" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Gen" sortKey="gen" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label={isAdminUser ? 'Sportiv · club' : 'Sportiv'} sortKey="sportiv" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="border border-sidebar-border px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide">Vârstă</th>
                <th className="border border-sidebar-border px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide">Greutate</th>
                {isAdminUser && <th className="border border-sidebar-border px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide">Categorie sugerată</th>}
                <th className="border border-sidebar-border px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <LuptaRow
                  key={row.enrollmentId}
                  ctx={ctx}
                  row={row}
                  readOnly={!isAdminUser && row.clubId !== myClubId}
                  catsInGroupGender={catsByGroupGender[`${row.currentCat.group}-${row.gender}`] || [row.currentCat]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
