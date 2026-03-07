import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CentralizatorContext, GENDER_LABELS, GENDER_BG } from './CategoriesLayout';
import {
  fieldAPI, matchAPI,
  matchFieldAssignmentAPI,
  categoryRefereeAssignmentAPI, matchRefereeAssignmentAPI,
  competitionRefereeAPI,
  fieldBreakAPI,
  scoreAPI, refereeAPI,
} from '@shared/lib/api';

const TYPE_BADGES = {
  solo: { label: 'Solo', bg: 'bg-purple-100 text-purple-700' },
  team: { label: 'Echipă', bg: 'bg-teal-100 text-teal-700' },
  fight: { label: 'Luptă', bg: 'bg-red-100 text-red-700' },
};

const ROUND_LABELS = {
  'qualifications': 'Calificări',
  'quarter-finals': 'Sferturi',
  'semi-finals': 'Semifinale',
  'finals': 'Finală',
  'bronze': 'Meci Bronz',
};

export default function ProgramarePage() {
  const ctx = useContext(CentralizatorContext);
  const { eventId, categories, groups, columnStructure } = ctx || {};

  // ── Local state ──────────────────────────────────
  const [fields, setFields] = useState([]);
  const [catAssignments, setCatAssignments] = useState([]);   // CategoryFieldAssignment[]
  const [matchAssignments, setMatchAssignments] = useState([]); // MatchFieldAssignment[]
  const [fieldBreaks, setFieldBreaks] = useState([]);           // FieldBreak[]
  const [matches, setMatches] = useState([]);
  const [referees, setReferees] = useState([]);               // Athletes with is_referee
  const [catRefAssignments, setCatRefAssignments] = useState([]);
  const [matchRefAssignments, setMatchRefAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // DnD state — dragItem uses ref to avoid re-render (which would recreate inner components and cancel the drag)
  const dragItemRef = useRef(null);
  const [dragOverFieldId, setDragOverFieldId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null); // { fieldId, index } — shows drop line before item at index

  // Inline editing
  const [editingDuration, setEditingDuration] = useState(null); // { id, type, value }
  const [refPickerOpen, setRefPickerOpen] = useState(null);     // { type, id, slot } — referee picker
  const refPickerRef = useRef(null);
  const [editingStartTime, setEditingStartTime] = useState(null); // { fieldId, value }
  const [editingBreak, setEditingBreak] = useState(null); // { id, field, label, duration }
  const [detailModal, setDetailModal] = useState(null); // { catId } — category detail modal
  const [detailScores, setDetailScores] = useState([]); // CategoryAthleteScore[] for modal
  const [detailRefScores, setDetailRefScores] = useState([]); // CategoryRefereeScore[] for modal
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Data fetching ────────────────────────────────
  const fetchScheduleData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [fieldsRes, catAssRes, matchAssRes, matchesRes, refAssRes, matchRefRes, rosterRes, breaksRes] = await Promise.all([
        fieldAPI.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        matchFieldAssignmentAPI.list({ event_id: eventId }),
        matchAPI.list({ event_id: eventId }),
        categoryRefereeAssignmentAPI.list({ event_id: eventId }),
        matchRefereeAssignmentAPI.list({ event_id: eventId }),
        competitionRefereeAPI.list({ event_id: eventId }),
        fieldBreakAPI.list({ event_id: eventId }),
      ]);
      setFields((fieldsRes.data?.results || fieldsRes.data || []).sort((a, b) => a.field_number - b.field_number));
      setCatAssignments(catAssRes.data?.results || catAssRes.data || []);
      setMatchAssignments(matchAssRes.data?.results || matchAssRes.data || []);
      setFieldBreaks(breaksRes.data?.results || breaksRes.data || []);
      setMatches(matchesRes.data?.results || matchesRes.data || []);
      setCatRefAssignments(refAssRes.data?.results || refAssRes.data || []);
      setMatchRefAssignments(matchRefRes.data?.results || matchRefRes.data || []);
      // Build referees list from competition roster
      const roster = rosterRes.data?.results || rosterRes.data || [];
      setReferees(roster.map(r => ({ id: r.athlete, last_name: r.athlete_name?.split(' ')[0] || '', first_name: r.athlete_name?.split(' ').slice(1).join(' ') || '', athlete_name: r.athlete_name })));
    } catch (err) {
      console.error('Failed to load schedule data', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchScheduleData(); }, [fetchScheduleData]);

  // Close ref picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (refPickerRef.current && !refPickerRef.current.contains(e.target)) {
        setRefPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Early return AFTER all hooks ─────────────────
  if (!ctx) return null;

  // ── Derived data ─────────────────────────────────

  // Get all solo/team categories (with enrolled athletes) — deduplicated
  const allCats = (() => {
    const seen = new Set();
    const result = [];
    for (const col of columnStructure) {
      for (const cat of col.cats) {
        if (seen.has(cat.id)) continue;
        seen.add(cat.id);
        const group = groups.find(g => g.id === cat.group);
        result.push({ ...cat, groupName: group?.name || '' });
      }
    }
    return result;
  })();

  // Map: categoryId → assignment
  const catAssignmentMap = {};
  for (const a of catAssignments) catAssignmentMap[a.category] = a;

  // Map: matchId → MatchFieldAssignment
  const matchAssignmentMap = {};
  for (const a of matchAssignments) matchAssignmentMap[a.match] = a;

  // Map: categoryId → CategoryRefereeAssignment
  const catRefMap = {};
  for (const a of catRefAssignments) catRefMap[a.category] = a;

  // Map: matchId → MatchRefereeAssignment
  const matchRefMap = {};
  for (const a of matchRefAssignments) matchRefMap[a.match] = a;

  // Unassigned categories (solo/team — no fight here, fights go as matches)
  const unassignedCats = allCats.filter(c => (c.type === 'solo' || c.type === 'team') && !catAssignmentMap[c.id]);

  // Fight categories → show as matches. Group matches by category
  const fightCats = allCats.filter(c => c.type === 'fight');
  const matchesByCat = {};
  for (const m of matches) {
    if (!matchesByCat[m.category]) matchesByCat[m.category] = [];
    matchesByCat[m.category].push(m);
  }

  // Unassigned matches (fight matches not assigned to a field)
  const unassignedMatches = matches.filter(m => !matchAssignmentMap[m.id]);

  // Items per field — sorted by order (includes categories, matches, and breaks)
  const fieldItems = (fieldId) => {
    const catItems = catAssignments
      .filter(a => a.field === fieldId)
      .map(a => {
        const cat = allCats.find(c => c.id === a.category);
        return { type: 'category', id: a.category, assignment: a, data: cat, order: a.order };
      })
      .filter(item => item.data);

    const matchItems = matchAssignments
      .filter(a => a.field === fieldId)
      .map(a => {
        const match = matches.find(m => m.id === a.match);
        return { type: 'match', id: a.match, assignment: a, data: match, order: a.order };
      })
      .filter(item => item.data);

    const breakItems = fieldBreaks
      .filter(b => b.field === fieldId)
      .map(b => ({ type: 'break', id: b.id, assignment: null, data: b, order: b.order }));

    return [...catItems, ...matchItems, ...breakItems].sort((a, b) => a.order - b.order);
  };

  // ── Handlers ─────────────────────────────────────

  // Assign category to field
  const assignCatToField = async (catId, fieldId) => {
    setBusy(true);
    try {
      const existing = catAssignmentMap[catId];
      if (existing) {
        // Move to different field
        const res = await fieldAPI.assignments.update(existing.id, { field: fieldId });
        setCatAssignments(prev => prev.map(a => a.id === existing.id ? (res.data || { ...a, field: fieldId }) : a));
      } else {
        // Create new assignment
        const maxOrder = catAssignments.filter(a => a.field === fieldId).reduce((m, a) => Math.max(m, a.order), -1) + 1;
        const res = await fieldAPI.assignments.create({ category: catId, field: fieldId, order: maxOrder });
        setCatAssignments(prev => [...prev, res.data]);
      }
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  // Assign match to field
  const assignMatchToField = async (matchId, fieldId) => {
    setBusy(true);
    try {
      const existing = matchAssignmentMap[matchId];
      if (existing) {
        const res = await matchFieldAssignmentAPI.update(existing.id, { field: fieldId });
        setMatchAssignments(prev => prev.map(a => a.id === existing.id ? (res.data || { ...a, field: fieldId }) : a));
      } else {
        const maxOrder = matchAssignments.filter(a => a.field === fieldId).reduce((m, a) => Math.max(m, a.order), -1) + 1;
        const res = await matchFieldAssignmentAPI.create({ match: matchId, field: fieldId, order: maxOrder });
        setMatchAssignments(prev => [...prev, res.data]);
      }
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  // Unassign (remove from field)
  const unassignCat = async (catId) => {
    const a = catAssignmentMap[catId];
    if (!a) return;
    setBusy(true);
    try {
      await fieldAPI.assignments.delete(a.id);
      setCatAssignments(prev => prev.filter(x => x.id !== a.id));
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const unassignMatch = async (matchId) => {
    const a = matchAssignmentMap[matchId];
    if (!a) return;
    setBusy(true);
    try {
      await matchFieldAssignmentAPI.delete(a.id);
      setMatchAssignments(prev => prev.filter(x => x.id !== a.id));
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  // Duration update
  const saveDuration = async () => {
    if (!editingDuration) return;
    const { id, type, value } = editingDuration;
    const mins = parseInt(value) || (type === 'match' ? 10 : 15);
    setBusy(true);
    try {
      if (type === 'category') {
        const a = catAssignmentMap[id];
        if (a) {
          await fieldAPI.assignments.update(a.id, { estimated_duration: mins });
          setCatAssignments(prev => prev.map(x => x.id === a.id ? { ...x, estimated_duration: mins } : x));
        }
      } else {
        const a = matchAssignmentMap[id];
        if (a) {
          await matchFieldAssignmentAPI.update(a.id, { estimated_duration: mins });
          setMatchAssignments(prev => prev.map(x => x.id === a.id ? { ...x, estimated_duration: mins } : x));
        }
      }
    } catch (err) { console.error(err); }
    setEditingDuration(null);
    setBusy(false);
  };

  // Referee assignment
  const assignReferee = async (itemType, itemId, slot, refereeId) => {
    setBusy(true);
    try {
      if (itemType === 'category') {
        const existing = catRefMap[itemId];
        const data = { [`referee_${slot}`]: refereeId || null };
        if (existing) {
          const res = await categoryRefereeAssignmentAPI.update(existing.id, data);
          setCatRefAssignments(prev => prev.map(a => a.id === existing.id ? (res.data || { ...a, ...data }) : a));
        } else {
          const res = await categoryRefereeAssignmentAPI.create({ category: itemId, ...data });
          setCatRefAssignments(prev => [...prev, res.data]);
        }
      } else {
        const existing = matchRefMap[itemId];
        const data = { [`referee_${slot}`]: refereeId || null };
        if (existing) {
          const res = await matchRefereeAssignmentAPI.update(existing.id, data);
          setMatchRefAssignments(prev => prev.map(a => a.id === existing.id ? (res.data || { ...a, ...data }) : a));
        } else {
          const res = await matchRefereeAssignmentAPI.create({ match: itemId, ...data });
          setMatchRefAssignments(prev => [...prev, res.data]);
        }
      }
    } catch (err) { console.error(err); }
    setRefPickerOpen(null);
    setBusy(false);
  };

  // ── DnD handlers ─────────────────────────────────
  const handleDragStart = (e, type, id, fromFieldId = null) => {
    dragItemRef.current = { type, id, fromFieldId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${type}:${id}`);
    // Apply visual feedback via DOM (after browser captures drag image)
    requestAnimationFrame(() => {
      e.target.style.opacity = '0.4';
      e.target.style.transform = 'scale(0.95)';
    });
  };

  const handleDragOver = (e, fieldId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFieldId(fieldId);
  };

  // Per-item drag over — determines drop position within a field
  const handleItemDragOver = (e, fieldId, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropIndex = e.clientY < midY ? index : index + 1;
    setDragOverFieldId(fieldId);
    setDropIndicator(prev => {
      if (prev?.fieldId === fieldId && prev?.index === dropIndex) return prev;
      return { fieldId, index: dropIndex };
    });
  };

  const handleDragLeave = (e) => {
    // Only reset when truly leaving the container, not when entering a child element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverFieldId(null);
      setDropIndicator(null);
    }
  };

  const handleDrop = async (e, targetFieldId) => {
    e.preventDefault();
    setDragOverFieldId(null);
    const indicator = dropIndicator;
    setDropIndicator(null);
    const item = dragItemRef.current;
    if (!item) return;
    dragItemRef.current = null;
    const { type, id, fromFieldId } = item;

    // Within-field reorder (or cross-field with specific position)
    if (indicator && indicator.fieldId === targetFieldId && fromFieldId === targetFieldId) {
      await reorderFieldItems(targetFieldId, type, id, indicator.index);
      return;
    }

    // Assignment from unassigned panel or another field
    if (type === 'category') await assignCatToField(id, targetFieldId);
    else if (type === 'match') await assignMatchToField(id, targetFieldId);
  };

  const handleDragEnd = (e) => {
    dragItemRef.current = null;
    setDragOverFieldId(null);
    setDropIndicator(null);
    // Reset visual feedback
    e.target.style.opacity = '';
    e.target.style.transform = '';
  };

  // ── Within-field reorder ─────────────────────────
  const reorderFieldItems = async (fieldId, dragType, dragId, dropIndex) => {
    const items = fieldItems(fieldId);
    const currentIndex = items.findIndex(i => i.type === dragType && i.id === dragId);
    if (currentIndex === -1) return;
    // No change if dropping at same position
    if (currentIndex === dropIndex || currentIndex === dropIndex - 1) return;

    // Build new order: remove dragged item, insert at drop position
    const newItems = [...items];
    const [removed] = newItems.splice(currentIndex, 1);
    const adjustedIndex = dropIndex > currentIndex ? dropIndex - 1 : dropIndex;
    newItems.splice(adjustedIndex, 0, removed);

    // Compute new order values and group by type
    const catUpdates = [];
    const matchUpdates = [];
    const breakUpdates = [];

    newItems.forEach((item, idx) => {
      if (item.type === 'category' && item.assignment) {
        catUpdates.push({ id: item.assignment.id, field: fieldId, order: idx });
      } else if (item.type === 'match' && item.assignment) {
        matchUpdates.push({ id: item.assignment.id, field: fieldId, order: idx });
      } else if (item.type === 'break') {
        breakUpdates.push({ id: item.id, order: idx });
      }
    });

    // Optimistic local state update
    if (catUpdates.length) {
      setCatAssignments(prev => prev.map(a => {
        const upd = catUpdates.find(u => u.id === a.id);
        return upd ? { ...a, order: upd.order } : a;
      }));
    }
    if (matchUpdates.length) {
      setMatchAssignments(prev => prev.map(a => {
        const upd = matchUpdates.find(u => u.id === a.id);
        return upd ? { ...a, order: upd.order } : a;
      }));
    }
    if (breakUpdates.length) {
      setFieldBreaks(prev => prev.map(b => {
        const upd = breakUpdates.find(u => u.id === b.id);
        return upd ? { ...b, order: upd.order } : b;
      }));
    }

    // Persist to backend
    try {
      const promises = [];
      if (catUpdates.length) promises.push(fieldAPI.assignments.bulkReorder(catUpdates));
      if (matchUpdates.length) promises.push(matchFieldAssignmentAPI.bulkReorder(matchUpdates));
      if (breakUpdates.length) promises.push(fieldBreakAPI.bulkReorder(breakUpdates));
      await Promise.all(promises);
    } catch (err) { console.error('Reorder failed:', err); }
  };

  // ── Generate matches for a fight category ────────
  const generateMatches = async (catId) => {
    const cat = allCats.find(c => c.id === catId);
    if (!cat) return;
    const enrolled = cat.enrolled_athletes || [];
    if (enrolled.length < 2) return;

    setBusy(true);
    try {
      // Generate round-robin matches
      const athletes = enrolled.map(ea => ea.athlete_details || ea.athlete).filter(Boolean);
      const created = [];
      for (let i = 0; i < athletes.length; i++) {
        for (let j = i + 1; j < athletes.length; j++) {
          const res = await matchAPI.create({
            category: catId,
            red_corner: athletes[i].id || athletes[i],
            blue_corner: athletes[j].id || athletes[j],
            match_type: 'qualifications',
          });
          created.push(res.data);
        }
      }
      setMatches(prev => [...prev, ...created]);
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  // ── Computed start times per field ────────────────
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
  };

  const formatTime = (h, m) => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const addMinutes = (time, mins) => {
    if (!time) return null;
    let totalMin = time.h * 60 + time.m + mins;
    return { h: Math.floor(totalMin / 60) % 24, m: totalMin % 60 };
  };

  const computeStartTimes = (items, field) => {
    const baseTime = parseTime(field?.start_time);
    let accumulated = 0;
    return items.map(item => {
      const start = accumulated;
      const duration = item.type === 'break'
        ? (item.data?.duration || 60)
        : (item.assignment?.estimated_duration || (item.type === 'match' ? 10 : 15));
      const clockStart = baseTime ? addMinutes(baseTime, start) : null;
      const clockEnd = baseTime ? addMinutes(baseTime, start + duration) : null;
      accumulated += duration;
      return { ...item, startMin: start, duration, clockStart, clockEnd };
    });
  };

  // ── Referee conflict detection ───────────────────
  // Build a map: refereeId → [{ fieldId, startMin, endMin }] across all fields
  const buildRefereeTimeMap = () => {
    const refTimeMap = {}; // { refId: [{ fieldId, startMin, endMin, itemName }] }
    for (const field of fields) {
      const items = fieldItems(field.id);
      let accumulated = 0;
      for (const item of items) {
        const duration = item.type === 'break'
          ? (item.data?.duration || 60)
          : (item.assignment?.estimated_duration || (item.type === 'match' ? 10 : 15));
        const startMin = accumulated;
        const endMin = accumulated + duration;
        accumulated += duration;

        // Skip breaks — they don't have referees
        if (item.type === 'break') continue;

        // Find which referees are assigned to this item
        const refAss = item.type === 'category' ? catRefMap[item.id] : matchRefMap[item.id];
        if (refAss) {
          for (let i = 1; i <= 5; i++) {
            const refId = refAss[`referee_${i}`];
            if (refId) {
              if (!refTimeMap[refId]) refTimeMap[refId] = [];
              refTimeMap[refId].push({
                fieldId: field.id,
                fieldName: field.name,
                startMin, endMin,
                itemName: item.data?.name || `#${item.id}`,
              });
            }
          }
        }
      }
    }
    return refTimeMap;
  };

  const refereeTimeMap = buildRefereeTimeMap();

  // Check if a referee has a conflict at a given time slot
  const getRefereeConflict = (refId, fieldId, startMin, endMin) => {
    const slots = refereeTimeMap[refId] || [];
    for (const slot of slots) {
      if (slot.fieldId === fieldId) continue; // same field = sequential, not parallel
      if (slot.startMin < endMin && startMin < slot.endMin) {
        return slot; // overlapping on different field
      }
    }
    return null;
  };

  // ── Save field start time ────────────────────────
  const saveStartTime = async (fieldId, value) => {
    setBusy(true);
    try {
      const timeVal = value || null;
      await fieldAPI.update(fieldId, { start_time: timeVal });
      setFields(prev => prev.map(f => f.id === fieldId ? { ...f, start_time: timeVal } : f));
    } catch (err) { console.error(err); }
    setEditingStartTime(null);
    setBusy(false);
  };

  // ── Break (pause) handlers ───────────────────────
  const addBreak = async (fieldId) => {
    setBusy(true);
    try {
      // Place break at the end (max order + 1)
      const currentItems = fieldItems(fieldId);
      const maxOrder = currentItems.reduce((m, i) => Math.max(m, i.order), -1) + 1;
      const res = await fieldBreakAPI.create({
        field: fieldId,
        label: 'Pauză',
        duration: 60,
        order: maxOrder,
      });
      setFieldBreaks(prev => [...prev, res.data]);
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const saveBreak = async () => {
    if (!editingBreak) return;
    const { id, label, duration } = editingBreak;
    const mins = parseInt(duration) || 60;
    setBusy(true);
    try {
      const res = await fieldBreakAPI.update(id, { label: label || 'Pauză', duration: mins });
      setFieldBreaks(prev => prev.map(b => b.id === id ? (res.data || { ...b, label, duration: mins }) : b));
    } catch (err) { console.error(err); }
    setEditingBreak(null);
    setBusy(false);
  };

  const removeBreak = async (breakId) => {
    setBusy(true);
    try {
      await fieldBreakAPI.delete(breakId);
      setFieldBreaks(prev => prev.filter(b => b.id !== breakId));
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  // ── Category detail modal ────────────────────────
  const openCategoryDetail = async (catId) => {
    setDetailModal({ catId });
    setDetailLoading(true);
    try {
      const [scoresRes, refScoresRes] = await Promise.all([
        scoreAPI.list({ category: catId }),
        refereeAPI.categoryScores.list({ category: catId }),
      ]);
      setDetailScores(scoresRes.data?.results || scoresRes.data || []);
      setDetailRefScores(refScoresRes.data?.results || refScoresRes.data || []);
    } catch (err) { console.error(err); }
    setDetailLoading(false);
  };

  const getCategoryStatus = (cat) => {
    // Check if this category has athlete scores
    const refAss = catRefMap[cat.id];
    const hasReferees = refAss && [1,2,3,4,5].some(i => refAss[`referee_${i}`]);
    const enrolled = cat.enrolled_athletes || [];
    if (enrolled.length === 0) return 'empty';
    // We derive status from scores data: not_started, in_progress, finished
    // For now, compute from category assignment and enrollment
    if (!catAssignmentMap[cat.id]) return 'not_started';
    return 'not_started'; // will be overridden by score-based status in modal
  };

  // ── Referee display helper ───────────────────────
  const RefSlots = ({ itemType, itemId, fieldId, startMin, endMin }) => {
    const refAss = itemType === 'category' ? catRefMap[itemId] : matchRefMap[itemId];
    const slots = [1, 2, 3, 4, 5];
    return (
      <div className="flex gap-0.5 mt-1 flex-wrap">
        {slots.map(slot => {
          const refId = refAss?.[`referee_${slot}`];
          const refName = refAss?.[`referee_${slot}_name`];
          const isOpen = refPickerOpen?.type === itemType && refPickerOpen?.id === itemId && refPickerOpen?.slot === slot;
          const conflict = refId && fieldId != null && startMin != null && endMin != null
            ? getRefereeConflict(refId, fieldId, startMin, endMin)
            : null;
          return (
            <div key={slot} className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setRefPickerOpen(isOpen ? null : { type: itemType, id: itemId, slot }); }}
                className={`text-[8px] rounded px-1 py-0.5 border transition min-w-[20px] text-center ${
                  conflict
                    ? 'bg-red-100 border-red-400 text-red-700 hover:bg-red-200 ring-1 ring-red-300'
                    : refId
                      ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                      : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                }`}
                title={conflict
                  ? `⚠ Conflict: ${refName} este și pe ${conflict.fieldName} (${conflict.itemName})`
                  : refName || `Arbitru A${slot} — click pentru a asigna`}
              >
                {conflict ? '⚠' : ''}{refName ? refName.split(' ')[0].slice(0, 5) : `A${slot}`}
              </button>
              {isOpen && (
                <div ref={refPickerRef}
                  className="absolute top-full left-0 z-50 mt-0.5 w-52 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl text-[10px]"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => assignReferee(itemType, itemId, slot, null)}
                    className="w-full text-left px-2 py-1.5 text-gray-400 hover:bg-gray-50 italic"
                  >— Fără arbitru —</button>
                  {referees.map(ref => {
                    const refConflict = fieldId != null && startMin != null && endMin != null
                      ? getRefereeConflict(ref.id, fieldId, startMin, endMin)
                      : null;
                    return (
                      <button key={ref.id}
                        onClick={() => assignReferee(itemType, itemId, slot, ref.id)}
                        className={`w-full text-left px-2 py-1.5 hover:bg-blue-50 transition flex items-center justify-between ${
                          ref.id === refId ? 'bg-blue-100 font-semibold' : ''
                        } ${refConflict ? 'text-red-600' : ''}`}
                      >
                        <span>{ref.last_name} {ref.first_name}</span>
                        {refConflict && <span className="text-[8px] text-red-500 ml-1">⚠ {refConflict.fieldName}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Card component ───────────────────────────────
  const ItemCard = ({ item, showRemove = true }) => {
    const isCat = item.type === 'category';
    const data = item.data;
    if (!data) return null;

    const badge = isCat ? TYPE_BADGES[data.type] : TYPE_BADGES.fight;
    const duration = item.assignment?.estimated_duration || (isCat ? 15 : 10);
    const isEditingThis = editingDuration?.type === item.type && editingDuration?.id === item.id;
    const enrolledCount = isCat ? (data.enrolled_athletes?.length || 0) : null;

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, item.type, item.id, item.assignment?.field)}
        onDragEnd={handleDragEnd}
        className="group rounded-lg border bg-white p-2 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing mb-1.5"
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`inline-block rounded px-1 py-0.5 text-[8px] font-bold ${badge?.bg || 'bg-gray-100 text-gray-600'}`}>
                {badge?.label || '?'}
              </span>
              {isCat && data.gender && (
                <span className={`inline-block rounded px-1 py-0.5 text-[8px] font-medium ${GENDER_BG[data.gender] || 'bg-gray-100'} text-gray-700`}>
                  {GENDER_LABELS[data.gender]?.slice(0, 1) || '?'}
                </span>
              )}
              {enrolledCount !== null && (
                <span className="text-[8px] text-gray-400">{enrolledCount} sp.</span>
              )}
            </div>
            <p className="text-[11px] font-semibold text-gray-900 truncate mt-0.5 leading-tight">
              {isCat ? data.name : (
                (data.red_corner_full_name || data.blue_corner_full_name)
                  ? `${data.red_corner_full_name || '?'} vs ${data.blue_corner_full_name || '?'}`
                  : (data.match_number || data.name || 'Meci')
              )}
            </p>
            {isCat && data.groupName && (
              <p className="text-[9px] text-gray-400 truncate">{data.groupName}</p>
            )}
            {!isCat && (
              <p className="text-[9px] text-gray-500 truncate">
                {data.red_corner_full_name || '?'}{data.red_corner_club_name ? ` (${data.red_corner_club_name})` : ''}
                <span className="text-red-400 font-bold mx-0.5">vs</span>
                {data.blue_corner_full_name || '?'}{data.blue_corner_club_name ? ` (${data.blue_corner_club_name})` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Duration */}
            {item.assignment && (
              isEditingThis ? (
                <input
                  type="number" min="1" max="120" autoFocus
                  className="w-10 text-center text-[10px] border border-blue-400 rounded px-0.5 py-0.5 outline-none bg-blue-50"
                  value={editingDuration.value}
                  onChange={(e) => setEditingDuration({ ...editingDuration, value: e.target.value })}
                  onBlur={saveDuration}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveDuration(); if (e.key === 'Escape') setEditingDuration(null); }}
                />
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingDuration({ type: item.type, id: item.id, value: String(duration) }); }}
                  className="text-[9px] text-gray-500 bg-gray-100 rounded px-1 py-0.5 hover:bg-blue-100 transition"
                  title="Click pentru a edita durata"
                >
                  {duration}′
                </button>
              )
            )}
            {/* Info button — only for categories */}
            {isCat && item.assignment && (
              <button
                onClick={(e) => { e.stopPropagation(); openCategoryDetail(item.id); }}
                className="hidden group-hover:inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold hover:bg-blue-500 hover:text-white transition"
                title="Detalii categorie"
              >ℹ</button>
            )}
            {/* Remove button */}
            {showRemove && item.assignment && (
              <button
                onClick={(e) => { e.stopPropagation(); isCat ? unassignCat(item.id) : unassignMatch(item.id); }}
                disabled={busy}
                className="hidden group-hover:inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 text-[9px] font-bold hover:bg-red-500 hover:text-white transition disabled:opacity-40"
                title="Scoate din tatami"
              >×</button>
            )}
          </div>
        </div>
        {/* Referee slots — only when assigned to a field */}
        {item.assignment && <RefSlots itemType={item.type} itemId={item.id}
          fieldId={item.assignment?.field} startMin={item.startMin} endMin={item.startMin != null ? item.startMin + duration : null} />}
      </div>
    );
  };

  // ── Unassigned card (enriched with details) ──
  const UnassignedCard = ({ type, id, data }) => {
    if (!data) return null;
    const badge = type === 'category' ? TYPE_BADGES[data.type] : TYPE_BADGES.fight;

    if (type === 'category') {
      // Solo / Team category
      const enrolled = data.enrolled_athletes || [];
      const enrolledCount = enrolled.length;
      const genderLabel = GENDER_LABELS[data.gender] || '';
      const genderBg = GENDER_BG[data.gender] || 'bg-gray-100';
      return (
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, type, id)}
          onDragEnd={handleDragEnd}
          className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2 cursor-grab active:cursor-grabbing hover:bg-white hover:border-gray-400 hover:shadow-sm transition mb-1.5"
        >
          <div className="flex items-center gap-1 mb-1">
            <span className={`inline-block rounded px-1 py-0.5 text-[8px] font-bold ${badge?.bg || 'bg-gray-100'}`}>
              {badge?.label}
            </span>
            {genderLabel && (
              <span className={`inline-block rounded px-1 py-0.5 text-[7px] font-medium ${genderBg} text-gray-700`}>
                {genderLabel}
              </span>
            )}
            <span className="text-[10px] font-medium text-gray-700 truncate flex-1">{data.name}</span>
          </div>
          {data.groupName && (
            <div className="text-[8px] text-gray-400 mb-0.5 truncate">📁 {data.groupName}</div>
          )}
          <div className="flex items-center gap-2 text-[8px] text-gray-500">
            <span>👥 {enrolledCount} sportiv{enrolledCount !== 1 ? 'i' : ''}</span>
          </div>
          {enrolledCount > 0 && enrolledCount <= 6 && (
            <div className="mt-1 space-y-0.5">
              {enrolled.slice(0, 6).map((ea, idx) => {
                const a = ea.athlete_details || ea;
                return (
                  <div key={a.id || idx} className="text-[8px] text-gray-400 truncate pl-2">
                    {idx + 1}. {a.last_name || a.name || ''} {a.first_name || ''}
                    {a.club_name ? ` (${a.club_name})` : ''}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Fight match
    const roundLabel = ROUND_LABELS[data.match_type] || data.match_type || '';
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, type, id)}
        onDragEnd={handleDragEnd}
        className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2 cursor-grab active:cursor-grabbing hover:bg-white hover:border-gray-400 hover:shadow-sm transition mb-1.5"
      >
        <div className="flex items-center gap-1 mb-1">
          <span className={`inline-block rounded px-1 py-0.5 text-[8px] font-bold ${badge?.bg || 'bg-gray-100'}`}>
            {badge?.label}
          </span>
          {roundLabel && (
            <span className="text-[7px] bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-medium">
              {roundLabel}
            </span>
          )}
          <span className="text-[9px] text-gray-400 font-mono shrink-0">#{data.match_number}</span>
        </div>
        {/* Corners */}
        <div className="space-y-0.5 mt-1">
          <div className="flex items-center gap-1 text-[9px]">
            <div className="w-1.5 h-1.5 rounded-sm bg-red-500 shrink-0" />
            <span className="truncate text-gray-700 font-medium">
              {data.red_corner_full_name
                ? <>{data.red_corner_full_name}{data.red_corner_club_name && <span className="text-[7px] text-gray-400 ml-0.5">({data.red_corner_club_name})</span>}</>
                : <span className="italic text-gray-400">TBD</span>
              }
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9px]">
            <div className="w-1.5 h-1.5 rounded-sm bg-blue-500 shrink-0" />
            <span className="truncate text-gray-700 font-medium">
              {data.blue_corner_full_name
                ? <>{data.blue_corner_full_name}{data.blue_corner_club_name && <span className="text-[7px] text-gray-400 ml-0.5">({data.blue_corner_club_name})</span>}</>
                : <span className="italic text-gray-400">TBD</span>
              }
            </span>
          </div>
        </div>
        {data.round_number && (
          <div className="text-[7px] text-gray-400 mt-1">Runda {data.round_number}</div>
        )}
      </div>
    );
  };

  // ── Break card component ─────────────────────────
  const BreakCard = ({ item }) => {
    const brk = item.data;
    if (!brk) return null;
    const isEditing = editingBreak?.id === brk.id;

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, 'break', brk.id, brk.field)}
        onDragEnd={handleDragEnd}
        className="group rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/70 p-2 mb-1.5 transition-all cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-sm">☕</span>
            {isEditing ? (
              <input
                type="text" autoFocus
                className="text-[11px] font-semibold text-amber-900 bg-white border border-amber-400 rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
                value={editingBreak.label}
                onChange={(e) => setEditingBreak({ ...editingBreak, label: e.target.value })}
                onBlur={saveBreak}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBreak(); if (e.key === 'Escape') setEditingBreak(null); }}
              />
            ) : (
              <span
                className="text-[11px] font-semibold text-amber-900 truncate cursor-pointer hover:underline"
                onClick={() => setEditingBreak({ id: brk.id, label: brk.label, duration: brk.duration })}
                title="Click pentru a edita"
              >
                {brk.label || 'Pauză'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isEditing ? (
              <input
                type="number" min="5" max="180"
                className="w-12 text-center text-[10px] border border-amber-400 rounded px-0.5 py-0.5 outline-none bg-white"
                value={editingBreak.duration}
                onChange={(e) => setEditingBreak({ ...editingBreak, duration: e.target.value })}
                onBlur={saveBreak}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBreak(); if (e.key === 'Escape') setEditingBreak(null); }}
              />
            ) : (
              <button
                onClick={() => setEditingBreak({ id: brk.id, label: brk.label, duration: brk.duration })}
                className="text-[9px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 hover:bg-amber-200 transition font-medium"
                title="Click pentru a edita durata"
              >
                {brk.duration}′
              </button>
            )}
            <button
              onClick={() => removeBreak(brk.id)}
              disabled={busy}
              className="hidden group-hover:inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 text-[9px] font-bold hover:bg-red-500 hover:text-white transition disabled:opacity-40"
              title="Șterge pauza"
            >×</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Field count management ───────────────────────
  const [fieldCount, setFieldCount] = useState(0);
  const [savingFields, setSavingFields] = useState(false);
  const [tatamiLocked, setTatamiLocked] = useState(false);

  useEffect(() => { setFieldCount(fields.length); }, [fields.length]);

  const handleSetFieldCount = async (newCount) => {
    if (newCount < 0 || newCount > 20 || !eventId) return;
    setFieldCount(newCount);
    setSavingFields(true);
    try {
      const { data } = await fieldAPI.setCount(eventId, newCount);
      const list = Array.isArray(data) ? data : data.results ?? [];
      setFields(list.sort((a, b) => a.field_number - b.field_number));
      setFieldCount(list.length);
    } catch (err) { console.error(err); }
    setSavingFields(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
        Se încarcă programarea...
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-4 text-center">
        <div>
          <p className="text-2xl mb-2">🏟️</p>
          <p className="text-sm font-semibold text-gray-700 mb-3">Câte tatami / terenuri sunt?</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => handleSetFieldCount(fieldCount - 1)}
              disabled={fieldCount <= 0 || savingFields}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30"
            >−</button>
            <span className="min-w-[3rem] text-center text-2xl font-bold text-gray-900">
              {savingFields ? '…' : fieldCount}
            </span>
            <button
              onClick={() => handleSetFieldCount(fieldCount + 1)}
              disabled={fieldCount >= 20 || savingFields}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30"
            >+</button>
          </div>
          {fieldCount > 0 && (
            <button
              onClick={() => { setTatamiLocked(true); handleSetFieldCount(fieldCount); }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
            >🔒 Blochează {fieldCount} tatami</button>
          )}
          <p className="text-[10px] text-gray-400 mt-2">Max 20 terenuri · Selectează și blochează</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-100">

      {/* ═══ LEFT PANEL — Unassigned items ═══ */}
      <div className="w-56 sm:w-64 shrink-0 border-r border-gray-300 bg-white flex flex-col overflow-hidden">
        {/* Field count stepper with lock/unlock */}
        <div className="px-2 py-1.5 border-b border-gray-200 bg-blue-50 flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold text-gray-700">🏟️ Tatami</span>
          {tatamiLocked ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-900">{fields.length}</span>
              <span className="text-[9px] text-green-600">🔒</span>
              <button onClick={() => setTatamiLocked(false)}
                className="text-[9px] text-gray-400 hover:text-red-500 transition" title="Deblochează numărul de tatami">🔓</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => handleSetFieldCount(fields.length - 1)} disabled={fields.length <= 1 || savingFields}
                className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30">−</button>
              <span className="min-w-[1.5rem] text-center text-xs font-bold text-gray-900">{savingFields ? '…' : fields.length}</span>
              <button onClick={() => handleSetFieldCount(fields.length + 1)} disabled={fields.length >= 20 || savingFields}
                className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30">+</button>
              <button onClick={() => setTatamiLocked(true)}
                className="flex h-5 w-5 items-center justify-center rounded text-[9px] text-gray-400 hover:text-green-600 transition" title="Blochează numărul de tatami">🔒</button>
            </div>
          )}
        </div>
        <div className="px-2 py-2 border-b border-gray-200 bg-gray-50">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">📋 Nealocate</h3>
          <p className="text-[9px] text-gray-400 mt-0.5">Trage categorii sau meciuri pe un tatami</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">

          {/* Solo/Team categories */}
          {unassignedCats.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1">Tehnica ({unassignedCats.length})</p>
              {unassignedCats.map(cat => (
                <UnassignedCard key={cat.id} type="category" id={cat.id} data={cat} />
              ))}
            </div>
          )}

          {/* Fight categories with matches */}
          {fightCats.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1">Luptă</p>
              {fightCats.map(cat => {
                const catMatches = matchesByCat[cat.id] || [];
                const unassignedCatMatches = catMatches.filter(m => !matchAssignmentMap[m.id]);
                return (
                  <div key={cat.id} className="mb-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-gray-700 truncate flex-1">{cat.name}</span>
                      {catMatches.length === 0 && (cat.enrolled_athletes?.length || 0) >= 2 && (
                        <button
                          onClick={() => generateMatches(cat.id)}
                          disabled={busy}
                          className="text-[8px] bg-red-100 text-red-600 rounded px-1.5 py-0.5 hover:bg-red-200 transition font-medium disabled:opacity-40 shrink-0 ml-1"
                        >⚔ Generează</button>
                      )}
                    </div>
                    {catMatches.length === 0 ? (
                      <p className="text-[8px] text-gray-400 italic ml-1">
                        {(cat.enrolled_athletes?.length || 0) < 2 ? 'Prea puțini sportivi' : 'Apasă Generează'}
                      </p>
                    ) : unassignedCatMatches.length === 0 ? (
                      <p className="text-[8px] text-green-600 ml-1">✓ Toate meciurile alocate</p>
                    ) : (
                      unassignedCatMatches.map(m => (
                        <UnassignedCard key={m.id} type="match" id={m.id} data={m} />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {unassignedCats.length === 0 && fightCats.every(c => {
            const cm = matchesByCat[c.id] || [];
            return cm.length > 0 && cm.every(m => matchAssignmentMap[m.id]);
          }) && (
            <p className="text-[10px] text-green-600 italic text-center py-4">✓ Totul este alocat!</p>
          )}
        </div>
      </div>

      {/* ═══ FIELD COLUMNS — fill available width ═══ */}
      <div className="flex-1 flex overflow-x-auto gap-2 p-2">
        {fields.map(field => {
          const items = computeStartTimes(fieldItems(field.id), field);
          const totalMin = items.reduce((s, i) => s + i.duration, 0);
          const isDragOver = dragOverFieldId === field.id;
          const baseTime = parseTime(field.start_time);
          const endTime = baseTime ? addMinutes(baseTime, totalMin) : null;
          const isEditingTime = editingStartTime?.fieldId === field.id;

          return (
            <div
              key={field.id}
              className={`flex-1 min-w-[220px] flex flex-col rounded-xl border-2 transition-all ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50/50 shadow-lg'
                  : 'border-gray-200 bg-white'
              }`}
              onDragOver={(e) => handleDragOver(e, field.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, field.id)}
            >
              {/* Field header */}
              <div className={`px-3 py-2 rounded-t-xl border-b ${isDragOver ? 'bg-blue-100 border-blue-300' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-800">{field.name}</h3>
                  <span className="text-[9px] text-gray-400">{items.length} probe</span>
                </div>
                {/* Start time editor */}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[9px] text-gray-500">🕐</span>
                  {isEditingTime ? (
                    <input
                      type="time" autoFocus
                      className="text-[10px] border border-blue-400 rounded px-1 py-0.5 outline-none bg-blue-50 w-20"
                      value={editingStartTime.value}
                      onChange={(e) => setEditingStartTime({ ...editingStartTime, value: e.target.value })}
                      onBlur={() => saveStartTime(field.id, editingStartTime.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveStartTime(field.id, editingStartTime.value);
                        if (e.key === 'Escape') setEditingStartTime(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingStartTime({ fieldId: field.id, value: field.start_time || '09:00' })}
                      className="text-[10px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5 transition"
                      title="Click pentru a seta ora de start"
                    >
                      {field.start_time ? formatTime(...field.start_time.split(':').map(Number)) : 'Setează ora'}
                    </button>
                  )}
                  {totalMin > 0 && (
                    <span className="text-[9px] text-gray-400 ml-auto">
                      {endTime ? `→ ${formatTime(endTime.h, endTime.m)}` : `${Math.floor(totalMin / 60) > 0 ? `${Math.floor(totalMin / 60)}h ` : ''}${totalMin % 60}min`}
                    </span>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto p-2 min-h-[120px]">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-[10px] text-gray-300 italic">
                    Trage aici o categorie sau un meci
                  </div>
                ) : (
                  items.map((item, idx) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      onDragOver={(e) => handleItemDragOver(e, field.id, idx)}
                    >
                      {/* Drop indicator — blue line before this item */}
                      {dropIndicator?.fieldId === field.id && dropIndicator?.index === idx && (
                        <div className="h-0.5 bg-blue-500 rounded-full mx-1 my-1 shadow-sm shadow-blue-300 transition-all" />
                      )}
                      {/* Time indicator */}
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[8px] text-gray-400 font-mono shrink-0">
                          {item.clockStart
                            ? <span className="text-blue-600 font-semibold">{formatTime(item.clockStart.h, item.clockStart.m)}</span>
                            : `+${item.startMin}′`
                          }
                        </span>
                        <div className="flex-1 border-t border-dashed border-gray-200" />
                        {item.clockEnd && (
                          <span className="text-[7px] text-gray-300 font-mono shrink-0">
                            {formatTime(item.clockEnd.h, item.clockEnd.m)}
                          </span>
                        )}
                      </div>
                      {item.type === 'break' ? <BreakCard item={item} /> : <ItemCard item={item} />}
                    </div>
                  ))
                )}
                {/* Drop indicator at end of list */}
                {dropIndicator?.fieldId === field.id && dropIndicator?.index === items.length && items.length > 0 && (
                  <div className="h-0.5 bg-blue-500 rounded-full mx-1 my-1 shadow-sm shadow-blue-300 transition-all" />
                )}
                {/* Add break button */}
                <button
                  onClick={() => addBreak(field.id)}
                  disabled={busy}
                  className="w-full mt-1 py-1.5 rounded-lg border-2 border-dashed border-amber-200 text-[10px] text-amber-600 font-medium hover:bg-amber-50 hover:border-amber-300 transition disabled:opacity-40"
                >
                  ☕ + Pauză
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ CATEGORY DETAIL MODAL ═══ */}
      {detailModal && (() => {
        const cat = allCats.find(c => c.id === detailModal.catId);
        if (!cat) return null;
        const enrolled = cat.enrolled_athletes || [];
        const refAss = catRefMap[cat.id];
        const refSlots = [1,2,3,4,5].map(i => ({
          slot: i,
          id: refAss?.[`referee_${i}`],
          name: refAss?.[`referee_${i}_name`] || null,
        }));
        const activeRefs = refSlots.filter(r => r.id);

        // Build score matrix: athlete → { refId → score }
        const scoreMatrix = {};
        const athleteScoreMap = {}; // athleteId → CategoryAthleteScore
        for (const as of detailScores) {
          const athId = as.athlete?.id || as.athlete;
          if (athId) {
            athleteScoreMap[athId] = as;
            scoreMatrix[athId] = {};
          }
        }
        for (const rs of detailRefScores) {
          const athScoreId = rs.athlete_score;
          const as = detailScores.find(s => s.id === athScoreId);
          if (as) {
            const athId = as.athlete?.id || as.athlete;
            if (athId) {
              if (!scoreMatrix[athId]) scoreMatrix[athId] = {};
              scoreMatrix[athId][rs.referee] = rs.score;
            }
          }
        }

        // Determine status
        const totalAthletes = enrolled.length;
        const athletesWithAllScores = Object.keys(scoreMatrix).filter(aid => {
          const scores = Object.values(scoreMatrix[aid] || {});
          return scores.length >= activeRefs.length && activeRefs.length > 0;
        }).length;
        let catStatus = 'not_started';
        if (totalAthletes > 0 && activeRefs.length > 0) {
          if (athletesWithAllScores >= totalAthletes) catStatus = 'finished';
          else if (detailRefScores.length > 0) catStatus = 'in_progress';
        }
        const STATUS_DISPLAY = {
          not_started: { label: 'Neînceput', bg: 'bg-gray-100 text-gray-600', icon: '⏳' },
          in_progress: { label: 'În desfășurare', bg: 'bg-yellow-100 text-yellow-700', icon: '▶️' },
          finished: { label: 'Finalizat', bg: 'bg-green-100 text-green-700', icon: '✅' },
        };
        const sd = STATUS_DISPLAY[catStatus];

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => { setDetailModal(null); setDetailScores([]); setDetailRefScores([]); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{cat.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      TYPE_BADGES[cat.type]?.bg || 'bg-gray-100'
                    }`}>{TYPE_BADGES[cat.type]?.label}</span>
                    {cat.gender && (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${GENDER_BG[cat.gender] || 'bg-gray-100'} text-gray-700`}>
                        {GENDER_LABELS[cat.gender]}
                      </span>
                    )}
                    {cat.groupName && <span className="text-[10px] text-gray-400">{cat.groupName}</span>}
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${sd.bg}`}>
                      {sd.icon} {sd.label}
                    </span>
                  </div>
                </div>
                <button onClick={() => { setDetailModal(null); setDetailScores([]); setDetailRefScores([]); }}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg flex items-center justify-center transition">×</button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Referees assigned */}
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Arbitri asignați</h3>
                  <div className="flex gap-2 flex-wrap">
                    {refSlots.map(r => (
                      <div key={r.slot} className={`rounded-lg border px-3 py-1.5 text-xs ${
                        r.id ? 'bg-blue-50 border-blue-200 text-blue-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400 italic'
                      }`}>
                        R{r.slot}: {r.name || 'Neasignat'}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Athletes list */}
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                    Sportivi înscriși ({enrolled.length})
                  </h3>
                  {enrolled.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Niciun sportiv înscris</p>
                  ) : (
                    <div className="text-xs text-gray-600 space-y-1">
                      {enrolled.map((ea, idx) => {
                        const ath = ea.athlete_details || ea;
                        return (
                          <div key={ath.id || idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                            <span className="text-gray-400 w-5 text-right font-mono text-[10px]">{idx + 1}.</span>
                            <span className="font-medium">{ath.last_name || ath.name || ''} {ath.first_name || ''}</span>
                            {ath.club_name && <span className="text-gray-400">({ath.club_name})</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Score matrix */}
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Punctaje arbitri</h3>
                  {detailLoading ? (
                    <p className="text-xs text-gray-400 italic">Se încarcă...</p>
                  ) : detailScores.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Nu există punctaje încă</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-2 py-1.5 border-b border-gray-200 font-semibold text-gray-600">#</th>
                            <th className="text-left px-2 py-1.5 border-b border-gray-200 font-semibold text-gray-600">Sportiv</th>
                            {activeRefs.map(r => (
                              <th key={r.slot} className="text-center px-2 py-1.5 border-b border-gray-200 font-semibold text-blue-600 min-w-[50px]">
                                R{r.slot}
                              </th>
                            ))}
                            <th className="text-center px-2 py-1.5 border-b border-gray-200 font-semibold text-gray-800">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailScores.map((as, idx) => {
                            const athId = as.athlete?.id || as.athlete;
                            const athName = as.athlete?.name || as.athlete_name || `Sportiv #${athId}`;
                            const scores = scoreMatrix[athId] || {};
                            const allScoreVals = activeRefs.map(r => scores[r.id]).filter(v => v != null);
                            const sortedVals = [...allScoreVals].sort((a, b) => a - b);
                            let total = null;
                            if (sortedVals.length >= 3) {
                              const middle = sortedVals.length >= 5
                                ? sortedVals.slice(1, -1)
                                : sortedVals.length === 4 ? sortedVals.slice(0, -1) : sortedVals;
                              total = middle.reduce((s, v) => s + Number(v), 0);
                            }
                            return (
                              <tr key={as.id} className="hover:bg-gray-50">
                                <td className="px-2 py-1.5 border-b border-gray-100 text-gray-400 font-mono">{idx + 1}</td>
                                <td className="px-2 py-1.5 border-b border-gray-100 font-medium text-gray-800">{athName}</td>
                                {activeRefs.map(r => {
                                  const val = scores[r.id];
                                  const isMin = sortedVals.length >= 5 && val != null && Number(val) === sortedVals[0];
                                  const isMax = sortedVals.length >= 5 && val != null && Number(val) === sortedVals[sortedVals.length - 1];
                                  return (
                                    <td key={r.slot} className={`text-center px-2 py-1.5 border-b border-gray-100 font-mono ${
                                      val == null ? 'text-gray-300' :
                                      isMin || isMax ? 'text-gray-400 line-through' : 'text-gray-800 font-semibold'
                                    }`}>
                                      {val != null ? Number(val).toFixed(1) : '—'}
                                    </td>
                                  );
                                })}
                                <td className="text-center px-2 py-1.5 border-b border-gray-100 font-bold text-blue-700">
                                  {total != null ? total.toFixed(1) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
