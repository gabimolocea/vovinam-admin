import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  solo: { label: 'Solo', bg: 'border border-black bg-yellow-300 text-black' },
  team: { label: 'Echipă', bg: 'border border-black bg-yellow-300 text-black' },
  fight: { label: 'Luptă', bg: 'border border-black bg-yellow-300 text-black' },
};

const ROUND_LABELS = {
  'qualifications': 'Calificări',
  'quarter-finals': 'Sferturi',
  'semi-finals': 'Semifinale',
  'finals': 'Finală',
  'bronze': 'Meci Bronz',
};

const formatFieldLabel = (name = '') => String(name)
  .replace(/\bfield\b/gi, 'TEREN')
  .replace(/\btatami\b/gi, 'TEREN')
  .toUpperCase();

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
  const groupMap = useMemo(() => {
    const map = new Map();
    for (const group of groups || []) map.set(group.id, group);
    return map;
  }, [groups]);

  const allCats = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const col of columnStructure || []) {
      for (const cat of col.cats || []) {
        if (seen.has(cat.id)) continue;
        seen.add(cat.id);
        const group = groupMap.get(cat.group);
        result.push({ ...cat, groupName: group?.name || '' });
      }
    }
    return result;
  }, [columnStructure, groupMap]);

  const categoryMap = useMemo(() => {
    const map = new Map();
    for (const cat of allCats) map.set(cat.id, cat);
    return map;
  }, [allCats]);

  const matchMap = useMemo(() => {
    const map = new Map();
    for (const match of matches) map.set(match.id, match);
    return map;
  }, [matches]);

  // Map: categoryId → assignment
  const catAssignmentMap = useMemo(() => {
    const map = {};
    for (const a of catAssignments) map[a.category] = a;
    return map;
  }, [catAssignments]);

  // Map: matchId → MatchFieldAssignment
  const matchAssignmentMap = useMemo(() => {
    const map = {};
    for (const a of matchAssignments) map[a.match] = a;
    return map;
  }, [matchAssignments]);

  // Map: categoryId → CategoryRefereeAssignment
  const catRefMap = useMemo(() => {
    const map = {};
    for (const a of catRefAssignments) map[a.category] = a;
    return map;
  }, [catRefAssignments]);

  // Map: matchId → MatchRefereeAssignment
  const matchRefMap = useMemo(() => {
    const map = {};
    for (const a of matchRefAssignments) map[a.match] = a;
    return map;
  }, [matchRefAssignments]);

  // Unassigned categories (solo/team — no fight here, fights go as matches)
  const unassignedCats = allCats.filter(c => (c.type === 'solo' || c.type === 'team') && !catAssignmentMap[c.id]);

  // Fight categories → show as matches. Group matches by category
  const fightCats = allCats.filter(c => c.type === 'fight');
  const matchesByCat = useMemo(() => {
    const map = {};
    for (const m of matches) {
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(m);
    }
    return map;
  }, [matches]);

  const fieldItemsMap = useMemo(() => {
    const byField = new Map();
    const ensureField = (fieldId) => {
      if (!byField.has(fieldId)) byField.set(fieldId, []);
      return byField.get(fieldId);
    };

    for (const assignment of catAssignments) {
      const cat = categoryMap.get(assignment.category);
      if (cat) {
        ensureField(assignment.field).push({ type: 'category', id: assignment.category, assignment, data: cat, order: assignment.order });
      }
    }

    for (const assignment of matchAssignments) {
      const match = matchMap.get(assignment.match);
      if (match) {
        ensureField(assignment.field).push({ type: 'match', id: assignment.match, assignment, data: match, order: assignment.order });
      }
    }

    for (const fieldBreak of fieldBreaks) {
      ensureField(fieldBreak.field).push({ type: 'break', id: fieldBreak.id, assignment: null, data: fieldBreak, order: fieldBreak.order });
    }

    for (const items of byField.values()) items.sort((a, b) => a.order - b.order);
    return byField;
  }, [catAssignments, matchAssignments, fieldBreaks, categoryMap, matchMap]);

  // Unassigned matches (fight matches not assigned to a field)
  const unassignedMatches = matches.filter(m => !matchAssignmentMap[m.id]);

  // Items per field — sorted by order (includes categories, matches, and breaks)
  const fieldItems = (fieldId) => {
    return fieldItemsMap.get(fieldId) || [];
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
    const cat = categoryMap.get(catId);
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
                fieldName: formatFieldLabel(field.name),
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
                className={`text-xs rounded px-1.5 py-1 border transition min-w-[28px] text-center ${
                    conflict
                    ? 'border-black bg-yellow-300 text-black hover:bg-yellow-200'
                    : refId
                      ? 'border-black bg-yellow-100 text-black hover:bg-yellow-200'
                      : 'border-black bg-white text-gray-600 hover:bg-yellow-50'
                }`}
                title={conflict
                  ? `⚠ Conflict: ${refName} este și pe ${conflict.fieldName} (${conflict.itemName})`
                  : refName || `Arbitru A${slot} — click pentru a asigna`}
              >
                {conflict ? '⚠' : ''}{refName ? refName.split(' ')[0].slice(0, 5) : `A${slot}`}
              </button>
              {isOpen && (
                <div ref={refPickerRef}
                  className="absolute top-full left-0 z-50 mt-1 w-56 max-h-56 overflow-y-auto border border-black bg-white shadow-xl text-sm"
                title="Scoate de pe teren"
                >
                  <button
                    onClick={() => assignReferee(itemType, itemId, slot, null)}
                    className="w-full px-2 py-1.5 text-left italic text-gray-500 hover:bg-yellow-50"
                  >— Fără arbitru —</button>
                  {referees.map(ref => {
                    const refConflict = fieldId != null && startMin != null && endMin != null
                      ? getRefereeConflict(ref.id, fieldId, startMin, endMin)
                      : null;
                    return (
                      <button key={ref.id}
                        onClick={() => assignReferee(itemType, itemId, slot, ref.id)}
                        className={`w-full text-left px-2 py-1.5 transition flex items-center justify-between ${
                          ref.id === refId ? 'bg-yellow-200 font-semibold' : 'hover:bg-yellow-50'
                        } ${refConflict ? 'text-gray-900' : ''}`}
                      >
                        <span>{ref.last_name} {ref.first_name}</span>
                        {refConflict && <span className="text-xs text-red-500 ml-1">⚠ {refConflict.fieldName}</span>}
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
    const matchCat = !isCat ? categoryMap.get(data.category) : null;
    const matchCategoryName = matchCat?.name || data.category_name || 'Meci';
    const matchGroupName = matchCat?.groupName || '';
    const matchGenderLabel = matchCat?.gender ? (GENDER_LABELS[matchCat.gender] || matchCat.gender) : '';
    const matchTypeLabel = !isCat ? (ROUND_LABELS[data.match_type] || data.match_type || '') : '';
    const duration = item.assignment?.estimated_duration || (isCat ? 15 : 10);
    const isEditingThis = editingDuration?.type === item.type && editingDuration?.id === item.id;
    const enrolledCount = isCat ? (data.enrolled_athletes?.length || 0) : null;

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, item.type, item.id, item.assignment?.field)}
        onDragEnd={handleDragEnd}
        className="group mb-2 cursor-grab border-2 border-black bg-white p-2.5 shadow-sm transition-all active:cursor-grabbing hover:bg-yellow-50 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${badge?.bg || 'bg-gray-100 text-gray-600'}`}>
                {badge?.label || '?'}
              </span>
              {isCat && data.gender && (
                <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${GENDER_BG[data.gender] || 'bg-gray-100'} text-gray-700`}>
                  {(GENDER_LABELS[data.gender] || '?').toUpperCase()}
                </span>
              )}
              {enrolledCount !== null && (
                <span className="text-xs text-gray-500">{enrolledCount} sportivi</span>
              )}
              {!isCat && data.match_number && (
                <span className="text-xs text-gray-500 font-mono">#{data.match_number}</span>
              )}
            </div>
            {isCat ? (
              <p className="mt-0.5 text-sm font-semibold leading-tight text-gray-900 whitespace-normal break-words">{data.name}</p>
            ) : null}
            {isCat && data.groupName && (
              <p className="text-xs text-gray-500 whitespace-normal break-words">{data.groupName}</p>
            )}
            {!isCat && (
              <>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{matchCategoryName}</span>
                  {matchGroupName && <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{matchGroupName}</span>}
                  {matchGenderLabel && <span className={`border border-black px-1.5 py-0.5 text-xs text-gray-700 ${GENDER_BG[matchCat?.gender] || 'bg-gray-100'}`}>{matchGenderLabel}</span>}
                  {matchTypeLabel && <span className="border border-black bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-gray-800">{matchTypeLabel}</span>}
                </div>
                <p className="mt-0.5 text-sm font-semibold leading-tight whitespace-normal break-words">
                  <span className="text-red-600">{data.red_corner_full_name || '?'}</span>{data.red_corner_club_name ? <span className="text-gray-500 font-normal"> ({data.red_corner_club_name})</span> : null}
                  <span className="mx-0.5 font-bold text-gray-500">vs</span>
                  <span className="text-blue-600">{data.blue_corner_full_name || '?'}</span>{data.blue_corner_club_name ? <span className="text-gray-500 font-normal"> ({data.blue_corner_club_name})</span> : null}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Duration */}
            {item.assignment && (
              isEditingThis ? (
                <input
                  type="number" min="1" max="120" autoFocus
                  className="w-12 border border-gray-500 bg-white px-1 py-0.5 text-center text-sm outline-none"
                  value={editingDuration.value}
                  onChange={(e) => setEditingDuration({ ...editingDuration, value: e.target.value })}
                  onBlur={saveDuration}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveDuration(); if (e.key === 'Escape') setEditingDuration(null); }}
                />
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingDuration({ type: item.type, id: item.id, value: String(duration) }); }}
                  className="border border-black bg-yellow-100 px-1.5 py-0.5 text-sm text-gray-800 transition hover:bg-yellow-200"
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
                className="hidden h-5 w-5 items-center justify-center border border-black bg-white text-xs font-bold text-gray-700 transition hover:bg-yellow-100 group-hover:inline-flex"
                title="Detalii categorie"
              >ℹ</button>
            )}
            {/* Remove button */}
            {showRemove && item.assignment && (
              <button
                onClick={(e) => { e.stopPropagation(); isCat ? unassignCat(item.id) : unassignMatch(item.id); }}
                disabled={busy}
                className="hidden h-5 w-5 items-center justify-center border border-black bg-white text-xs font-bold text-gray-700 transition hover:bg-yellow-100 disabled:opacity-40 group-hover:inline-flex"
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
          className="mb-2 cursor-grab border-2 border-dashed border-black bg-white p-2.5 transition active:cursor-grabbing hover:bg-yellow-50 hover:shadow-sm"
        >
            <div className="mb-1.5 flex items-start gap-1.5">
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${badge?.bg || 'bg-gray-100'}`}>
              {badge?.label}
            </span>
            {genderLabel && (
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${genderBg} text-gray-700`}>
                {genderLabel}
              </span>
            )}
              <span className="flex-1 text-sm font-bold leading-snug text-gray-800 whitespace-normal break-words">{data.name}</span>
          </div>
          {data.groupName && (
            <div className="mb-0.5 text-xs text-gray-500 whitespace-normal break-words">{data.groupName}</div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>{enrolledCount} sportiv{enrolledCount !== 1 ? 'i' : ''}</span>
          </div>
        </div>
      );
    }

    // Fight match
    const roundLabel = ROUND_LABELS[data.match_type] || data.match_type || '';
    const matchCat = categoryMap.get(data.category);
    const matchCategoryName = matchCat?.name || data.category_name || 'Meci';
    const matchGroupName = matchCat?.groupName || '';
    const matchGenderLabel = matchCat?.gender ? (GENDER_LABELS[matchCat.gender] || matchCat.gender) : '';
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, type, id)}
        onDragEnd={handleDragEnd}
        className="mb-2 cursor-grab border-2 border-dashed border-black bg-white p-2.5 transition active:cursor-grabbing hover:bg-yellow-50 hover:shadow-sm"
      >
        <div className="mb-1.5 flex items-start gap-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${badge?.bg || 'bg-gray-100'}`}>
            {badge?.label}
          </span>
          <span className="text-xs text-gray-500 font-mono shrink-0">#{data.match_number}</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{matchCategoryName}</span>
          {matchGroupName && <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{matchGroupName}</span>}
          {matchGenderLabel && <span className={`border border-black px-1.5 py-0.5 text-xs text-gray-700 ${GENDER_BG[matchCat?.gender] || 'bg-gray-100'}`}>{matchGenderLabel}</span>}
          {roundLabel && <span className="border border-black bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-gray-800">{roundLabel}</span>}
        </div>
        {/* Corners */}
        <div className="space-y-0.5 mt-1">
          <div className="flex items-center gap-1 text-sm">
            <div className="h-1.5 w-1.5 shrink-0 bg-red-500" />
            <span className="font-semibold text-red-600 whitespace-normal break-words">
              {data.red_corner_full_name
                ? <>{data.red_corner_full_name}{data.red_corner_club_name && <span className="text-xs text-gray-500 ml-0.5">({data.red_corner_club_name})</span>}</>
                : <span className="italic text-gray-400">TBD</span>
              }
            </span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <div className="h-1.5 w-1.5 shrink-0 bg-blue-500" />
            <span className="font-semibold text-blue-600 whitespace-normal break-words">
              {data.blue_corner_full_name
                ? <>{data.blue_corner_full_name}{data.blue_corner_club_name && <span className="text-xs text-gray-500 ml-0.5">({data.blue_corner_club_name})</span>}</>
                : <span className="italic text-gray-400">TBD</span>
              }
            </span>
          </div>
        </div>
        {data.round_number && (
          <div className="text-xs text-gray-500 mt-1">Runda {data.round_number}</div>
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
        className="group mb-2 cursor-grab border-2 border-dashed border-black bg-white p-2.5 transition-all active:cursor-grabbing hover:bg-yellow-50"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-sm">☕</span>
            {isEditing ? (
              <input
                type="text" autoFocus
                className="flex-1 min-w-0 border border-gray-500 bg-white px-2 py-1 text-sm font-semibold text-gray-900 outline-none"
                value={editingBreak.label}
                onChange={(e) => setEditingBreak({ ...editingBreak, label: e.target.value })}
                onBlur={saveBreak}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBreak(); if (e.key === 'Escape') setEditingBreak(null); }}
              />
            ) : (
              <span
                className="truncate cursor-pointer text-sm font-semibold text-gray-900 hover:underline"
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
                className="w-14 border border-gray-500 bg-white px-1 py-0.5 text-center text-sm outline-none"
                value={editingBreak.duration}
                onChange={(e) => setEditingBreak({ ...editingBreak, duration: e.target.value })}
                onBlur={saveBreak}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBreak(); if (e.key === 'Escape') setEditingBreak(null); }}
              />
            ) : (
              <button
                onClick={() => setEditingBreak({ id: brk.id, label: brk.label, duration: brk.duration })}
                className="border border-black bg-yellow-100 px-1.5 py-0.5 text-sm font-medium text-gray-800 transition hover:bg-yellow-200"
                title="Click pentru a edita durata"
              >
                {brk.duration}′
              </button>
            )}
            <button
              onClick={() => removeBreak(brk.id)}
              disabled={busy}
              className="hidden h-5 w-5 items-center justify-center border border-black bg-white text-xs font-bold text-gray-700 transition hover:bg-yellow-100 disabled:opacity-40 group-hover:inline-flex"
              title="Șterge pauza"
            >×</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Field count management ───────────────────────
  const [fieldCount, setFieldCount] = useState(2);
  const [savingFields, setSavingFields] = useState(false);
  const [tatamiLocked, setTatamiLocked] = useState(false);

  useEffect(() => { setFieldCount(fields.length || 2); }, [fields.length]);

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
          <p className="text-sm font-semibold text-gray-700 mb-3">Câte terenuri sunt?</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => handleSetFieldCount(fieldCount - 1)}
              disabled={fieldCount <= 0 || savingFields}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-black bg-white text-lg font-bold text-gray-700 hover:bg-yellow-100 disabled:opacity-30"
            >−</button>
            <span className="min-w-[3rem] text-center text-2xl font-bold text-gray-900">
              {savingFields ? '…' : fieldCount}
            </span>
            <button
              onClick={() => handleSetFieldCount(fieldCount + 1)}
              disabled={fieldCount >= 20 || savingFields}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-black bg-white text-lg font-bold text-gray-700 hover:bg-yellow-100 disabled:opacity-30"
            >+</button>
          </div>
          {fieldCount > 0 && (
            <button
              onClick={() => { setTatamiLocked(true); handleSetFieldCount(fieldCount); }}
              className="border border-black bg-yellow-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-200"
            >🔒 Blochează {fieldCount} terenuri</button>
          )}
          <p className="text-sm text-gray-500 mt-2">Max 20 terenuri · Selectează și blochează</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-white p-2 gap-2">

      {/* ═══ LEFT PANEL — Unassigned items ═══ */}
      <div className="w-80 sm:w-96 shrink-0 flex flex-col overflow-hidden border-2 border-black bg-white shadow-sm">
        {/* Field count stepper with lock/unlock */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-yellow-300 px-3 py-2">
          <span className="text-sm font-bold uppercase tracking-wide text-gray-900">Terenuri</span>
          {tatamiLocked ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-900">{fields.length}</span>
              <button onClick={() => setTatamiLocked(false)}
                className="text-sm text-gray-700 transition hover:text-black" title="Deblochează numărul de terenuri">🔓</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => handleSetFieldCount(fields.length - 1)} disabled={fields.length <= 1 || savingFields}
                className="flex h-6 w-6 items-center justify-center rounded border border-black bg-white text-sm font-bold text-gray-700 hover:bg-yellow-100 disabled:opacity-30">−</button>
              <span className="min-w-[1.75rem] text-center text-sm font-bold text-gray-900">{savingFields ? '…' : fields.length}</span>
              <button onClick={() => handleSetFieldCount(fields.length + 1)} disabled={fields.length >= 20 || savingFields}
                className="flex h-6 w-6 items-center justify-center rounded border border-black bg-white text-sm font-bold text-gray-700 hover:bg-yellow-100 disabled:opacity-30">+</button>
              <button onClick={() => setTatamiLocked(true)}
                className="flex h-6 w-6 items-center justify-center rounded text-sm text-gray-700 transition hover:text-black" title="Blochează numărul de terenuri">🔒</button>
            </div>
          )}
        </div>
        <div className="border-b-2 border-black bg-yellow-100 px-3 py-2">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Nealocate</h3>
          <p className="mt-0.5 text-sm text-gray-600">Trage categorii sau meciuri pe un teren</p>
        </div>
          <div className="flex-1 overflow-y-auto bg-yellow-50/40 p-3 space-y-3">

          {/* Solo/Team categories */}
          {unassignedCats.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-gray-700 uppercase tracking-wide">Tehnica ({unassignedCats.length})</p>
              {unassignedCats.map(cat => (
                <UnassignedCard key={cat.id} type="category" id={cat.id} data={cat} />
              ))}
            </div>
          )}

          {/* Fight categories with matches */}
          {fightCats.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-gray-700 uppercase tracking-wide">Luptă</p>
              {fightCats.map(cat => {
                const catMatches = matchesByCat[cat.id] || [];
                const unassignedCatMatches = catMatches.filter(m => !matchAssignmentMap[m.id]);
                return (
                  <div key={cat.id} className="mb-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="flex-1 text-sm font-semibold leading-snug text-gray-700 whitespace-normal break-words">{cat.name}</span>
                      {catMatches.length === 0 && (cat.enrolled_athletes?.length || 0) >= 2 && (
                        <button
                          onClick={() => generateMatches(cat.id)}
                          disabled={busy}
                          className="ml-1 shrink-0 border border-black bg-yellow-100 px-2 py-0.5 text-xs font-medium text-gray-800 transition hover:bg-yellow-200 disabled:opacity-40"
                        >⚔ Generează</button>
                      )}
                    </div>
                    {catMatches.length === 0 ? (
                      <p className="text-xs text-gray-500 italic ml-1">
                        {(cat.enrolled_athletes?.length || 0) < 2 ? 'Prea puțini sportivi' : 'Apasă Generează'}
                      </p>
                    ) : unassignedCatMatches.length === 0 ? (
                      <p className="ml-1 text-xs text-gray-700">✓ Toate meciurile alocate</p>
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
            <p className="py-4 text-center text-sm italic text-gray-700">✓ Totul este alocat!</p>
          )}
        </div>
      </div>

      {/* ═══ FIELD COLUMNS — fill available width ═══ */}
      <div className="flex-1 flex overflow-x-auto gap-2 pb-1">
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
              className={`flex-1 min-w-[300px] flex flex-col border-2 transition-all shadow-sm ${
                isDragOver
                  ? 'border-black bg-yellow-50 shadow-lg'
                  : 'border-black bg-white'
              }`}
              onDragOver={(e) => handleDragOver(e, field.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, field.id)}
            >
              {/* Field header */}
              <div className={`border-b-2 border-black ${isDragOver ? 'bg-yellow-200' : 'bg-yellow-300'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="px-3 py-2 text-sm font-bold uppercase tracking-wide text-gray-900">{formatFieldLabel(field.name)}</h3>
                  <span className="px-3 py-2 text-xs font-semibold text-gray-700">{items.length} probe</span>
                </div>
              </div>
              <div className="flex items-center gap-1 border-b-2 border-black bg-yellow-100 px-3 py-2">
                {/* Start time editor */}
                  <span className="text-sm text-gray-600">🕐</span>
                  {isEditingTime ? (
                    <input
                      type="time" autoFocus
                      className="w-24 border border-black bg-white px-1.5 py-0.5 text-sm outline-none"
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
                      className="border border-transparent px-1.5 py-0.5 text-sm text-gray-700 transition hover:border-black hover:bg-yellow-200"
                      title="Click pentru a seta ora de start"
                    >
                      {field.start_time ? formatTime(...field.start_time.split(':').map(Number)) : 'Setează ora'}
                    </button>
                  )}
                  {totalMin > 0 && (
                    <span className="ml-auto text-xs font-medium text-gray-600">
                      {endTime ? `→ ${formatTime(endTime.h, endTime.m)}` : `${Math.floor(totalMin / 60) > 0 ? `${Math.floor(totalMin / 60)}h ` : ''}${totalMin % 60}min`}
                    </span>
                  )}
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto min-h-[120px] bg-yellow-50/30 p-3">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400 italic">
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
                        <div className="mx-1 my-1 h-0.5 bg-gray-800 transition-all" />
                      )}
                      {/* Time indicator */}
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-xs text-gray-500 font-mono shrink-0">
                          {item.clockStart
                            ? <span className="font-semibold text-gray-800">{formatTime(item.clockStart.h, item.clockStart.m)}</span>
                            : `+${item.startMin}′`
                          }
                        </span>
                        <div className="flex-1 border-t border-dashed border-gray-200" />
                        {item.clockEnd && (
                          <span className="text-xs text-gray-400 font-mono shrink-0">
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
                  <div className="mx-1 my-1 h-0.5 bg-gray-800 transition-all" />
                )}
                {/* Add break button */}
                <button
                  onClick={() => addBreak(field.id)}
                  disabled={busy}
                  className="mt-1 w-full border-2 border-dashed border-black py-2 text-sm font-medium text-gray-800 transition hover:bg-yellow-100 disabled:opacity-40"
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
        const cat = categoryMap.get(detailModal.catId);
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
          not_started: { label: 'Neînceput', bg: 'border border-black bg-white text-gray-700', icon: '⏳' },
          in_progress: { label: 'În desfășurare', bg: 'border border-black bg-yellow-100 text-gray-800', icon: '▶️' },
          finished: { label: 'Finalizat', bg: 'border border-black bg-yellow-300 text-black', icon: '✅' },
        };
        const sd = STATUS_DISPLAY[catStatus];

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => { setDetailModal(null); setDetailScores([]); setDetailRefScores([]); }}>
            <div className="flex max-h-[85vh] w-[90vw] max-w-4xl flex-col overflow-hidden border-2 border-black bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-black bg-yellow-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{cat.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-sm font-bold ${
                      TYPE_BADGES[cat.type]?.bg || 'bg-gray-100'
                    }`}>{TYPE_BADGES[cat.type]?.label}</span>
                    {cat.gender && (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-sm font-medium ${GENDER_BG[cat.gender] || 'bg-gray-100'} text-gray-700`}>
                        {GENDER_LABELS[cat.gender]}
                      </span>
                    )}
                    {cat.groupName && <span className="text-sm text-gray-500">{cat.groupName}</span>}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-sm font-semibold ${sd.bg}`}>
                      {sd.icon} {sd.label}
                    </span>
                  </div>
                </div>
                <button onClick={() => { setDetailModal(null); setDetailScores([]); setDetailRefScores([]); }}
                  className="flex h-8 w-8 items-center justify-center border border-black bg-white text-lg text-gray-600 transition hover:bg-yellow-200">×</button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Referees assigned */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Arbitri asignați</h3>
                  <div className="flex gap-2 flex-wrap">
                    {refSlots.map(r => (
                      <div key={r.slot} className={`border px-3 py-2 text-sm ${
                        r.id ? 'border-black bg-yellow-100 font-medium text-gray-800' : 'border-black bg-white italic text-gray-400'
                      }`}>
                        R{r.slot}: {r.name || 'Neasignat'}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Athletes list */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                    Sportivi înscriși ({enrolled.length})
                  </h3>
                  {enrolled.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Niciun sportiv înscris</p>
                  ) : (
                    <div className="text-sm text-gray-600 space-y-1">
                      {enrolled.map((ea, idx) => {
                        const ath = ea.athlete_details || ea;
                        return (
                          <div key={ath.id || idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                            <span className="text-gray-400 w-5 text-right font-mono text-sm">{idx + 1}.</span>
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
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Punctaje arbitri</h3>
                  {detailLoading ? (
                    <p className="text-sm text-gray-400 italic">Se încarcă...</p>
                  ) : detailScores.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nu există punctaje încă</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-yellow-100">
                            <th className="border-b border-black px-2 py-1.5 text-left font-semibold text-gray-700">#</th>
                            <th className="border-b border-black px-2 py-1.5 text-left font-semibold text-gray-700">Sportiv</th>
                            {activeRefs.map(r => (
                                <th key={r.slot} className="min-w-[50px] border-b border-black px-2 py-1.5 text-center font-semibold text-gray-700">
                                R{r.slot}
                              </th>
                            ))}
                            <th className="border-b border-black px-2 py-1.5 text-center font-semibold text-gray-800">Total</th>
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
                              <tr key={as.id} className="hover:bg-yellow-50">
                                <td className="border-b border-gray-200 px-2 py-1.5 font-mono text-gray-400">{idx + 1}</td>
                                <td className="border-b border-gray-200 px-2 py-1.5 font-medium text-gray-800">{athName}</td>
                                {activeRefs.map(r => {
                                  const val = scores[r.id];
                                  const isMin = sortedVals.length >= 5 && val != null && Number(val) === sortedVals[0];
                                  const isMax = sortedVals.length >= 5 && val != null && Number(val) === sortedVals[sortedVals.length - 1];
                                  return (
                                    <td key={r.slot} className={`border-b border-gray-200 px-2 py-1.5 text-center font-mono ${
                                      val == null ? 'text-gray-300' :
                                      isMin || isMax ? 'text-gray-400 line-through' : 'text-gray-800 font-semibold'
                                    }`}>
                                      {val != null ? Number(val).toFixed(1) : '—'}
                                    </td>
                                  );
                                })}
                                <td className="border-b border-gray-200 px-2 py-1.5 text-center font-bold text-gray-900">
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
