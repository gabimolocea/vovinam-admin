import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CentralizatorContext, GENDER_LABELS, GENDER_BG } from './CategoriesLayout';
import {
  fieldAPI, matchAPI,
  matchFieldAssignmentAPI,
  categoryRefereeAssignmentAPI, matchRefereeAssignmentAPI,
  competitionRefereeAPI,
  fieldBreakAPI,
  scoreAPI, refereeAPI,
  schedulingAPI,
} from '@shared/lib/api';
import {
  formatGroupBadgeLabel,
  Button,
  Label,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui';

const TYPE_BADGES = {
  solo: { label: 'Solo' },
  team: { label: 'Echipă' },
  fight: { label: 'Luptă' },
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
  const [autoBusy, setAutoBusy] = useState(null); // 'fields' | 'referees' | null
  const [autoWarnings, setAutoWarnings] = useState([]);

  // DnD state — dragItem uses ref to avoid re-render (which would recreate inner components and cancel the drag)
  const dragItemRef = useRef(null);
  const [dragOverFieldId, setDragOverFieldId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null); // { fieldId, index } — shows drop line before item at index

  // Inline editing
  const [editingDuration, setEditingDuration] = useState(null); // { id, type, value }
  const [refPickerOpen, setRefPickerOpen] = useState(null);     // { type, id, slot, refId, refName, fieldId, startMin, endMin }
  const [replacementRefId, setReplacementRefId] = useState('');
  const [editingStartTime, setEditingStartTime] = useState(null); // { fieldId, value }
  const [editingBreak, setEditingBreak] = useState(null); // { id, field, label, duration, focus }
  const [detailModal, setDetailModal] = useState(null); // { catId } — category detail modal
  const [bracketPreviewCatId, setBracketPreviewCatId] = useState(null);
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

  // ── Auto-scheduling (gap-fill only — never touches existing assignments) ──
  const handleAutoScheduleFields = () => {
    ctx?.setConfirmModal({
      title: 'Auto-alocă tatami-uri',
      message: 'Categoriile solo/echipă nealocate vor fi repartizate automat pe terenuri (grupe în ordine crescătoare, seniorii ultimii, cu pauze între probele aceluiași sportiv). Alocările existente rămân neschimbate.',
      icon: '🏟️',
      color: 'orange',
      confirmLabel: 'Auto-alocă',
      onConfirm: async () => {
        try {
          setAutoBusy('fields');
          const res = await schedulingAPI.autoScheduleFields(eventId);
          setAutoWarnings(res.data?.warnings || []);
          await fetchScheduleData();
        } catch (err) {
          setAutoWarnings([err.response?.data?.error || 'Eroare la alocarea automată a terenurilor.']);
        } finally {
          setAutoBusy(null);
          ctx?.setConfirmModal(null);
        }
      },
    });
  };

  const handleAutoAssignReferees = () => {
    ctx?.setConfirmModal({
      title: 'Auto-alocă arbitri',
      message: 'Categoriile și meciurile fără arbitri vor primi automat un panel din lotul de arbitri al evenimentului, evitând pe cât posibil arbitri din cluburile care concurează. Panelurile deja alocate rămân neschimbate.',
      icon: '🧑‍⚖️',
      color: 'orange',
      confirmLabel: 'Auto-alocă',
      onConfirm: async () => {
        try {
          setAutoBusy('referees');
          const res = await schedulingAPI.autoAssignReferees(eventId);
          setAutoWarnings(res.data?.warnings || []);
          await fetchScheduleData();
        } catch (err) {
          setAutoWarnings([err.response?.data?.error || 'Eroare la alocarea automată a arbitrilor.']);
        } finally {
          setAutoBusy(null);
          ctx?.setConfirmModal(null);
        }
      },
    });
  };

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
        result.push({ ...cat, groupName: formatGroupBadgeLabel(group, cat) });
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

  // Unassigned matches (fight matches not assigned to a field) - a match
  // with either corner still TBD can't actually be fought yet (its
  // opponent hasn't been decided by an earlier bracket round), so it has
  // no business being offered up for field assignment.
  const unassignedMatches = matches.filter(m => !matchAssignmentMap[m.id] && m.red_corner && m.blue_corner);

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
    setReplacementRefId('');
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

  const getRefereeNameById = (refId) => {
    if (!refId) return null;
    return referees.find((ref) => ref.id === refId)?.athlete_name || null;
  };

  // ── Referee display helper ───────────────────────
  const RefSlots = ({ itemType, itemId, fieldId, startMin, endMin }) => {
    const refAss = itemType === 'category' ? catRefMap[itemId] : matchRefMap[itemId];
    const slots = [1, 2, 3, 4, 5];
    return (
      <div className="mt-2 flex gap-1.5 overflow-hidden">
        {slots.map(slot => {
          const refId = refAss?.[`referee_${slot}`];
          const refName = refAss?.[`referee_${slot}_name`] || getRefereeNameById(refId);
          const conflict = refId && fieldId != null && startMin != null && endMin != null
            ? getRefereeConflict(refId, fieldId, startMin, endMin)
            : null;
          const isEmpty = !refId;
          return (
            <button
              key={slot}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRefPickerOpen({ type: itemType, id: itemId, slot, refId: refId || null, refName: refName || null, fieldId, startMin, endMin });
                setReplacementRefId(refId ? String(refId) : '');
              }}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition hover:shadow-sm ${
                conflict
                  ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : isEmpty
                    ? 'border-dashed border-input bg-background text-muted-foreground hover:bg-muted'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
              title={conflict
                ? `⚠ Conflict: ${refName} este și pe ${conflict.fieldName} (${conflict.itemName})`
                : refName || `Adaugă arbitru pe poziția A${slot}`}
            >
              <span className={`inline-block h-2.5 w-2.5 shrink-0 ${isEmpty ? 'bg-muted' : conflict ? 'bg-red-500' : 'bg-muted-foreground'}`}></span>
              <span className="font-black text-foreground">A{slot}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{refName || 'Adaugă arbitru'}</span>
            </button>
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

    const matchCat = !isCat ? categoryMap.get(data.category) : null;
    const cardTitle = isCat ? data.name : null;
    const matchCategoryName = matchCat?.name || data.category_name || 'Meci';
    const matchGroupName = matchCat?.groupName || '';
    const matchGenderLabel = matchCat?.gender ? (GENDER_LABELS[matchCat.gender] || matchCat.gender) : '';
    const matchTypeLabel = !isCat ? (ROUND_LABELS[data.match_type] || data.match_type || '') : '';
    const duration = item.assignment?.estimated_duration || (isCat ? 15 : 10);
    const isEditingThis = editingDuration?.type === item.type && editingDuration?.id === item.id;
    const isTeamCat = isCat && data.type === 'team';
    const enrolledCount = isTeamCat ? (data.enrolled_teams?.length || 0) : (data.enrolled_athletes?.length || 0);

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, item.type, item.id, item.assignment?.field)}
        onDragEnd={handleDragEnd}
        className="group mb-2 cursor-grab rounded-md border border-border bg-card p-2.5 shadow-sm transition-all active:cursor-grabbing hover:bg-accent hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {isCat ? <p className="min-w-0 text-sm font-semibold leading-tight text-foreground whitespace-normal break-words">{cardTitle}</p> : null}
                {!isCat && (
                  <p className="text-sm leading-snug whitespace-normal break-words">
                    <span className="font-semibold text-red-600">
                      {data.red_corner_full_name || 'TBD'}
                      {data.red_corner_club_name ? <span className="ml-1 font-normal text-muted-foreground">({data.red_corner_club_name})</span> : null}
                    </span>
                    <span className="mx-1 font-bold text-muted-foreground">VS</span>
                    <span className="font-semibold text-blue-600">
                      {data.blue_corner_full_name || 'TBD'}
                      {data.blue_corner_club_name ? <span className="ml-1 font-normal text-muted-foreground">({data.blue_corner_club_name})</span> : null}
                    </span>
                    <span className="font-normal text-muted-foreground"> [{data.id}]</span>
                  </p>
                )}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(isCat ? data.groupName : matchGroupName) && (
                <Badge variant="outline" className="whitespace-normal break-words">{isCat ? data.groupName : matchGroupName}</Badge>
              )}
              {!isCat && matchCategoryName && (
                <Badge variant="outline" className="whitespace-normal break-words">{matchCategoryName}</Badge>
              )}
              {(isCat ? data.gender : matchCat?.gender) && (
                <span className={`border border-border px-1.5 py-0.5 text-xs text-foreground ${GENDER_BG[isCat ? data.gender : matchCat?.gender] || 'bg-muted'}`}>
                  {String(isCat ? (GENDER_LABELS[data.gender] || data.gender) : matchGenderLabel).toUpperCase()}
                </span>
              )}
              {!isCat && matchTypeLabel && (
                <span className="border border-border bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">{matchTypeLabel}</span>
              )}
              {isCat && <Badge variant="outline">{enrolledCount} {isTeamCat ? `echip${enrolledCount === 1 ? 'ă' : 'e'}` : `sportiv${enrolledCount !== 1 ? 'i' : ''}`}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Duration */}
            {item.assignment && (
              isEditingThis ? (
                <input
                  type="number" min="1" max="120" autoFocus
                  className="w-12 border border-input bg-background px-1 py-0.5 text-center text-sm text-foreground outline-none"
                  value={editingDuration.value}
                  onChange={(e) => setEditingDuration({ ...editingDuration, value: e.target.value })}
                  onBlur={saveDuration}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveDuration(); if (e.key === 'Escape') setEditingDuration(null); }}
                />
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingDuration({ type: item.type, id: item.id, value: String(duration) }); }}
                  className="rounded border border-border bg-accent px-1.5 py-0.5 text-sm text-accent-foreground transition hover:bg-accent/70"
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
                className="hidden h-5 w-5 items-center justify-center rounded border border-border bg-card text-xs font-bold text-muted-foreground transition hover:bg-accent group-hover:inline-flex"
                title="Detalii categorie"
              >ℹ</button>
            )}
            {/* Remove button */}
            {showRemove && item.assignment && (
              <button
                onClick={(e) => { e.stopPropagation(); isCat ? unassignCat(item.id) : unassignMatch(item.id); }}
                disabled={busy}
                className="hidden h-5 w-5 items-center justify-center rounded border border-border bg-card text-xs font-bold text-muted-foreground transition hover:bg-accent disabled:opacity-40 group-hover:inline-flex"
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
  const UnassignedCard = ({ type, id, data, draggable = true, assigned = false }) => {
    if (!data) return null;

    if (type === 'category') {
      // Solo / Team category
      const isTeamCat = data.type === 'team';
      const enrolled = isTeamCat ? (data.enrolled_teams || []) : (data.enrolled_athletes || []);
      const enrolledCount = enrolled.length;
      const genderLabel = GENDER_LABELS[data.gender] || '';
      const genderBg = GENDER_BG[data.gender] || 'bg-muted';
      return (
        <div
          draggable={draggable}
          onDragStart={draggable ? (e) => handleDragStart(e, type, id) : undefined}
          onDragEnd={draggable ? handleDragEnd : undefined}
          className={`mb-2 rounded-md border border-border bg-card p-2.5 transition hover:bg-accent hover:shadow-sm ${
            draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-75'
          }`}
        >
          <div className="flex items-start gap-1.5">
            <span className="flex-1 text-sm font-bold leading-snug text-foreground whitespace-normal break-words">{data.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.groupName && (
              <Badge variant="outline" className="whitespace-normal break-words">{data.groupName}</Badge>
            )}
            {genderLabel && (
              <span className={`inline-block rounded border border-border px-1.5 py-0.5 text-xs font-medium ${genderBg} text-foreground`}>
                {String(genderLabel).toUpperCase()}
              </span>
            )}
            <Badge variant="outline">{enrolledCount} {isTeamCat ? `echip${enrolledCount === 1 ? 'ă' : 'e'}` : `sportiv${enrolledCount !== 1 ? 'i' : ''}`}</Badge>
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
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, type, id) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        className={`mb-2 rounded-md border border-border bg-card p-2.5 transition hover:bg-accent hover:shadow-sm ${
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-75'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug whitespace-normal break-words">
              <span className="font-semibold text-red-600">
                {data.red_corner_full_name || 'TBD'}
                {data.red_corner_club_name ? <span className="ml-1 font-normal text-muted-foreground">({data.red_corner_club_name})</span> : null}
              </span>
              <span className="mx-1 font-bold text-muted-foreground">VS</span>
              <span className="font-semibold text-blue-600">
                {data.blue_corner_full_name || 'TBD'}
                {data.blue_corner_club_name ? <span className="ml-1 font-normal text-muted-foreground">({data.blue_corner_club_name})</span> : null}
              </span>
              <span className="font-normal text-muted-foreground"> [{data.id}]</span>
            </p>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {matchGroupName && <Badge variant="outline">{matchGroupName}</Badge>}
          {matchCategoryName && <Badge variant="outline" className="whitespace-normal break-words">{matchCategoryName}</Badge>}
          {matchGenderLabel && <span className={`border border-border px-1.5 py-0.5 text-xs text-foreground ${GENDER_BG[matchCat?.gender] || 'bg-muted'}`}>{String(matchGenderLabel).toUpperCase()}</span>}
          {roundLabel && <span className="border border-border bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">{roundLabel}</span>}
        </div>
      </div>
    );
  };

  // ── Break card component ─────────────────────────
  const BreakCard = ({ item }) => {
    const brk = item.data;
    if (!brk) return null;
    const isEditing = editingBreak?.id === brk.id;
    const focusTarget = editingBreak?.focus || 'label';

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, 'break', brk.id, brk.field)}
        onDragEnd={handleDragEnd}
        className="group mb-2 cursor-grab border-2 border-dashed border-border bg-card p-2.5 transition-all active:cursor-grabbing hover:bg-accent"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-sm">☕</span>
            {isEditing ? (
              <input
                type="text"
                className="flex-1 min-w-0 border border-input bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none"
                autoFocus={focusTarget === 'label'}
                value={editingBreak.label}
                onChange={(e) => setEditingBreak({ ...editingBreak, label: e.target.value })}
                onBlur={saveBreak}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBreak(); if (e.key === 'Escape') setEditingBreak(null); }}
              />
            ) : (
              <span
                className="truncate cursor-pointer text-sm font-semibold text-foreground hover:underline"
                onClick={(e) => { e.stopPropagation(); setEditingBreak({ id: brk.id, label: brk.label, duration: brk.duration, focus: 'label' }); }}
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
                className="w-14 border border-input bg-background px-1 py-0.5 text-center text-sm text-foreground outline-none"
                autoFocus={focusTarget === 'duration'}
                value={editingBreak.duration}
                onChange={(e) => setEditingBreak({ ...editingBreak, duration: e.target.value })}
                onBlur={saveBreak}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBreak(); if (e.key === 'Escape') setEditingBreak(null); }}
              />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingBreak({ id: brk.id, label: brk.label, duration: brk.duration, focus: 'duration' }); }}
                className="rounded border border-border bg-accent px-1.5 py-0.5 text-sm font-medium text-accent-foreground transition hover:bg-accent/70"
                title="Click pentru a edita durata"
              >
                {brk.duration}′
              </button>
            )}
            <button
              onClick={() => removeBreak(brk.id)}
              disabled={busy}
              className="hidden h-5 w-5 items-center justify-center rounded border border-border bg-card text-xs font-bold text-muted-foreground transition hover:bg-accent disabled:opacity-40 group-hover:inline-flex"
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
      <div className="flex-1 flex items-center justify-center bg-muted text-muted-foreground text-sm">
        Se încarcă programarea...
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted p-4 text-center">
        <div>
          <p className="text-2xl mb-2">🏟️</p>
          <p className="text-sm font-semibold text-foreground mb-3">Câte terenuri sunt?</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleSetFieldCount(fieldCount - 1)}
              disabled={fieldCount <= 0 || savingFields}
              className="h-10 w-10 rounded-lg text-lg font-bold"
            >−</Button>
            <span className="min-w-[3rem] text-center text-2xl font-bold text-foreground">
              {savingFields ? '…' : fieldCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleSetFieldCount(fieldCount + 1)}
              disabled={fieldCount >= 20 || savingFields}
              className="h-10 w-10 rounded-lg text-lg font-bold"
            >+</Button>
          </div>
          {fieldCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setTatamiLocked(true); handleSetFieldCount(fieldCount); }}
            >🔒 Blochează {fieldCount} terenuri</Button>
          )}
          <p className="text-sm text-muted-foreground mt-2">Max 20 terenuri · Selectează și blochează</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-background p-2 gap-2">

      {/* ═══ LEFT PANEL — Unassigned items ═══ */}
      <div className="w-80 sm:w-96 shrink-0 flex flex-col overflow-hidden border-2 border-border bg-card shadow-sm">
        {/* Field count stepper with lock/unlock */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-secondary px-3 py-2">
          <span className="text-sm font-bold uppercase tracking-wide text-secondary-foreground">Terenuri</span>
          {tatamiLocked ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-secondary-foreground">{fields.length}</span>
              <button onClick={() => setTatamiLocked(false)}
                className="text-sm text-secondary-foreground/80 transition hover:text-secondary-foreground" title="Deblochează numărul de terenuri">🔓</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => handleSetFieldCount(fields.length - 1)} disabled={fields.length <= 1 || savingFields}
                className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-sm font-bold text-muted-foreground hover:bg-secondary/70 disabled:opacity-30">−</button>
              <span className="min-w-[1.75rem] text-center text-sm font-bold text-secondary-foreground">{savingFields ? '…' : fields.length}</span>
              <button onClick={() => handleSetFieldCount(fields.length + 1)} disabled={fields.length >= 20 || savingFields}
                className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-sm font-bold text-muted-foreground hover:bg-secondary/70 disabled:opacity-30">+</button>
              <button onClick={() => setTatamiLocked(true)}
                className="flex h-6 w-6 items-center justify-center rounded text-sm text-secondary-foreground/80 transition hover:text-secondary-foreground" title="Blochează numărul de terenuri">🔒</button>
            </div>
          )}
        </div>
        <div className="border-b-2 border-border bg-accent px-3 py-2">
          <h3 className="text-sm font-bold text-accent-foreground uppercase tracking-wide">Nealocate</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button type="button" size="sm" disabled={!!autoBusy} onClick={handleAutoScheduleFields}>
              {autoBusy === 'fields' ? 'Se alocă…' : 'Mută categorii automat'}
            </Button>
            <Button type="button" size="sm" disabled={!!autoBusy} onClick={handleAutoAssignReferees}>
              {autoBusy === 'referees' ? 'Se alocă…' : 'Asignează arbitri automat'}
            </Button>
          </div>
        </div>
        {autoWarnings.length > 0 && (
          <div className="border-b-2 border-border bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">⚠️ De verificat manual:</p>
              <button type="button" onClick={() => setAutoWarnings([])} className="text-amber-700 hover:text-amber-900" title="Închide">✕</button>
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {autoWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
          <div className="flex-1 overflow-y-auto bg-accent/30 p-3 space-y-3">

          {/* Solo/Team categories */}
          {unassignedCats.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-muted-foreground uppercase tracking-wide">Tehnica ({unassignedCats.length})</p>
              {unassignedCats.map(cat => (
                <UnassignedCard key={cat.id} type="category" id={cat.id} data={cat} />
              ))}
            </div>
          )}

          {/* Fight matches */}
          {unassignedMatches.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-muted-foreground uppercase tracking-wide">Luptă ({unassignedMatches.length})</p>
              {unassignedMatches.map((match) => (
                <UnassignedCard
                  key={match.id}
                  type="match"
                  id={match.id}
                  data={match}
                />
              ))}
            </div>
          )}

          {unassignedCats.length === 0 && unassignedMatches.length === 0 && (
            <p className="py-4 text-center text-sm italic text-muted-foreground">✓ Totul este alocat!</p>
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
                  ? 'border-border bg-accent shadow-lg'
                  : 'border-border bg-card'
              }`}
              onDragOver={(e) => handleDragOver(e, field.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, field.id)}
            >
              {/* Field header — compact single row, styled like the Tehnica category cards */}
              <div className={`flex items-center gap-1.5 border-b border-sidebar-border px-2 py-1 ${isDragOver ? 'bg-secondary/70' : 'bg-secondary'}`}>
                <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">{formatFieldLabel(field.name)}</h3>
                <span className="text-xs text-secondary-foreground/70">🕐</span>
                {isEditingTime ? (
                  <input
                    type="time" autoFocus
                    className="w-20 border border-input bg-background px-1 py-0.5 text-xs text-foreground outline-none"
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
                    className="rounded border border-transparent px-1 py-0.5 text-xs text-secondary-foreground transition hover:border-border hover:bg-secondary/70"
                    title="Click pentru a seta ora de start"
                  >
                    {field.start_time ? formatTime(...field.start_time.split(':').map(Number)) : 'Setează ora'}
                  </button>
                )}
                {totalMin > 0 && (
                  <span className="text-xs text-secondary-foreground/70">
                    {endTime ? `→ ${formatTime(endTime.h, endTime.m)}` : `${Math.floor(totalMin / 60) > 0 ? `${Math.floor(totalMin / 60)}h ` : ''}${totalMin % 60}min`}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs font-semibold text-secondary-foreground/80">{items.length} probe</span>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto min-h-[120px] bg-accent/20 p-3">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
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
                        <div className="mx-1 my-1 h-0.5 bg-primary transition-all" />
                      )}
                      {/* Time indicator */}
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          {item.clockStart
                            ? <span className="font-semibold text-foreground">{formatTime(item.clockStart.h, item.clockStart.m)}</span>
                            : `+${item.startMin}′`
                          }
                        </span>
                        <div className="flex-1 border-t border-dashed border-border" />
                        {item.clockEnd && (
                          <span className="text-xs text-muted-foreground font-mono shrink-0">
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
                  <div className="mx-1 my-1 h-0.5 bg-primary transition-all" />
                )}
                {/* Add break button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addBreak(field.id)}
                  disabled={busy}
                  className="mt-1 w-full border-2 border-dashed border-border text-sm font-medium hover:bg-accent"
                >
                  ☕ + Pauză
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ CATEGORY DETAIL MODAL ═══ */}
      <Dialog open={!!detailModal} onOpenChange={(open) => { if (!open) { setDetailModal(null); setDetailScores([]); setDetailRefScores([]); } }}>
        <DialogContent className="flex max-h-[85vh] w-[90vw] max-w-4xl flex-col p-0">
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
              not_started: { label: 'Neînceput', bg: 'border border-border bg-muted text-muted-foreground', icon: '⏳' },
              in_progress: { label: 'În desfășurare', bg: 'border border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300', icon: '▶️' },
              finished: { label: 'Finalizat', bg: 'border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300', icon: '✅' },
            };
            const sd = STATUS_DISPLAY[catStatus];

            return (
              <>
                {/* Header */}
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                  <DialogTitle>{cat.name}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary">{TYPE_BADGES[cat.type]?.label}</Badge>
                    {cat.gender && (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-sm font-medium ${GENDER_BG[cat.gender] || 'bg-muted'} text-foreground`}>
                        {GENDER_LABELS[cat.gender]}
                      </span>
                    )}
                    {cat.groupName && <Badge variant="outline">{cat.groupName}</Badge>}
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-semibold ${sd.bg}`}>
                      {sd.icon} {sd.label}
                    </span>
                  </div>
                </DialogHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                  {/* Referees assigned */}
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">Arbitri asignați</h3>
                    <div className="flex gap-2 flex-wrap">
                      {refSlots.map(r => (
                        <div key={r.slot} className={`border px-3 py-2 text-sm ${
                          r.id ? 'border-border bg-accent font-medium text-accent-foreground' : 'border-border bg-card italic text-muted-foreground'
                        }`}>
                          R{r.slot}: {r.name || 'Neasignat'}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Athletes list */}
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">
                      Sportivi înscriși ({enrolled.length})
                    </h3>
                    {enrolled.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Niciun sportiv înscris</p>
                    ) : (
                      <div className="text-sm text-muted-foreground space-y-1">
                        {enrolled.map((ea, idx) => {
                          const ath = ea.athlete_details || ea;
                          return (
                            <div key={ath.id || idx} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted">
                              <span className="text-muted-foreground w-5 text-right font-mono text-sm">{idx + 1}.</span>
                              <span className="font-medium">{ath.last_name || ath.name || ''} {ath.first_name || ''}</span>
                              {ath.club_name && <span className="text-muted-foreground">({ath.club_name})</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Score matrix */}
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">Punctaje arbitri</h3>
                    {detailLoading ? (
                      <p className="text-sm text-muted-foreground italic">Se încarcă...</p>
                    ) : detailScores.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nu există punctaje încă</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-accent hover:bg-accent">
                            <TableHead className="text-accent-foreground">#</TableHead>
                            <TableHead className="text-accent-foreground">Sportiv</TableHead>
                            {activeRefs.map(r => (
                              <TableHead key={r.slot} className="min-w-[50px] text-center text-accent-foreground">
                                R{r.slot}
                              </TableHead>
                            ))}
                            <TableHead className="text-center text-accent-foreground">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
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
                              <TableRow key={as.id}>
                                <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell className="font-medium text-foreground">{athName}</TableCell>
                                {activeRefs.map(r => {
                                  const val = scores[r.id];
                                  const isMin = sortedVals.length >= 5 && val != null && Number(val) === sortedVals[0];
                                  const isMax = sortedVals.length >= 5 && val != null && Number(val) === sortedVals[sortedVals.length - 1];
                                  return (
                                    <TableCell key={r.slot} className={`text-center font-mono ${
                                      val == null ? 'text-muted-foreground/50' :
                                      isMin || isMax ? 'text-muted-foreground line-through' : 'text-foreground font-semibold'
                                    }`}>
                                      {val != null ? Number(val).toFixed(1) : '—'}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-bold text-foreground">
                                  {total != null ? total.toFixed(1) : '—'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!refPickerOpen} onOpenChange={(open) => { if (!open) { setRefPickerOpen(null); setReplacementRefId(''); } }}>
        <DialogContent className="max-w-md">
          {refPickerOpen && (() => {
            const currentRefId = refPickerOpen.refId || null;
            const availableReplacementRefs = (referees || []).filter((ref) => {
              if (!ref.id) return false;
              if (currentRefId && ref.id === currentRefId) return true;
              return ![1, 2, 3, 4, 5].some((slot) => {
                const ass = refPickerOpen.type === 'category' ? catRefMap[refPickerOpen.id] : matchRefMap[refPickerOpen.id];
                return ass?.[`referee_${slot}`] === ref.id;
              });
            });

            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {currentRefId ? `Înlocuiește arbitrul A${refPickerOpen.slot}` : `Adaugă arbitru pe poziția A${refPickerOpen.slot}`}
                  </DialogTitle>
                  <DialogDescription>Arbitrul curent: {refPickerOpen.refName || 'niciun arbitru'}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Alege alt arbitru</Label>
                  <Select
                    value={replacementRefId ? String(replacementRefId) : 'none'}
                    onValueChange={(value) => setReplacementRefId(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fără arbitru</SelectItem>
                      {availableReplacementRefs.map((ref) => {
                        const refConflict = refPickerOpen.fieldId != null && refPickerOpen.startMin != null && refPickerOpen.endMin != null
                          ? getRefereeConflict(ref.id, refPickerOpen.fieldId, refPickerOpen.startMin, refPickerOpen.endMin)
                          : null;
                        return (
                          <SelectItem key={ref.id} value={String(ref.id)}>
                            {ref.athlete_name}{refConflict ? ` — conflict ${refConflict.fieldName}` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setRefPickerOpen(null); setReplacementRefId(''); }}
                  >Anulează</Button>
                  <Button
                    type="button"
                    onClick={() => assignReferee(refPickerOpen.type, refPickerOpen.id, refPickerOpen.slot, replacementRefId ? Number(replacementRefId) : null)}
                    disabled={busy || (replacementRefId && Number(replacementRefId) === currentRefId)}
                  >
                    {replacementRefId ? (currentRefId ? 'Înlocuiește' : 'Adaugă') : 'Elimină arbitrul'}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!bracketPreviewCatId} onOpenChange={(open) => { if (!open) setBracketPreviewCatId(null); }}>
        <DialogContent className="flex max-h-[85vh] w-[90vw] max-w-5xl flex-col p-0">
          {bracketPreviewCatId && (() => {
            const cat = categoryMap.get(bracketPreviewCatId);
            const catMatches = (matchesByCat[bracketPreviewCatId] || [])
              .slice()
              .sort((a, b) => (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0) || (a.match_number || 0) - (b.match_number || 0));
            const byRound = catMatches.reduce((acc, match) => {
              const roundKey = match.round_number || 1;
              if (!acc[roundKey]) acc[roundKey] = [];
              acc[roundKey].push(match);
              return acc;
            }, {});
            const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
            if (!cat) return null;

            return (
              <>
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                  <DialogTitle>Piramidă · {cat.name}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {cat.groupName && <Badge variant="outline">{cat.groupName}</Badge>}
                    {cat.gender && <span className={`inline-block rounded px-1.5 py-0.5 text-sm font-medium ${GENDER_BG[cat.gender] || 'bg-muted'} text-foreground`}>{GENDER_LABELS[cat.gender] || cat.gender}</span>}
                    <Badge variant="outline">{catMatches.length} meciuri</Badge>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-5">
                  {catMatches.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">Nu există meciuri generate pentru această categorie.</p>
                  ) : (
                    <div className="flex min-w-max gap-4">
                      {rounds.map((round) => (
                        <div key={round} className="w-72 shrink-0">
                          <div className="mb-3 rounded-md border border-border bg-accent px-3 py-2 text-sm font-bold text-accent-foreground">
                            {ROUND_LABELS[byRound[round]?.[0]?.match_type] || `Runda ${round}`}
                          </div>
                          <div className="space-y-3">
                            {byRound[round].map((match) => (
                              <div key={match.id} className="rounded-md border border-border bg-card p-3 shadow-sm">
                                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="font-mono">ID {match.id}</span>
                                  {match.bracket_position != null ? <span>Poziția {match.bracket_position}</span> : null}
                                </div>
                                <div className="space-y-1.5 text-sm leading-snug">
                                  <div className="font-semibold text-red-600 whitespace-normal break-words">
                                    {match.red_corner_full_name || 'TBD'}
                                    {match.red_corner_club_name ? <span className="ml-1 font-normal text-muted-foreground">({match.red_corner_club_name})</span> : null}
                                  </div>
                                  <div className="font-semibold text-blue-600 whitespace-normal break-words">
                                    {match.blue_corner_full_name || 'TBD'}
                                    {match.blue_corner_club_name ? <span className="ml-1 font-normal text-muted-foreground">({match.blue_corner_club_name})</span> : null}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
