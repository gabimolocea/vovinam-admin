import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CentralizatorContext } from './CategoriesLayout';
import {
  competitionRefereeAPI, athleteAPI,
  categoryRefereeAssignmentAPI, matchRefereeAssignmentAPI,
  fieldAPI,
} from '@shared/lib/api';

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
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
        Se încarcă arbitrii...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-2">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Arbitri</h2>
          <p className="mt-1 text-xs text-gray-500">{rosterRows.length} arbitri participanți</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-black bg-yellow-300 px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-gray-900 w-[56px]">Nr</th>
                <th className="border border-black bg-yellow-300 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-gray-900">Arbitru</th>
                <th className="border border-black bg-yellow-300 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-gray-900">Club</th>
                <th className="border border-black bg-yellow-300 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-gray-900">Grad</th>
                <th className="border border-black bg-yellow-300 px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-gray-900 w-[110px]">Conflicte</th>
                <th className="border border-black bg-yellow-300 px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-gray-900 w-[120px]">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {rosterRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-black/20 px-3 py-6 text-center text-sm text-gray-400">
                    Nu există arbitri adăugați pentru această competiție.
                  </td>
                </tr>
              ) : (
                rosterRows.map((entry, index) => {
                  return (
                    <tr key={entry.id}>
                      <td className="border border-black/20 bg-gray-50 px-2 py-1.5 text-center text-xs text-gray-500">{index + 1}</td>
                      <td className="border border-black/20 px-2 py-1.5 text-sm font-medium text-gray-900">{entry.athlete_name || `Arbitru #${entry.athlete}`}</td>
                      <td className="border border-black/20 px-2 py-1.5 text-sm text-gray-600">{entry.club_name || '—'}</td>
                      <td className="border border-black/20 px-2 py-1.5 text-sm text-gray-600">{formatGradeLabel(entry.grade || entry.current_grade)}</td>
                      <td className="border border-black/20 px-2 py-1.5 text-center text-sm">
                        {entry.conflicts.length > 0 ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            {entry.conflicts.length}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">0</span>
                        )}
                      </td>
                      <td className="border border-black/20 px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromRoster(entry.id)}
                          disabled={busy}
                          className="inline-flex h-11 w-11 items-center justify-center border border-red-700 bg-red-500 text-base font-black leading-none text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                          title="Scoate arbitrul din competiție"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
              <tr>
                <td className="border border-black/20 bg-gray-50 px-2 py-1.5 text-center text-xs text-gray-500"></td>
                <td
                  colSpan={4}
                  onClick={() => setShowAddPicker(true)}
                  className="border border-black/20 px-2 py-1.5 text-sm text-gray-600 cursor-pointer hover:bg-green-50 transition-colors"
                >
                  <span className="frvv-btn-add !px-3 !py-1 text-xs">
                    <span className="frvv-btn-add-icon">+</span>
                    <span>Adaugă arbitru</span>
                  </span>
                </td>
                <td className="border border-black/20 px-2 py-1.5 text-center"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showAddPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeAddPicker}>
          <div className="w-full max-w-lg overflow-hidden border-2 border-black bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative border-b-2 border-black bg-yellow-300 px-5 py-4">
              <div className="pr-10">
                <h3 className="text-xl font-black text-gray-900">Adaugă arbitru</h3>
                <p className="mt-1 text-sm text-gray-700">Selectează unul dintre arbitrii disponibili</p>
              </div>
              <button
                type="button"
                onClick={closeAddPicker}
                className="absolute right-3 top-3 border border-black bg-white px-2 py-1 text-sm font-bold text-gray-800 hover:bg-yellow-100"
                aria-label="Închide popup arbitri"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 bg-white p-5">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută arbitru..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />

              <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {availableRefs.length === 0 ? (
                  <div className="px-3 py-5 text-center text-sm text-gray-400">
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
                        className={`flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition disabled:opacity-50 last:border-b-0 ${
                          isSelected ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-yellow-50'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`inline-flex h-6 w-6 items-center justify-center border text-sm font-bold ${
                            isSelected
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-gray-300 bg-white text-transparent'
                          }`}>
                            ✓
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {`${ref.last_name || ''} ${ref.first_name || ''}`.trim() || ref.athlete_name || `Arbitru #${ref.id}`}
                            </p>
                            <p className="truncate text-[11px] text-gray-500">
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

          </div>
        </div>
      )}
    </div>
  );
}
