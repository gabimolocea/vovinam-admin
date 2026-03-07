import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  const [expandedRef, setExpandedRef] = useState(null);
  const pickerRef = useRef(null);

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
      setRosterRefs(rosterRes.data?.results || rosterRes.data || []);
      setAllReferees((allRefsRes.data?.results || allRefsRes.data || []).filter(a => a.is_referee));
      setCatRefAssignments(catRefRes.data?.results || catRefRes.data || []);
      setMatchRefAssignments(matchRefRes.data?.results || matchRefRes.data || []);
      setCatAssignments(catAssRes.data?.results || catAssRes.data || []);
      setFields((fieldsRes.data?.results || fieldsRes.data || []).sort((a, b) => a.field_number - b.field_number));
    } catch (err) {
      console.error('Failed to load referee data', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowAddPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!ctx) return null;

  const rosterAthleteIds = new Set(rosterRefs.map(r => r.athlete));

  const availableRefs = allReferees.filter(a =>
    !rosterAthleteIds.has(a.id) &&
    (search === '' ||
      `${a.last_name} ${a.first_name}`.toLowerCase().includes(search.toLowerCase()) ||
      (a.club_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const getRefAssignmentCount = (athleteId) => {
    let count = 0;
    for (const a of catRefAssignments) {
      for (let i = 1; i <= 5; i++) {
        if (a[`referee_${i}`] === athleteId) count++;
      }
    }
    for (const a of matchRefAssignments) {
      for (let i = 1; i <= 5; i++) {
        if (a[`referee_${i}`] === athleteId) count++;
      }
    }
    return count;
  };

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
      const res = await competitionRefereeAPI.create({ event: eventId, athlete: athleteId });
      setRosterRefs(prev => [...prev, res.data]);
    } catch (err) { console.error(err); }
    setBusy(false);
    setShowAddPicker(false);
    setSearch('');
  };

  const removeFromRoster = async (id) => {
    setBusy(true);
    try {
      await competitionRefereeAPI.delete(id);
      setRosterRefs(prev => prev.filter(r => r.id !== id));
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
        Se încarcă arbitrii...
      </div>
    );
  }

  const RefereeCard = ({ entry }) => {
    const assignCount = getRefAssignmentCount(entry.athlete);
    const conflicts = getRefConflicts(entry.athlete);
    const isExpanded = expandedRef === entry.athlete;
    const detailedAssignments = isExpanded ? getRefDetailedAssignments(entry.athlete) : [];

    return (
      <div className={`rounded-xl border bg-white shadow-sm hover:shadow-md transition-all ${
        conflicts.length > 0 ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
      }`}>
        <div className="p-3 cursor-pointer" onClick={() => setExpandedRef(isExpanded ? null : entry.athlete)}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700">
                  ⚖️ Arbitru
                </span>
                {conflicts.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">
                    ⚠ {conflicts.length} conflict{conflicts.length > 1 ? 'e' : ''}
                  </span>
                )}
                {assignCount > 0 && (
                  <span className="text-[10px] text-gray-400">{assignCount} asignări</span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-1">{entry.athlete_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {entry.club_name && <span className="text-[10px] text-gray-500">🏫 {entry.club_name}</span>}
                {entry.grade && <span className="text-[10px] text-gray-400">🥋 {entry.grade}</span>}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeFromRoster(entry.id); }}
              disabled={busy}
              className="w-6 h-6 rounded-full bg-red-50 text-red-400 text-xs hover:bg-red-500 hover:text-white transition disabled:opacity-40 flex items-center justify-center shrink-0"
              title="Scoate din roster"
            >×</button>
          </div>

          {conflicts.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {conflicts.map((c, i) => (
                <p key={i} className="text-[9px] text-red-600 bg-red-50 rounded px-2 py-0.5">
                  ⚠ Suprapunere: {c.item1} ↔ {c.item2}
                </p>
              ))}
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/50">
            {detailedAssignments.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic">Nicio asignare încă</p>
            ) : (
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1">Asignări</p>
                {detailedAssignments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className={`rounded px-1 py-0.5 text-[8px] font-bold ${
                      a.type === 'category' ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {a.type === 'category' ? 'CAT' : 'MECI'}
                    </span>
                    <span className="font-medium text-gray-700 truncate flex-1">{a.name}</span>
                    <span className="text-gray-400 shrink-0">{a.slots.join(', ')}</span>
                    {a.fieldName && (
                      <span className="text-[9px] text-blue-500 bg-blue-50 rounded px-1 py-0.5 shrink-0">{a.fieldName}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-100">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-300 bg-white px-3 py-2 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-bold text-gray-900">⚖️ Arbitri Competiție</h2>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {rosterRefs.length} arbitri
          </span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowAddPicker(!showAddPicker)}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-blue-700 transition shadow-sm"
          >+ Adaugă arbitru</button>

          {showAddPicker && (
            <div ref={pickerRef} className="absolute right-0 top-full mt-1 w-72 max-h-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 flex flex-col">
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text" autoFocus placeholder="Caută arbitru..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {availableRefs.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-3 text-center">
                    {search ? 'Niciun rezultat' : 'Toți arbitrii sunt în roster'}
                  </p>
                ) : (
                  availableRefs.slice(0, 30).map(ref => (
                    <button key={ref.id} onClick={() => addToRoster(ref.id)} disabled={busy}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition flex items-center justify-between gap-2 text-xs disabled:opacity-40"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{ref.last_name} {ref.first_name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{ref.club_name || 'fără club'} · {ref.current_grade || '—'}</p>
                      </div>
                      <span className="shrink-0 text-blue-500 text-[10px] font-medium">+ Adaugă</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Roster list */}
      <div className="flex-1 overflow-y-auto p-3">
        {rosterRefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-3xl mb-3">⚖️</p>
            <p className="text-sm text-gray-500 font-medium">Niciun arbitru adăugat</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Adaugă arbitrii care vor participa la această competiție pentru a-i putea asigna la categorii și meciuri pe pagina Programare.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rosterRefs.map(entry => <RefereeCard key={entry.id} entry={entry} />)}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">📊 Sumar</h4>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-blue-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-blue-700">{rosterRefs.length}</p>
                  <p className="text-[9px] text-gray-500">Total arbitri</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-green-700">
                    {rosterRefs.filter(r => getRefAssignmentCount(r.athlete) > 0).length}
                  </p>
                  <p className="text-[9px] text-gray-500">Cu asignări</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-700">
                    {rosterRefs.filter(r => getRefConflicts(r.athlete).length > 0).length}
                  </p>
                  <p className="text-[9px] text-gray-500">Cu conflicte</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
