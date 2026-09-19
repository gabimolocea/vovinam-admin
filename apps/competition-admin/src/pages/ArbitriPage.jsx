import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CentralizatorContext } from './CategoriesLayout';
import {
  competitionRefereeAPI, athleteAPI,
  categoryRefereeAssignmentAPI, matchRefereeAssignmentAPI,
  fieldAPI,
} from '@shared/lib/api';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  Input, Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui';
import { Plus, X } from 'lucide-react';

export default function ArbitriPage() {
  const ctx = useContext(CentralizatorContext);
  const { eventId } = ctx || {};

  const [rosterRefs, setRosterRefs] = useState([]);
  const [allReferees, setAllReferees] = useState([]);
  const [catRefAssignments, setCatRefAssignments] = useState([]);
  const [matchRefAssignments, setMatchRefAssignments] = useState([]);
  const [catAssignments, setCatAssignments] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);

  const normalizeList = useCallback((response) => {
    if (Array.isArray(response?.data)) return response.data;
    return response?.data?.results || [];
  }, []);

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [rosterRes, allRefsRes, catRefRes, matchRefRes, catAssRes, fieldsRes] = await Promise.all([
        competitionRefereeAPI.list({ event_id: eventId }),
        athleteAPI.list({ is_referee: true }),
        categoryRefereeAssignmentAPI.list({ event_id: eventId }),
        matchRefereeAssignmentAPI.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        fieldAPI.list({ event_id: eventId }),
      ]);
      setRosterRefs(normalizeList(rosterRes));
      setAllReferees(normalizeList(allRefsRes).filter(a => a.is_referee));
      setCatRefAssignments(normalizeList(catRefRes));
      setMatchRefAssignments(normalizeList(matchRefRes));
      setCatAssignments(normalizeList(catAssRes));
      setFields(normalizeList(fieldsRes).sort((a, b) => (a.field_number ?? 0) - (b.field_number ?? 0)));
    } catch (err) {
      console.error('Failed to load referee data', err);
    } finally {
      setLoading(false);
    }
  }, [eventId, normalizeList]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!ctx) return null;

  const formatGradeLabel = (value) => {
    if (!value) return '—';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      return value.name || value.label || value.title || '—';
    }
    return '—';
  };

  const rosterAthleteIds = new Set(rosterRefs.map(r => r.athlete));

  const availableRefs = useMemo(() => (
    allReferees
      .filter(a =>
        search === '' ||
        `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase().includes(search.toLowerCase()) ||
        (a.club_name || '').toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => `${a.last_name || ''} ${a.first_name || ''}`.localeCompare(`${b.last_name || ''} ${b.first_name || ''}`))
  ), [allReferees, search]);

  const getRefDetailedAssignments = (athleteId) => {
    const assignments = [];
    for (const a of catRefAssignments) {
      const slots = [];
      for (let i = 1; i <= 5; i++) {
        if (a[`referee_${i}`] === athleteId) slots.push(`A${i}`);
      }
      if (slots.length > 0) {
        const fieldAss = catAssignments.find(fa => fa.category === a.category);
        const field = fieldAss ? fields.find(f => f.id === fieldAss.field) : null;
        assignments.push({
          type: 'category',
          name: a.category_name || `Cat #${a.category}`,
          slots,
          fieldName: field?.name || null,
          fieldId: fieldAss?.field || null,
          order: fieldAss?.order ?? 999,
          duration: fieldAss?.estimated_duration || 15,
        });
      }
    }
    for (const a of matchRefAssignments) {
      const slots = [];
      for (let i = 1; i <= 5; i++) {
        if (a[`referee_${i}`] === athleteId) slots.push(`A${i}`);
      }
      if (slots.length > 0) {
        assignments.push({
          type: 'match',
          name: a.match_name || `Meci #${a.match}`,
          slots,
          fieldName: null,
          fieldId: null,
          order: 999,
          duration: 10,
        });
      }
    }
    return assignments;
  };

  const getRefConflicts = (athleteId) => {
    const assignments = getRefDetailedAssignments(athleteId);
    const byField = {};
    for (const a of assignments) {
      if (!a.fieldId) continue;
      if (!byField[a.fieldId]) byField[a.fieldId] = [];
      byField[a.fieldId].push(a);
    }

    const fieldTimelines = {};
    for (const [fieldId, items] of Object.entries(byField)) {
      const allFieldCatAssigns = catAssignments
        .filter(fa => fa.field === parseInt(fieldId))
        .sort((a, b) => a.order - b.order);

      let accumulated = 0;
      const timeMap = {};
      for (const fa of allFieldCatAssigns) {
        timeMap[fa.category] = { offset: accumulated, duration: fa.estimated_duration || 15 };
        accumulated += fa.estimated_duration || 15;
      }

      for (const item of items) {
        if (item.type === 'category') {
          const catAss = catRefAssignments.find(a => a.category_name === item.name);
          const catId = catAss?.category;
          const tm = catId ? timeMap[catId] : null;
          if (tm) {
            const field = fields.find(f => f.id === parseInt(fieldId));
            if (!fieldTimelines[fieldId]) fieldTimelines[fieldId] = [];
            fieldTimelines[fieldId].push({
              name: item.name,
              startOffset: tm.offset,
              endOffset: tm.offset + tm.duration,
              fieldName: field?.name || item.fieldName,
            });
          }
        }
      }
    }

    const conflicts = [];
    const fieldIds = Object.keys(fieldTimelines);
    for (let i = 0; i < fieldIds.length; i++) {
      for (let j = i + 1; j < fieldIds.length; j++) {
        for (const a of fieldTimelines[fieldIds[i]]) {
          for (const b of fieldTimelines[fieldIds[j]]) {
            if (a.startOffset < b.endOffset && b.startOffset < a.endOffset) {
              conflicts.push({ item1: `${a.name} (${a.fieldName})`, item2: `${b.name} (${b.fieldName})` });
            }
          }
        }
      }
    }
    return conflicts;
  };

  const addToRoster = async (athleteId) => {
    setBusy(true);
    try {
      await competitionRefereeAPI.create({ event: eventId, athlete: athleteId });
      await fetchData();
    } catch (err) { console.error(err); }
    finally {
      setBusy(false);
      setShowAddPicker(false);
      setSearch('');
    }
  };

  const removeFromRoster = async (id) => {
    setBusy(true);
    try {
      await competitionRefereeAPI.delete(id);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setBusy(false); }
  };

  const closeAddPicker = () => {
    setShowAddPicker(false);
    setSearch('');
  };

  const toggleRefPresence = async (athleteId) => {
    if (busy) return;

    const isAlreadyAdded = rosterAthleteIds.has(athleteId);
    setBusy(true);
    try {
      if (isAlreadyAdded) {
        const rosterEntry = rosterRefs.find(r => r.athlete === athleteId);
        if (rosterEntry?.id) {
          await competitionRefereeAPI.delete(rosterEntry.id);
        }
      } else {
        await competitionRefereeAPI.create({ event: eventId, athlete: athleteId });
      }
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const rosterRows = useMemo(() => (
    rosterRefs
      .map(entry => ({
        ...entry,
        assignments: getRefDetailedAssignments(entry.athlete),
        conflicts: getRefConflicts(entry.athlete),
      }))
      .sort((a, b) => (a.athlete_name || '').localeCompare(b.athlete_name || ''))
  ), [rosterRefs, catRefAssignments, matchRefAssignments, catAssignments, fields]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Se încarcă arbitrii...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-2">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Arbitri</h2>
          <p className="mt-1 text-xs text-muted-foreground">{rosterRows.length} arbitri participanți</p>
        </div>

        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px] text-center">Nr</TableHead>
              <TableHead>Arbitru</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>Grad</TableHead>
              <TableHead className="w-[110px] text-center">Conflicte</TableHead>
              <TableHead className="w-[120px] text-center">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rosterRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Nu există arbitri adăugați pentru această competiție.
                </TableCell>
              </TableRow>
            ) : (
              rosterRows.map((entry, index) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{entry.athlete_name || `Arbitru #${entry.athlete}`}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.club_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatGradeLabel(entry.grade || entry.current_grade)}</TableCell>
                  <TableCell className="text-center">
                    {entry.conflicts.length > 0 ? (
                      <Badge variant="destructive">{entry.conflicts.length}</Badge>
                    ) : (
                      <Badge variant="secondary">0</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => removeFromRoster(entry.id)}
                      disabled={busy}
                      title="Scoate arbitrul din competiție"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
            <TableRow>
              <TableCell colSpan={6} className="text-center">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddPicker(true)}>
                  <Plus className="h-4 w-4" />
                  Adaugă arbitru
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Dialog open={showAddPicker} onOpenChange={(open) => (open ? setShowAddPicker(true) : closeAddPicker())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adaugă arbitru</DialogTitle>
            <DialogDescription>Selectează unul dintre arbitrii disponibili</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută arbitru..."
            />

            <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card">
              {availableRefs.length === 0 ? (
                <div className="px-3 py-5 text-center text-sm text-muted-foreground">
                  {search ? 'Niciun arbitru găsit.' : 'Nu există arbitri disponibili.'}
                </div>
              ) : (
                availableRefs.map(ref => {
                  const isSelected = rosterAthleteIds.has(ref.id);
                  return (
                    <button
                      key={ref.id}
                      type="button"
                      onClick={() => toggleRefPresence(ref.id)}
                      disabled={busy}
                      className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left transition disabled:opacity-50 last:border-b-0 ${
                        isSelected ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20' : 'hover:bg-accent'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-bold ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-input bg-background text-transparent'
                        }`}>
                          ✓
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {`${ref.last_name || ''} ${ref.first_name || ''}`.trim() || ref.athlete_name || `Arbitru #${ref.id}`}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {(ref.club_name || 'fără club')} · {formatGradeLabel(ref.current_grade || ref.grade)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
