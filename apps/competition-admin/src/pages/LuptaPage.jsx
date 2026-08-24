import React, { useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import { fightWeightAPI, athleteAPI, enrollmentAPI, categoryAPI } from '@shared/lib/api';
import { formatGroupBadgeLabel } from '@shared/components/ui';

/* ═══════════════════════════════════════════════════════════════════
   LUPTA PAGE  –  Fight category weigh-in workflow
   Columns: Grupa | Categorie (KG) | Sportiv | Greutate Înregistrată |
            Greutate Zi Competiție | DQ | Motiv DQ | Acțiuni
   ═══════════════════════════════════════════════════════════════════ */
export default function LuptaPage() {
  const ctx = useContext(CentralizatorContext);
  if (!ctx) return null;

  const {
    columnStructure, busy,
    handleUnenroll, handleToggleEnroll,
    fightWeights, setFightWeights, fetchAll,
    groups, categories, clubs,
    eventDateStr,
    isEditLocked,
  } = ctx;

  /* ── inline editing state ── */
  const [editingCell, setEditingCell] = useState(null); // { id, field, value }
  const [activeStage, setActiveStage] = useState('pre'); // pre | enroll
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: '', minKg: '', maxKg: '' });
  const [confirmedWeights, setConfirmedWeights] = useState({});
  const [preAssignTargets, setPreAssignTargets] = useState({});
  const [preAssignManual, setPreAssignManual] = useState({});
  const [preSortField, setPreSortField] = useState('club'); // club | name
  const [preSortDir, setPreSortDir] = useState('asc'); // asc | desc
  const [manualEnrollOpen, setManualEnrollOpen] = useState(false);
  const [manualEnrollDraft, setManualEnrollDraft] = useState({ groupId: '', categoryId: '', athleteId: '', weight: '' });
  const [manualEnrollSearch, setManualEnrollSearch] = useState('');
  const [assignNotice, setAssignNotice] = useState('');
  const [athleteDrawer, setAthleteDrawer] = useState(null);

  /* ── enrollment picker state (local to Lupta page) ── */
  const [pickerCatId, setPickerCatId] = useState(null);
  const [groupPicker, setGroupPicker] = useState(null); // { groupId, gender }
  const [pickerSearch, setPickerSearch] = useState('');
  const [allAthletes, setAllAthletes] = useState([]);
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [fightGroupEnrollments, setFightGroupEnrollments] = useState([]);
  const [groupEnrollmentMode, setGroupEnrollmentMode] = useState('api');
  const [assignTargets, setAssignTargets] = useState({});
  const [editingGroupWeightId, setEditingGroupWeightId] = useState(null);
  const [groupWeightDraft, setGroupWeightDraft] = useState('');
  const pickerRef = useRef(null);
  const groupPickerRef = useRef(null);
  const pickerBtnRefs = useRef({});
  const groupPickerBtnRefs = useRef({});

  const ensureAthletesLoaded = useCallback(async () => {
    if (allAthletes.length === 0) {
      setLoadingAthletes(true);
      try {
        const res = await athleteAPI.list();
        const athletes = Array.isArray(res.data) ? res.data : res.data.results ?? [];
        setAllAthletes(athletes);
      } catch (err) { console.error('Failed to fetch athletes', err); }
      finally { setLoadingAthletes(false); }
    }
  }, [allAthletes.length]);

  const storageKey = `fight-group-enrollments:${ctx.eventId}`;
  const confirmedStorageKey = `fight-confirmed-weights:${ctx.eventId}`;
  const isNotFoundError = (err) => err?.response?.status === 404;

  const loadLocalEnrollments = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const saveLocalEnrollments = useCallback((items) => {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
    setFightGroupEnrollments(items);
  }, [storageKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(confirmedStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setConfirmedWeights(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setConfirmedWeights({});
    }
  }, [confirmedStorageKey]);

  const persistConfirmedWeights = useCallback((next) => {
    setConfirmedWeights(next);
    window.localStorage.setItem(confirmedStorageKey, JSON.stringify(next));
  }, [confirmedStorageKey]);

  const loadFightGroupEnrollments = useCallback(async () => {
    try {
      const res = await enrollmentAPI.fightGroupEnrollments.list({ event: ctx.eventId });
      const list = Array.isArray(res.data) ? res.data : res.data.results ?? [];
      setGroupEnrollmentMode('api');
      setFightGroupEnrollments(list);
    } catch (err) {
      if (isNotFoundError(err)) {
        setGroupEnrollmentMode('local');
        setFightGroupEnrollments(loadLocalEnrollments());
        return;
      }
      console.error('Failed to fetch fight group enrollments', err);
    }
  }, [ctx.eventId, loadLocalEnrollments]);

  useEffect(() => {
    if (!ctx.eventId) return;
    loadFightGroupEnrollments();
  }, [ctx.eventId, loadFightGroupEnrollments]);

  /* ── fetch all athletes once when picker opens ── */
  const openPicker = useCallback(async (catId, e) => {
    e.stopPropagation();
    if (pickerCatId === catId) { setPickerCatId(null); return; }
    setGroupPicker(null);
    setPickerCatId(catId);
    setPickerSearch('');
    await ensureAthletesLoaded();
  }, [pickerCatId, ensureAthletesLoaded]);

  const openGroupPicker = useCallback(async (groupId, gender, e) => {
    e.stopPropagation();
    if (groupPicker?.groupId === groupId && groupPicker?.gender === gender) {
      setGroupPicker(null);
      return;
    }
    setPickerCatId(null);
    setGroupPicker({ groupId, gender });
    setPickerSearch('');
    await ensureAthletesLoaded();
  }, [groupPicker, ensureAthletesLoaded]);

  /* ── close picker on outside click / Escape ── */
  useEffect(() => {
    const handleClick = (e) => {
      if (pickerCatId && pickerRef.current && !pickerRef.current.contains(e.target)) setPickerCatId(null);
      if (groupPicker && groupPickerRef.current && !groupPickerRef.current.contains(e.target)) setGroupPicker(null);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setPickerCatId(null);
        setGroupPicker(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [pickerCatId, groupPicker]);

  /* ── collect fight categories ── */
  const seenFightIds = new Set();
  const fightGroups = columnStructure
    .map(col => ({
      group: col.group,
      cats: col.cats.filter(c => {
        if (seenFightIds.has(c.id)) return false;
        if (c.type !== 'fight') return false;
        seenFightIds.add(c.id);
        return true;
      }),
    }))
    .filter(g => g.cats.length > 0);

  /* ── helper: find FightAthleteWeight record for a given cat+athlete ── */
  const findWeight = useCallback((categoryId, athleteId) => {
    return fightWeights.find(fw => fw.category === categoryId && fw.athlete === athleteId);
  }, [fightWeights]);

  /* ── create weight record if missing, then patch ── */
  const ensureAndPatch = useCallback(async (categoryId, athleteId, patchData) => {
    let record = findWeight(categoryId, athleteId);
    if (!record) {
      // Create a new FightAthleteWeight record
      try {
        const res = await fightWeightAPI.create({ category: categoryId, athlete: athleteId, ...patchData });
        setFightWeights(prev => [...prev, res.data]);
        return;
      } catch (err) {
        console.error('Create fight weight failed:', err);
        return;
      }
    }
    // Patch existing
    try {
      const res = await fightWeightAPI.update(record.id, patchData);
      setFightWeights(prev => prev.map(fw => fw.id === record.id ? res.data : fw));
    } catch (err) {
      console.error('Update fight weight failed:', err);
    }
  }, [findWeight, setFightWeights]);

  /* ── save inline edit ── */
  const handleSaveEdit = useCallback(async () => {
    if (!editingCell) return;
    const { categoryId, athleteId, field, value } = editingCell;
    setEditingCell(null);
    await ensureAndPatch(categoryId, athleteId, { [field]: value || null });
  }, [editingCell, ensureAndPatch]);

  /* ── toggle disqualified ── */
  const handleToggleDQ = useCallback(async (categoryId, athleteId, currentDQ) => {
    await ensureAndPatch(categoryId, athleteId, {
      is_disqualified: !currentDQ,
      ...(!currentDQ ? {} : { disqualification_reason: '' }),
    });
  }, [ensureAndPatch]);

  const toggleGroupEnrollment = useCallback(async (group, athlete, gender) => {
    const existing = fightGroupEnrollments.find((item) => item.group === group.id && item.athlete === athlete.id);
    if (groupEnrollmentMode === 'local') {
      if (existing) {
        const next = fightGroupEnrollments.filter((item) => item.id !== existing.id);
        saveLocalEnrollments(next);
        return;
      }
      const localItem = {
        id: `local-${Date.now()}-${athlete.id}`,
        event: Number(ctx.eventId),
        group: group.id,
        athlete: athlete.id,
        registered_weight_kg: null,
        notes: gender || '',
        athlete_details: athlete,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveLocalEnrollments([...fightGroupEnrollments, localItem]);
      return;
    }

    try {
      if (existing) {
        await enrollmentAPI.fightGroupEnrollments.delete(existing.id);
        setFightGroupEnrollments((prev) => prev.filter((item) => item.id !== existing.id));
        return;
      }

      const payload = {
        event: ctx.eventId,
        group: group.id,
        athlete: athlete.id,
        registered_weight_kg: null,
        notes: gender || '',
      };
      const { data } = await enrollmentAPI.fightGroupEnrollments.create(payload);
      setFightGroupEnrollments((prev) => [...prev, data]);
    } catch (err) {
      if (isNotFoundError(err)) {
        setGroupEnrollmentMode('local');
      } else {
        throw err;
      }
    }
  }, [fightGroupEnrollments, ctx.eventId, groupEnrollmentMode, saveLocalEnrollments]);

  const saveGroupWeight = useCallback(async (enrollmentId, draftValue) => {
    const nextValue = String(draftValue ?? '').trim();
    if (groupEnrollmentMode === 'local') {
      const next = fightGroupEnrollments.map((item) => (
        item.id === enrollmentId ? { ...item, registered_weight_kg: nextValue || null, updated_at: new Date().toISOString() } : item
      ));
      saveLocalEnrollments(next);
      return;
    }
    const payload = { registered_weight_kg: nextValue || null };
    try {
      const { data } = await enrollmentAPI.fightGroupEnrollments.update(enrollmentId, payload);
      setFightGroupEnrollments((prev) => prev.map((item) => (item.id === enrollmentId ? data : item)));
    } catch (err) {
      if (isNotFoundError(err)) {
        setGroupEnrollmentMode('local');
      } else {
        throw err;
      }
    }
  }, [fightGroupEnrollments, groupEnrollmentMode, saveLocalEnrollments]);

  const assignToCategory = useCallback(async (groupEnrollment, categoryId) => {
    if (!categoryId) return;

    const category = categories.find((cat) => cat.id === Number(categoryId));
    if (!category) return;

    const targetAthleteId = groupEnrollment.athlete;
    const sameGroupFightCategories = categories.filter((cat) => cat.type === 'fight' && cat.group === category.group);

    const existingEnrollment = sameGroupFightCategories
      .flatMap((cat) => (cat.enrolled_athletes || []).map((ea) => ({ catId: cat.id, ...ea })))
      .find((ea) => (ea.athlete_details?.id || ea.athlete) === targetAthleteId);

    if (existingEnrollment && existingEnrollment.catId !== category.id) {
      await enrollmentAPI.categoryAthletes.delete(existingEnrollment.id);
    }

    if (!existingEnrollment || existingEnrollment.catId !== category.id) {
      await enrollmentAPI.categoryAthletes.create({
        category: category.id,
        athlete: targetAthleteId,
        weight: groupEnrollment.registered_weight_kg || null,
      });
    } else {
      await enrollmentAPI.categoryAthletes.update(existingEnrollment.id, {
        weight: groupEnrollment.registered_weight_kg || null,
      });
    }

    if (groupEnrollment.registered_weight_kg) {
      await ensureAndPatch(category.id, targetAthleteId, { pre_weight_kg: groupEnrollment.registered_weight_kg });
    }

    await fetchAll();
  }, [categories, ensureAndPatch, fetchAll]);

  const parseCategoryBounds = useCallback((name) => {
    const text = String(name || '').toLowerCase().replace(/,/g, '.');
    const range = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*kg/i);
    if (range) {
      return { min: Number(range[1]), max: Number(range[2]) };
    }
    const plus = text.match(/\+(\d+(?:\.\d+)?)\s*kg/i);
    if (plus) {
      return { min: Number(plus[1]), max: Number.POSITIVE_INFINITY };
    }
    const under = text.match(/-(\d+(?:\.\d+)?)\s*kg/i);
    if (under) {
      return { min: Number.NEGATIVE_INFINITY, max: Number(under[1]) };
    }
    return null;
  }, []);

  const preEnrollmentRowsRaw = useMemo(() => {
    const map = new Map();
    fightGroups.forEach(({ group, cats }) => {
      cats.forEach((cat) => {
        (cat.enrolled_athletes || []).forEach((enrollment) => {
          const athleteId = enrollment.athlete_details?.id || enrollment.athlete;
          if (!athleteId) return;
          const key = `${group.id}-${athleteId}`;
          const existing = map.get(key);
          const athleteDetails = enrollment.athlete_details || existing?.athlete_details || null;
          const fw = findWeight(cat.id, athleteId);
          const submittedWeight = enrollment.weight ?? existing?.submitted_weight ?? '';
          const confirmedWeight = fw?.current_weight_kg ?? existing?.confirmed_weight ?? '';
          const row = {
            key,
            group_id: group.id,
            group_name: group.name,
            group_years: (group.birth_date_start && group.birth_date_end)
              ? `${new Date(group.birth_date_start).getFullYear()}-${new Date(group.birth_date_end).getFullYear()}`
              : ((group.birth_year_start && group.birth_year_end)
                ? `${group.birth_year_start}-${group.birth_year_end}`
                : ''),
            category_gender: cat.gender || 'mixt',
            athlete_id: athleteId,
            athlete_name: `${athleteDetails?.last_name || ''} ${athleteDetails?.first_name || ''}`.trim(),
            club_name: athleteDetails?.club?.name || '',
            athlete_details: athleteDetails,
            enrollment_id: enrollment.id,
            current_category_id: cat.id,
            current_category_name: cat.name,
            submitted_weight: submittedWeight,
            confirmed_weight: confirmedWeight,
          };
          if (!existing) {
            map.set(key, row);
          } else {
            map.set(key, {
              ...existing,
              submitted_weight: existing.submitted_weight || row.submitted_weight,
              confirmed_weight: existing.confirmed_weight || row.confirmed_weight,
            });
          }
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.group_name !== b.group_name) return a.group_name.localeCompare(b.group_name);
      return a.athlete_name.localeCompare(b.athlete_name);
    });
  }, [fightGroups, findWeight]);

  const preEnrollmentRows = useMemo(() => {
    const rows = [...preEnrollmentRowsRaw];
    rows.sort((a, b) => {
      const left = preSortField === 'club' ? (a.club_name || '') : (a.athlete_name || '');
      const right = preSortField === 'club' ? (b.club_name || '') : (b.athlete_name || '');
      const cmp = left.localeCompare(right, 'ro', { sensitivity: 'base' });
      if (cmp !== 0) return preSortDir === 'asc' ? cmp : -cmp;
      return a.athlete_name.localeCompare(b.athlete_name, 'ro', { sensitivity: 'base' });
    });
    return rows;
  }, [preEnrollmentRowsRaw, preSortField, preSortDir]);

  const getSuggestedCategoryId = useCallback((row) => {
    const candidates = categories.filter((cat) => {
      if (cat.type !== 'fight') return false;
      if (cat.group !== row.group_id) return false;
      const catGender = cat.gender || 'mixt';
      return catGender === 'mixt' || row.category_gender === 'mixt' || catGender === row.category_gender;
    });
    const confirmed = confirmedWeights[row.key];
    const weightRaw = confirmed ?? row.confirmed_weight ?? row.submitted_weight;
    const weight = Number(String(weightRaw || '').replace(',', '.'));
    if (!Number.isFinite(weight)) return '';

    const matches = candidates.filter((cat) => {
      const bounds = parseCategoryBounds(cat.name);
      if (!bounds) return false;
      return weight >= bounds.min && weight <= bounds.max;
    });
    if (!matches.length) return '';

    matches.sort((a, b) => {
      const ba = parseCategoryBounds(a.name);
      const bb = parseCategoryBounds(b.name);
      const wa = (Number.isFinite(ba?.max) ? ba.max : 9999) - (Number.isFinite(ba?.min) ? ba.min : 0);
      const wb = (Number.isFinite(bb?.max) ? bb.max : 9999) - (Number.isFinite(bb?.min) ? bb.min : 0);
      return wa - wb;
    });
    return matches[0]?.id || '';
  }, [categories, confirmedWeights, parseCategoryBounds]);

  useEffect(() => {
    if (activeStage !== 'pre') return;
    setPreAssignTargets((prev) => {
      let changed = false;
      const next = { ...prev };
      preEnrollmentRows.forEach((row) => {
        if (!(row.key in next)) {
          const suggested = getSuggestedCategoryId(row);
          next[row.key] = suggested ? String(suggested) : '';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [preEnrollmentRows, getSuggestedCategoryId, activeStage]);

  const saveSubmittedWeight = useCallback(async (row, value) => {
    await enrollmentAPI.categoryAthletes.update(row.enrollment_id, { weight: value || null });
    await fetchAll();
  }, [fetchAll]);

  const saveConfirmedWeight = useCallback(async (row, value) => {
    const next = { ...confirmedWeights, [row.key]: value || '' };
    persistConfirmedWeights(next);
    const record = findWeight(row.current_category_id, row.athlete_id);
    if (record) {
      try {
        const res = await fightWeightAPI.update(record.id, { current_weight_kg: value || null });
        setFightWeights((prev) => prev.map((fw) => (fw.id === record.id ? res.data : fw)));
      } catch {
        // Keep local confirmed value even if backend record update fails.
      }
    }
  }, [confirmedWeights, persistConfirmedWeights, findWeight, setFightWeights]);

  const assignPreRowToCategory = useCallback(async (row, targetCategoryId) => {
    if (!targetCategoryId) return;
    const targetId = Number(targetCategoryId);
    if (row.current_category_id !== targetId) {
      await enrollmentAPI.categoryAthletes.delete(row.enrollment_id);
      await enrollmentAPI.categoryAthletes.create({
        category: targetId,
        athlete: row.athlete_id,
        weight: row.submitted_weight || null,
      });
    } else {
      await enrollmentAPI.categoryAthletes.update(row.enrollment_id, {
        weight: row.submitted_weight || null,
      });
    }
    const confirmed = confirmedWeights[row.key] || null;
    if (confirmed) {
      await ensureAndPatch(targetId, row.athlete_id, { current_weight_kg: confirmed });
    }
    await fetchAll();
  }, [confirmedWeights, ensureAndPatch, fetchAll]);

  const togglePreSort = useCallback((field) => {
    if (preSortField === field) {
      setPreSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setPreSortField(field);
    setPreSortDir('asc');
  }, [preSortField]);

  const handleOpenManualEnroll = useCallback(async () => {
    await ensureAthletesLoaded();
    setManualEnrollOpen(true);
    setManualEnrollSearch('');
  }, [ensureAthletesLoaded]);

  const handleManualEnroll = useCallback(async () => {
    const categoryId = Number(manualEnrollDraft.categoryId);
    const athleteId = Number(manualEnrollDraft.athleteId);
    if (!categoryId || !athleteId) return;

    const targetCategory = categories.find((cat) => cat.id === categoryId);
    if (!targetCategory) return;

    const sameGroupFightCategories = categories.filter((cat) => cat.type === 'fight' && cat.group === targetCategory.group);
    const existingEnrollment = sameGroupFightCategories
      .flatMap((cat) => (cat.enrolled_athletes || []).map((ea) => ({ catId: cat.id, ...ea })))
      .find((ea) => (ea.athlete_details?.id || ea.athlete) === athleteId);

    const payloadWeight = manualEnrollDraft.weight ? String(manualEnrollDraft.weight).trim() : '';

    if (existingEnrollment && existingEnrollment.catId !== categoryId) {
      await enrollmentAPI.categoryAthletes.delete(existingEnrollment.id);
    }

    if (!existingEnrollment || existingEnrollment.catId !== categoryId) {
      await enrollmentAPI.categoryAthletes.create({
        category: categoryId,
        athlete: athleteId,
        weight: payloadWeight || null,
      });
    } else {
      await enrollmentAPI.categoryAthletes.update(existingEnrollment.id, {
        weight: payloadWeight || null,
      });
    }

    await fetchAll();
    const athlete = allAthletes.find((a) => a.id === athleteId);
    setAssignNotice(`Sportiv inscris: ${(athlete?.last_name || '').trim()} ${(athlete?.first_name || '').trim()} in ${targetCategory.name}.`);
    setManualEnrollOpen(false);
    setManualEnrollDraft({ groupId: '', categoryId: '', athleteId: '', weight: '' });
  }, [manualEnrollDraft, categories, fetchAll, allAthletes]);

  useEffect(() => {
    if (!assignNotice) return;
    const timer = window.setTimeout(() => setAssignNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [assignNotice]);

  const openAthleteDrawer = useCallback((athlete) => {
    if (!athlete) return;
    setAthleteDrawer(athlete);
  }, []);

  const closeAthleteDrawer = useCallback(() => {
    setAthleteDrawer(null);
  }, []);

  const formatBirthDateRo = useCallback((value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ro-RO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }, []);

  const formatAgeRo = useCallback((value) => {
    if (!value) return '—';
    const birthDate = new Date(value);
    if (Number.isNaN(birthDate.getTime())) return '—';

    const referenceDate = eventDateStr ? new Date(eventDateStr) : new Date();
    if (Number.isNaN(referenceDate.getTime())) return '—';
    if (birthDate > referenceDate) return '—';

    let years = referenceDate.getFullYear() - birthDate.getFullYear();
    let months = referenceDate.getMonth() - birthDate.getMonth();
    const days = referenceDate.getDate() - birthDate.getDate();

    if (days < 0) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    if (years < 0) return '—';
    const yearsLabel = years === 1 ? 'an' : 'ani';
    const monthsLabel = months === 1 ? 'luna' : 'luni';
    return `${years} ${yearsLabel} ${months} ${monthsLabel}`;
  }, [eventDateStr]);

  const athleteDrawerRows = useMemo(() => {
    if (!athleteDrawer) return [];
    return Object.entries(athleteDrawer)
      .filter(([key]) => key !== 'club')
      .map(([key, value]) => {
        if (key === 'date_of_birth') {
          return [key, formatBirthDateRo(value)];
        }
        if (value === null || value === undefined || value === '') {
          return [key, '—'];
        }
        if (Array.isArray(value)) {
          return [key, value.length ? value.join(', ') : '—'];
        }
        if (typeof value === 'object') {
          return [key, JSON.stringify(value)];
        }
        return [key, String(value)];
      });
  }, [athleteDrawer, formatBirthDateRo]);

  const parseWeightLimits = useCallback((name) => {
    const text = String(name || '');
    const rangeMatch = text.match(/(\d+(?:[\.,]\d+)?)\s*[-–]\s*(\d+(?:[\.,]\d+)?)\s*kg/i);
    if (rangeMatch) {
      return {
        minKg: rangeMatch[1].replace(',', '.'),
        maxKg: rangeMatch[2].replace(',', '.'),
      };
    }
    const underMatch = text.match(/-(\d+(?:[\.,]\d+)?)\s*kg/i);
    if (underMatch) {
      return {
        minKg: '',
        maxKg: underMatch[1].replace(',', '.'),
      };
    }
    return { minKg: '', maxKg: '' };
  }, []);

  const formatCategoryNameWithLimits = useCallback((baseName, minKg, maxKg) => {
    const cleanBase = String(baseName || '')
      .replace(/\s*\(?\d+(?:[\.,]\d+)?\s*[-–]\s*\d+(?:[\.,]\d+)?\s*kg\)?\s*/ig, ' ')
      .replace(/\s*-\s*\d+(?:[\.,]\d+)?\s*kg\s*/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (minKg && maxKg) return `${cleanBase} ${minKg}-${maxKg}kg`.trim();
    if (maxKg) return `${cleanBase} -${maxKg}kg`.trim();
    return cleanBase;
  }, []);

  const startCategoryEdit = useCallback((cat) => {
    const { minKg, maxKg } = parseWeightLimits(cat.name);
    setEditingCategoryId(cat.id);
    setCategoryDraft({ name: cat.name || '', minKg, maxKg });
  }, [parseWeightLimits]);

  const saveCategoryEdit = useCallback(async (cat) => {
    const finalName = formatCategoryNameWithLimits(
      categoryDraft.name,
      String(categoryDraft.minKg || '').trim(),
      String(categoryDraft.maxKg || '').trim(),
    );
    setEditingCategoryId(null);
    if (!finalName || finalName === cat.name) return;
    await categoryAPI.update(cat.id, { name: finalName });
    await fetchAll();
  }, [categoryDraft, fetchAll, formatCategoryNameWithLimits]);

  if (fightGroups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-400 text-sm italic p-4 text-center">
        <span>📋 Nu există categorii de tip Luptă. Creează-le din tab-ul Centralizator.</span>
      </div>
    );
  }

  const genderOrder = ['male', 'female', 'mixt'];

  return (
    <div className="flex-1 overflow-auto bg-white p-3 md:p-4">
      <div inert={isEditLocked ? '' : undefined} className={isEditLocked ? 'opacity-95' : ''}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveStage('pre')}
            className={`rounded border px-3 py-1.5 text-xs font-semibold ${
              activeStage === 'pre'
                ? 'border-yellow-500 bg-yellow-300 text-black'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Etapa 1 - Pre-inscriere
          </button>
          <button
            type="button"
            onClick={() => setActiveStage('enroll')}
            className={`rounded border px-3 py-1.5 text-xs font-semibold ${
              activeStage === 'enroll'
                ? 'border-yellow-500 bg-yellow-300 text-black'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Etapa 2 - Inscriere pe categorii
          </button>
          {activeStage === 'pre' && (
            <button
              type="button"
              onClick={handleOpenManualEnroll}
              className="ml-auto rounded border border-green-700 bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
            >
              Inscrie sportiv
            </button>
          )}
        </div>

        {activeStage === 'pre' && assignNotice && (
          <div className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
            {assignNotice}
          </div>
        )}

        {activeStage === 'pre' && (
          <div className="w-full overflow-x-auto border-2 border-black bg-white">
            <div className="border-b border-black bg-yellow-50 px-3 py-2 text-xs font-semibold text-gray-700">
              Etapa 1: Tabel unic pre-inscriere (sportivi inscrisi de antrenori la Lupta)
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-black bg-white px-3 py-2 text-xs">
              <span className="font-semibold text-gray-700">Sortare:</span>
              <button
                type="button"
                onClick={() => togglePreSort('club')}
                className={`rounded border px-2 py-1 ${preSortField === 'club' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'}`}
              >
                Club {preSortField === 'club' ? (preSortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                onClick={() => togglePreSort('name')}
                className={`rounded border px-2 py-1 ${preSortField === 'name' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'}`}
              >
                Nume {preSortField === 'name' ? (preSortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
            </div>
            <table className="w-full border-collapse text-sm" style={{ minWidth: '980px' }}>
              <thead>
                <tr>
                  <TH>Grupa</TH>
                  <TH>Gen</TH>
                  <TH>Nume sportiv + club</TH>
                  <TH>Varsta</TH>
                  <TH small>Greutate trimisa</TH>
                  <TH small>Greutate confirmata cantar</TH>
                  <TH>Categorie sugerata</TH>
                  <TH>Categorie selectata</TH>
                  <TH></TH>
                </tr>
              </thead>
              <tbody>
                {preEnrollmentRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-black px-3 py-3 text-center text-xs italic text-gray-500">
                      Nu exista sportivi inscrisi la Lupta de catre antrenori.
                    </td>
                  </tr>
                ) : (
                  preEnrollmentRows.map((row) => {
                    const suggestedId = getSuggestedCategoryId(row);
                    const isManualSelection = preAssignManual[row.key] === true;
                    const selectedTarget = isManualSelection
                      ? (preAssignTargets[row.key] || '')
                      : (suggestedId ? String(suggestedId) : '');
                    const options = categories.filter((cat) => (
                      cat.type === 'fight' && cat.group === row.group_id
                    ));
                    const confirmedVal = confirmedWeights[row.key] ?? row.confirmed_weight ?? '';
                    const athleteLabel = row.club_name ? `${row.athlete_name} (${row.club_name})` : row.athlete_name;
                    const groupLabel = row.group_years ? `${row.group_name} (${row.group_years})` : row.group_name;
                    return (
                      <tr key={`pre-row-${row.key}`}>
                        <td className="border border-black px-2 py-1 text-xs text-gray-700">{groupLabel}</td>
                        <td className="border border-black px-2 py-1 text-xs text-gray-700">{GENDER_LABELS[row.category_gender] || row.category_gender}</td>
                        <td className="border border-black px-2 py-1 text-sm text-gray-900">
                          <button
                            type="button"
                            onClick={() => openAthleteDrawer(row.athlete_details)}
                            className="text-left text-blue-700 underline-offset-2 hover:underline"
                          >
                            {athleteLabel}
                          </button>
                        </td>
                        <td className="border border-black px-2 py-1 text-xs text-gray-700">{formatAgeRo(row.athlete_details?.date_of_birth)}</td>
                        <td className="border border-black px-1 py-1 text-center text-xs">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={row.submitted_weight || ''}
                            readOnly
                            className="w-20 cursor-not-allowed rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center text-xs text-gray-700"
                          />
                        </td>
                        <td className="border border-black px-1 py-1 text-center text-xs">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={confirmedVal}
                            onChange={(event) => persistConfirmedWeights({ ...confirmedWeights, [row.key]: event.target.value })}
                            onBlur={async (event) => {
                              await saveConfirmedWeight(row, event.target.value);
                            }}
                            className="w-20 rounded border border-gray-300 px-1 py-0.5 text-center text-xs"
                          />
                        </td>
                        <td className="border border-black px-2 py-1 text-xs text-blue-700">
                          {suggestedId ? (categories.find((cat) => cat.id === suggestedId)?.name || '—') : 'Fara sugestie'}
                        </td>
                        <td className="border border-black px-1 py-1 text-xs">
                          <select
                            value={selectedTarget}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setPreAssignTargets((prev) => ({ ...prev, [row.key]: nextValue }));
                              setPreAssignManual((prev) => ({ ...prev, [row.key]: nextValue !== '' }));
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Selecteaza categoria</option>
                            {options.map((cat) => (
                              <option key={`pre-opt-${row.key}-${cat.id}`} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border border-black px-1 py-1 text-center">
                          <button
                            type="button"
                            disabled={!selectedTarget || busy}
                            onClick={async () => {
                              const targetId = Number(selectedTarget);
                              const targetCat = categories.find((cat) => cat.id === targetId);
                              const athleteLabel = row.athlete_name || 'sportivul selectat';
                              const targetLabel = targetCat?.name || 'categoria selectata';
                              const ok = window.confirm(`Confirmi repartizarea lui ${athleteLabel} la ${targetLabel}?`);
                              if (!ok) return;
                              await assignPreRowToCategory(row, selectedTarget);
                              setAssignNotice(`${athleteLabel} a fost repartizat la ${targetLabel}.`);
                            }}
                            className="rounded border border-blue-600 bg-blue-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
                          >
                            Repartizeaza
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeStage === 'enroll' && fightGroups.map(({ group, cats }) => {
          const catsByGender = {};
          for (const cat of cats) {
            const g = cat.gender || 'mixt';
            if (!catsByGender[g]) catsByGender[g] = [];
            catsByGender[g].push(cat);
          }

          return (
            <div key={`fight-${group.id}`} className="mb-8 space-y-4">
              {genderOrder.filter(g => catsByGender[g]).map(gender => {
                const genderCats = catsByGender[gender];
                const groupRegistrations = fightGroupEnrollments
                  .filter((item) => item.group === group.id)
                  .filter((item) => {
                    const athleteGender = item.athlete_details?.gender;
                    if (!athleteGender || gender === 'mixt') return true;
                    return athleteGender === gender;
                  })
                  .sort((a, b) => {
                    const an = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                    const bn = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                    return an.localeCompare(bn);
                  });
                const flatRows = [];
                for (const cat of genderCats) {
                  const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
                    const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                    const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                    return na.localeCompare(nb);
                  });
                  const catLabel = cat.name
                    .replace(/ - (Masculin|Feminin|Mixt)/i, '')
                    .replace(/Đối Kháng\s*/i, '').trim() || cat.name;

                  const catRowSpan = Math.max(enrolled.length, 1) + 1;
                  if (enrolled.length === 0) {
                    flatRows.push({
                      cat, catLabel, enrollment: null, enrolledCount: 0,
                      isFirstInCat: true, catRowSpan,
                    });
                  } else {
                    enrolled.forEach((enrollment, idx) => {
                      flatRows.push({
                        cat, catLabel, enrollment, enrolledCount: enrolled.length,
                        isFirstInCat: idx === 0, catRowSpan,
                      });
                    });
                  }
                  // permanent add row
                  flatRows.push({
                    cat, catLabel, enrollment: null, enrolledCount: 0,
                    isFirstInCat: false, isAddRow: true,
                  });
                }

                return (
                  <div key={`${group.id}-${gender}`} className="space-y-3">
                  {activeStage === 'enroll' && (
                  <div className="w-full overflow-x-auto border-2 border-black bg-white">
                  <table className="w-full border-collapse text-sm" style={{ minWidth: '700px' }}>
                    <colgroup>
                      <col className="w-[100px]" />{/* CATEGORIE */}
                      <col />{/* NUME - flex */}
                      <col className="w-[80px]" />{/* GREUTATE ÎNR */}
                      <col className="w-[80px]" />{/* GREUTATE ZI */}
                      <col className="w-[36px]" />{/* DQ */}
                      <col className="w-[110px]" />{/* MOTIV */}
                      <col className="w-[30px]" />{/* ACȚIUNI */}
                    </colgroup>
                    <thead>
                      <tr>
                        <th colSpan={7}
                          className="bg-yellow-300 border border-black px-2 sm:px-3 py-1.5 text-center font-bold text-sm text-gray-900">
                          {group.name}
                          {(group.birth_date_start || group.birth_year_start) && (
                            <span className="font-normal ml-1">
                              ( {group.birth_date_start
                                ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
                                : `${group.birth_year_start}–${group.birth_year_end}`} )
                            </span>
                          )}
                          {group.allowed_grade_type === 'inferior' && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/20 text-amber-800 text-[8px] font-medium px-1.5 py-0.5" title="Doar grade inferioare (gradele superioare nu au voie)">
                              Grade inferioare
                            </span>
                          )}
                          {group.allowed_grade_type === 'superior' && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-800 text-[8px] font-medium px-1.5 py-0.5" title="Doar grade superioare">
                              Grade superioare
                            </span>
                          )}
                        </th>
                      </tr>
                      <tr>
                        <th colSpan={7}
                          className={`border border-black px-3 py-1 text-center font-bold text-sm uppercase tracking-wide ${
                            gender === 'male' ? 'bg-blue-200 text-blue-900'
                            : gender === 'female' ? 'bg-pink-200 text-pink-900'
                            : 'bg-amber-200 text-amber-900'
                          }`}>
                          {GENDER_LABELS[gender]}
                        </th>
                      </tr>
                      <tr>
                        <TH>CATEGORIE (KG)</TH>
                        <TH>NUME PRACTICANT</TH>
                        <TH small>GREUTATE<br/>ÎNREG.</TH>
                        <TH small>GREUTATE<br/>ZI COMP.</TH>
                        <TH>DQ</TH>
                        <TH>MOTIV DQ</TH>
                        <TH></TH>
                      </tr>
                    </thead>
                    <tbody>
                      {flatRows.map((row, ri) => {
                        if (row.isAddRow) {
                          return (
                            <tr key={`add-${ri}`} className="hover:bg-green-50/30">
                              {/* NUME PRACTICANT — add button */}
                              <td className="border border-black px-2 py-1 text-sm border-b-2 border-b-black"
                                ref={el => { pickerBtnRefs.current[row.cat.id] = el; }}
                              >
                                <button
                                  onClick={(e) => openPicker(row.cat.id, e)}
                                  disabled={busy}
                                  className="frvv-btn-add !px-3 !py-1 text-xs disabled:opacity-40"
                                  title="Adaugă sportiv în categorie"
                                >
                                  <span className="frvv-btn-add-icon">+</span>
                                  Adaugă sportiv
                                </button>
                              </td>
                              {/* GREUTATE ÎNREGISTRATĂ */}
                              <td className="border border-black border-b-2 border-b-black"></td>
                              {/* GREUTATE ZI COMPETIȚIE */}
                              <td className="border border-black border-b-2 border-b-black"></td>
                              {/* DQ */}
                              <td className="border border-black border-b-2 border-b-black"></td>
                              {/* MOTIV DQ */}
                              <td className="border border-black border-b-2 border-b-black"></td>
                              {/* ACȚIUNI */}
                              <td className="border border-black border-b-2 border-b-black"></td>
                            </tr>
                          );
                        }
                        const a = row.enrollment?.athlete_details;
                        const athleteId = row.enrollment?.athlete;
                        const name = a ? `${a.last_name || ''} ${a.first_name || ''}`.trim() : '';
                        const club = a?.club?.name || '';
                        const enrollId = row.enrollment?.id;

                        // FightAthleteWeight record for this athlete+category
                        const fw = athleteId ? findWeight(row.cat.id, athleteId) : null;
                        // Fall back to enrollment.weight (set by coach on enrollment) if no FightAthleteWeight record
                        const preW = fw?.pre_weight_kg ?? row.enrollment?.weight ?? '';
                        const dayW = fw?.current_weight_kg ?? '';
                        const isDQ = fw?.is_disqualified ?? false;
                        const dqReason = fw?.disqualification_reason ?? '';

                        const isEditingPre = editingCell?.categoryId === row.cat.id && editingCell?.athleteId === athleteId && editingCell?.field === 'pre_weight_kg';
                        const isEditingDay = editingCell?.categoryId === row.cat.id && editingCell?.athleteId === athleteId && editingCell?.field === 'current_weight_kg';
                        const isEditingReason = editingCell?.categoryId === row.cat.id && editingCell?.athleteId === athleteId && editingCell?.field === 'disqualification_reason';

                        const strongTopBorder = row.isFirstInCat ? 'border-t-2 border-t-black' : '';

                        return (
                          <tr key={ri} className={isDQ ? 'bg-red-50' : ''}>
                            {/* CATEGORIE */}
                            {row.isFirstInCat && (
                              <td className="border border-black px-2 py-1 text-center text-xs font-semibold text-gray-900 bg-gray-50 relative"
                                rowSpan={row.catRowSpan}
                              >
                                {editingCategoryId === row.cat.id ? (
                                  <div className="space-y-1 text-left">
                                    <input
                                      type="text"
                                      value={categoryDraft.name}
                                      onChange={(event) => setCategoryDraft((prev) => ({ ...prev, name: event.target.value }))}
                                      className="w-full rounded border border-gray-300 px-1 py-0.5 text-[10px]"
                                      placeholder="Nume categorie"
                                    />
                                    <div className="grid grid-cols-2 gap-1">
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={categoryDraft.minKg}
                                        onChange={(event) => setCategoryDraft((prev) => ({ ...prev, minKg: event.target.value }))}
                                        className="w-full rounded border border-gray-300 px-1 py-0.5 text-[10px]"
                                        placeholder="Min kg"
                                      />
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={categoryDraft.maxKg}
                                        onChange={(event) => setCategoryDraft((prev) => ({ ...prev, maxKg: event.target.value }))}
                                        className="w-full rounded border border-gray-300 px-1 py-0.5 text-[10px]"
                                        placeholder="Max kg"
                                      />
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await saveCategoryEdit(row.cat);
                                        }}
                                        className="rounded border border-blue-600 bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                      >
                                        Salveaza
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingCategoryId(null)}
                                        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700"
                                      >
                                        Anuleaza
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {row.catLabel}
                                    <button
                                      type="button"
                                      onClick={() => startCategoryEdit(row.cat)}
                                      className="ml-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                                    >
                                      Edit
                                    </button>
                                    {row.cat.birth_year_start && row.cat.birth_year_end && (
                                      <span className="block text-[8px] text-blue-400 font-normal">
                                        ({row.cat.birth_year_start}–{row.cat.birth_year_end})
                                      </span>
                                    )}
                                    <span className={`mt-0.5 block text-[9px] ${row.enrolledCount < 3 ? 'font-semibold text-red-600' : 'text-gray-400'}`}>
                                      {row.enrolledCount} sportiv{row.enrolledCount !== 1 ? 'i' : ''}
                                    </span>
                                  </>
                                )}
                              </td>
                            )}
                            {/* NUME PRACTICANT */}
                            <td className={`border border-black px-2 py-1 text-sm ${strongTopBorder} ${isDQ ? 'line-through text-red-400' : 'text-gray-900'}`}>
                              <button
                                type="button"
                                onClick={() => openAthleteDrawer(a)}
                                className="block w-full truncate text-left text-blue-700 underline-offset-2 hover:underline"
                              >
                                {name}
                                {club && name && <span className="text-gray-500 ml-1">({club})</span>}
                              </button>
                            </td>
                            {/* GREUTATE ÎNREGISTRATĂ */}
                            <td className={`border border-black px-1 py-0.5 text-center text-xs text-gray-900 font-medium whitespace-nowrap ${strongTopBorder}`}
                              onDoubleClick={() => athleteId && setEditingCell({ categoryId: row.cat.id, athleteId, field: 'pre_weight_kg', value: preW.toString() })}>
                              {athleteId ? (
                                isEditingPre ? (
                                  <InlineInput
                                    value={editingCell.value}
                                    onChange={v => setEditingCell(prev => ({ ...prev, value: v }))}
                                    onSave={handleSaveEdit}
                                    onCancel={() => setEditingCell(null)}
                                  />
                                ) : (
                                  <span className="cursor-pointer hover:bg-blue-50 px-1 rounded" title="Dublu-click pentru a edita">
                                    {preW || '–'}
                                  </span>
                                )
                              ) : null}
                            </td>
                            {/* GREUTATE ZI COMPETIȚIE */}
                            <td className={`border border-black px-1 py-0.5 text-center text-xs font-medium whitespace-nowrap ${strongTopBorder}`}
                              onDoubleClick={() => athleteId && setEditingCell({ categoryId: row.cat.id, athleteId, field: 'current_weight_kg', value: dayW.toString() })}>
                              {athleteId ? (
                                isEditingDay ? (
                                  <InlineInput
                                    value={editingCell.value}
                                    onChange={v => setEditingCell(prev => ({ ...prev, value: v }))}
                                    onSave={handleSaveEdit}
                                    onCancel={() => setEditingCell(null)}
                                  />
                                ) : (
                                  <WeightCell preW={preW} dayW={dayW}
                                    onClick={() => athleteId && setEditingCell({ categoryId: row.cat.id, athleteId, field: 'current_weight_kg', value: dayW.toString() })}
                                  />
                                )
                              ) : null}
                            </td>
                            {/* DQ */}
                            <td className={`border border-black px-0.5 py-0.5 text-center ${strongTopBorder}`}>
                              {athleteId && (
                                <input
                                  type="checkbox"
                                  checked={isDQ}
                                  onChange={() => handleToggleDQ(row.cat.id, athleteId, isDQ)}
                                  className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
                                  title={isDQ ? 'Descalifică sportivul' : 'Marchează ca descalificat'}
                                />
                              )}
                            </td>
                            {/* MOTIV DQ */}
                            <td className={`border border-black px-1 py-0.5 text-xs text-gray-700 ${strongTopBorder}`}
                              onDoubleClick={() => athleteId && isDQ && setEditingCell({ categoryId: row.cat.id, athleteId, field: 'disqualification_reason', value: dqReason })}>
                              {athleteId && isDQ ? (
                                isEditingReason ? (
                                  <InlineInput
                                    value={editingCell.value}
                                    onChange={v => setEditingCell(prev => ({ ...prev, value: v }))}
                                    onSave={handleSaveEdit}
                                    onCancel={() => setEditingCell(null)}
                                    wide
                                  />
                                ) : (
                                  <span className="cursor-pointer hover:bg-yellow-50 px-1 rounded text-red-500" title="Dublu-click pentru a edita motivul">
                                    {dqReason || '(click pt motiv)'}
                                  </span>
                                )
                              ) : null}
                            </td>
                            {/* ACȚIUNI */}
                            <td className={`w-[44px] border border-black px-0.5 py-0.5 text-center ${strongTopBorder}`}>
                              {enrollId && (
                                <button
                                  onClick={(e) => handleUnenroll(enrollId, name, row.cat.name, e)}
                                  disabled={busy}
                                  className="inline-flex h-11 w-11 items-center justify-center border border-red-700 bg-red-500 text-base font-black leading-none text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                                  title="Scoate sportivul din categorie"
                                >×</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ═══ GROUP PRE-ENROLLMENT PICKER ═══ */}
      {groupPicker && (() => {
        const group = groups.find((g) => g.id === groupPicker.groupId);
        const dateStart = group?.birth_date_start || (group?.birth_year_start ? `${group.birth_year_start}-01-01` : null);
        const dateEnd = group?.birth_date_end || (group?.birth_year_end ? `${group.birth_year_end}-12-31` : null);
        const hasDateRange = dateStart && dateEnd;
        const allowYounger = group?.allow_younger || false;

        const registeredIds = new Set(
          fightGroupEnrollments
            .filter((item) => item.group === groupPicker.groupId)
            .map((item) => item.athlete)
        );

        let filtered = hasDateRange
          ? allAthletes.filter((ath) => {
              if (!ath.date_of_birth) return false;
              if (ath.date_of_birth < dateStart) return false;
              if (!allowYounger && ath.date_of_birth > dateEnd) return false;
              return true;
            })
          : allAthletes;

        if (groupPicker.gender && groupPicker.gender !== 'mixt') {
          filtered = filtered.filter((ath) => !ath.gender || ath.gender === groupPicker.gender);
        }

        const q = pickerSearch.toLowerCase();
        if (q) {
          filtered = filtered.filter((ath) => {
            const name = `${ath.last_name || ''} ${ath.first_name || ''}`.toLowerCase();
            const club = (ath.club?.name || '').toLowerCase();
            return name.includes(q) || club.includes(q);
          });
        }

        filtered.sort((a, b) => {
          const ae = registeredIds.has(a.id) ? 0 : 1;
          const be = registeredIds.has(b.id) ? 0 : 1;
          if (ae !== be) return ae - be;
          const na = `${a.last_name || ''} ${a.first_name || ''}`;
          const nb = `${b.last_name || ''} ${b.first_name || ''}`;
          return na.localeCompare(nb);
        });

        const btnEl = groupPickerBtnRefs.current[`${groupPicker.groupId}-${groupPicker.gender}`];
        const rect = btnEl?.getBoundingClientRect();
        const top = rect ? Math.min(rect.bottom + 4, window.innerHeight - 420) : 100;
        const left = rect ? Math.min(rect.left, window.innerWidth - 320) : 100;

        return (
          <div
            ref={groupPickerRef}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[110] w-80 overflow-hidden border-2 border-black bg-white"
            style={{ top, left }}
          >
            <div className="border-b-2 border-black bg-yellow-300 px-3 py-3">
              <p className="truncate text-sm font-black uppercase tracking-wide text-gray-900">Etapa de pre-inscriere</p>
              <div className="mt-1 text-xs text-gray-800">
                {group?.name || 'Grupa'} - {GENDER_LABELS[groupPicker.gender] || groupPicker.gender}
              </div>
              {hasDateRange && (
                <p className="mt-2 text-xs text-gray-700">
                  Nascuti {dateStart} - {allowYounger ? 'inf (tineri acceptati)' : dateEnd}
                </p>
              )}
            </div>
            <div className="border-b border-black/10 px-3 py-2">
              <input
                type="text"
                autoFocus
                placeholder="Cauta sportiv sau club..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="frvv-input w-full text-sm"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {loadingAthletes ? (
                <div className="p-6 text-center text-sm text-gray-500 animate-pulse">Se incarca...</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500 italic">Niciun sportiv disponibil.</div>
              ) : (
                filtered.map((ath) => {
                  const isRegistered = registeredIds.has(ath.id);
                  return (
                    <button
                      key={`group-pick-${ath.id}`}
                      onClick={async () => {
                        await toggleGroupEnrollment(group, ath, groupPicker.gender);
                      }}
                      disabled={busy}
                      className={`flex w-full items-center gap-3 border-b border-black/10 px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                        isRegistered ? 'bg-green-50 hover:bg-green-100 text-gray-800' : 'hover:bg-yellow-50 text-gray-700'
                      }`}
                    >
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center border text-sm font-bold ${
                        isRegistered ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent'
                      }`}>✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{ath.last_name} {ath.first_name}</span>
                        <span className="block truncate text-xs text-gray-500">{ath.club?.name || 'Fara club'}{ath.date_of_birth ? ` · ${ath.date_of_birth}` : ''}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-black/10 bg-yellow-50 px-3 py-2">
              <span className="text-xs text-gray-600">{filtered.length} sportivi disponibili</span>
              <button onClick={() => setGroupPicker(null)} className="frvv-btn-secondary px-3 py-1.5 text-xs">Inchide</button>
            </div>
          </div>
        );
      })()}

      {manualEnrollOpen && (() => {
        const selectedGroupId = Number(manualEnrollDraft.groupId || 0);
        const selectedGroup = groups.find((g) => g.id === selectedGroupId);
        const availableCategories = categories
          .filter((cat) => cat.type === 'fight' && (!selectedGroupId || cat.group === selectedGroupId))
          .sort((a, b) => a.name.localeCompare(b.name, 'ro', { sensitivity: 'base' }));
        const selectedCategoryId = Number(manualEnrollDraft.categoryId || 0);
        const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId);

        const dateStart = selectedGroup?.birth_date_start || (selectedGroup?.birth_year_start ? `${selectedGroup.birth_year_start}-01-01` : null);
        const dateEnd = selectedGroup?.birth_date_end || (selectedGroup?.birth_year_end ? `${selectedGroup.birth_year_end}-12-31` : null);
        const hasDateRange = dateStart && dateEnd;
        const allowYounger = selectedGroup?.allow_younger || false;

        let athleteOptions = hasDateRange
          ? allAthletes.filter((ath) => {
              if (!ath.date_of_birth) return false;
              if (ath.date_of_birth < dateStart) return false;
              if (!allowYounger && ath.date_of_birth > dateEnd) return false;
              return true;
            })
          : allAthletes;

        if (selectedCategory?.gender && selectedCategory.gender !== 'mixt') {
          athleteOptions = athleteOptions.filter((ath) => !ath.gender || ath.gender === selectedCategory.gender);
        }

        const q = manualEnrollSearch.toLowerCase();
        if (q) {
          athleteOptions = athleteOptions.filter((ath) => {
            const fullName = `${ath.last_name || ''} ${ath.first_name || ''}`.toLowerCase();
            const clubName = (ath.club?.name || '').toLowerCase();
            return fullName.includes(q) || clubName.includes(q);
          });
        }

        athleteOptions.sort((a, b) => {
          const na = `${a.last_name || ''} ${a.first_name || ''}`;
          const nb = `${b.last_name || ''} ${b.first_name || ''}`;
          return na.localeCompare(nb, 'ro', { sensitivity: 'base' });
        });

        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => setManualEnrollOpen(false)}>
            <div className="w-full max-w-2xl overflow-hidden rounded border-2 border-black bg-white" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-black bg-yellow-200 px-4 py-3 text-sm font-bold text-gray-900">Inscriere manuala sportiv in pre-inscriere</div>
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Grupa</label>
                  <select
                    value={manualEnrollDraft.groupId}
                    onChange={(e) => setManualEnrollDraft((prev) => ({ ...prev, groupId: e.target.value, categoryId: '', athleteId: '' }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecteaza grupa</option>
                    {groups.map((g) => (
                      <option key={`manual-group-${g.id}`} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Categorie</label>
                  <select
                    value={manualEnrollDraft.categoryId}
                    onChange={(e) => setManualEnrollDraft((prev) => ({ ...prev, categoryId: e.target.value, athleteId: '' }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecteaza categoria</option>
                    {availableCategories.map((cat) => (
                      <option key={`manual-cat-${cat.id}`} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Cauta sportiv (nume/club)</label>
                  <input
                    type="text"
                    value={manualEnrollSearch}
                    onChange={(e) => setManualEnrollSearch(e.target.value)}
                    placeholder="Ex: Popescu / Club ..."
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Sportiv</label>
                  <select
                    value={manualEnrollDraft.athleteId}
                    onChange={(e) => setManualEnrollDraft((prev) => ({ ...prev, athleteId: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecteaza sportiv</option>
                    {athleteOptions.map((ath) => (
                      <option key={`manual-ath-${ath.id}`} value={ath.id}>{ath.last_name} {ath.first_name} - {ath.club?.name || 'Fara club'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Greutate trimisa (optional)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={manualEnrollDraft.weight}
                    onChange={(e) => setManualEnrollDraft((prev) => ({ ...prev, weight: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-black/20 bg-gray-50 px-4 py-3">
                <button type="button" onClick={() => setManualEnrollOpen(false)} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Renunta</button>
                <button
                  type="button"
                  disabled={!manualEnrollDraft.categoryId || !manualEnrollDraft.athleteId || busy}
                  onClick={async () => { await handleManualEnroll(); }}
                  className="rounded border border-green-700 bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Inscrie sportiv
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ ENROLLMENT PICKER POPOVER ═══ */}
      {pickerCatId && (() => {
        const cat = categories.find(c => c.id === pickerCatId);
        const catName = cat?.name || '—';
        const group = groups.find(g => g.id === cat?.group);
        const groupLabel = formatGroupBadgeLabel(group, cat);
        const dateStart = group?.birth_date_start || (group?.birth_year_start ? `${group.birth_year_start}-01-01` : null);
        const dateEnd = group?.birth_date_end || (group?.birth_year_end ? `${group.birth_year_end}-12-31` : null);
        const hasDateRange = dateStart && dateEnd;
        const allowYounger = group?.allow_younger || false;

        const enrolledIds = new Set(
          (cat?.enrolled_athletes || []).map(ea => ea.athlete_details?.id || ea.athlete)
        );

        // filter by age range
        let filtered = hasDateRange
          ? allAthletes.filter(ath => {
              if (!ath.date_of_birth) return false;
              if (ath.date_of_birth < dateStart) return false;
              if (!allowYounger && ath.date_of_birth > dateEnd) return false;
              return true;
            })
          : allAthletes;

        // filter by gender if category has one
        const catGender = cat?.gender;
        if (catGender && catGender !== 'mixt') {
          filtered = filtered.filter(ath => !ath.gender || ath.gender === catGender);
        }

        // search filter
        const q = pickerSearch.toLowerCase();
        if (q) {
          filtered = filtered.filter(ath => {
            const name = `${ath.last_name || ''} ${ath.first_name || ''}`.toLowerCase();
            const club = (ath.club?.name || '').toLowerCase();
            return name.includes(q) || club.includes(q);
          });
        }

        // sort: enrolled first, then alphabetically
        filtered.sort((a, b) => {
          const ae = enrolledIds.has(a.id) ? 0 : 1;
          const be = enrolledIds.has(b.id) ? 0 : 1;
          if (ae !== be) return ae - be;
          const na = `${a.last_name || ''} ${a.first_name || ''}`;
          const nb = `${b.last_name || ''} ${b.first_name || ''}`;
          return na.localeCompare(nb);
        });

        // position near the button
        const btnEl = pickerBtnRefs.current[pickerCatId];
        const rect = btnEl?.getBoundingClientRect();
        const top = rect ? Math.min(rect.bottom + 4, window.innerHeight - 400) : 100;
        const left = rect ? Math.min(rect.left, window.innerWidth - 300) : 100;

        return (
          <div ref={pickerRef}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[100] w-80 overflow-hidden border-2 border-black bg-white"
            style={{ top, left }}
          >
            <div className="border-b-2 border-black bg-yellow-300 px-3 py-3">
              <p className="truncate text-sm font-black uppercase tracking-wide text-gray-900">
                Adaugă sportivi
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                {groupLabel && <span className="frvv-chip">{groupLabel}</span>}
                <span className="frvv-chip">{catName}</span>
              </div>
              {hasDateRange && (
                <p className="mt-2 text-xs text-gray-700">
                  Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                </p>
              )}
            </div>
            <div className="border-b border-black/10 px-3 py-2">
              <input
                type="text"
                autoFocus
                placeholder="Caută sportiv sau club…"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                className="frvv-input w-full text-sm"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {loadingAthletes ? (
                <div className="p-6 text-center text-sm text-gray-500 animate-pulse">Se încarcă…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500 italic">
                  {q ? 'Niciun rezultat pentru căutare.' : 'Niciun sportiv disponibil.'}
                </div>
              ) : (
                filtered.map(ath => {
                  const isEnrolled = enrolledIds.has(ath.id);
                  const clubName = ath.club?.name || '';
                  return (
                    <button key={ath.id}
                      onClick={() => handleToggleEnroll(ath.id, pickerCatId)}
                      disabled={busy}
                      className={`flex w-full items-center gap-3 border-b border-black/10 px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                        isEnrolled
                          ? 'bg-green-50 hover:bg-green-100 text-gray-800'
                          : 'hover:bg-yellow-50 text-gray-700'
                      }`}
                    >
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center border text-sm font-bold ${
                        isEnrolled
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 text-transparent'
                      }`}>✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{ath.last_name} {ath.first_name}</span>
                        <span className="block truncate text-xs text-gray-500">{clubName || 'Fără club'}{ath.date_of_birth ? ` · ${ath.date_of_birth}` : ''}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-black/10 bg-yellow-50 px-3 py-2">
              <span className="text-xs text-gray-600">
                {enrolledIds.size} înscriș{enrolledIds.size !== 1 ? 'i' : ''} · {filtered.length} afișați
              </span>
              <button onClick={() => setPickerCatId(null)}
                className="frvv-btn-secondary px-3 py-1.5 text-xs">Închide</button>
            </div>
          </div>
        );
      })()}

      {athleteDrawer && (
        <>
          <div className="fixed inset-0 z-[125] bg-black/30" onClick={closeAthleteDrawer} />
          <aside className="fixed right-0 top-0 z-[130] h-full w-full max-w-md overflow-y-auto border-l-2 border-black bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black bg-yellow-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Detalii sportiv</h3>
                <p className="text-xs text-gray-700">
                  {(athleteDrawer.last_name || '').trim()} {(athleteDrawer.first_name || '').trim()}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAthleteDrawer}
                className="rounded border border-gray-500 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Inchide
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <div><span className="font-semibold">Nume:</span> {(athleteDrawer.last_name || '').trim()} {(athleteDrawer.first_name || '').trim() || '—'}</div>
                <div><span className="font-semibold">Club:</span> {athleteDrawer.club?.name || '—'}</div>
                <div><span className="font-semibold">Gen:</span> {GENDER_LABELS[athleteDrawer.gender] || athleteDrawer.gender || '—'}</div>
                <div><span className="font-semibold">Data nasterii:</span> {formatBirthDateRo(athleteDrawer.date_of_birth)}</div>
                <div><span className="font-semibold">Varsta:</span> {formatAgeRo(athleteDrawer.date_of_birth)}</div>
              </div>

              <div className="rounded border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">Informatii complete</div>
                <div className="max-h-[55vh] overflow-auto">
                  {athleteDrawerRows.map(([key, value]) => (
                    <div key={`athlete-row-${key}`} className="grid grid-cols-[140px_1fr] gap-2 border-b border-gray-100 px-3 py-2 text-xs">
                      <span className="font-semibold text-gray-700">{key}</span>
                      <span className="break-words text-gray-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}


/* ── Reusable table header cell ── */
function TH({ children, small }) {
  return (
    <th
      className={`bg-gray-200 border border-black px-1.5 py-1.5 text-center font-bold text-gray-900 ${
        small ? 'text-[10px] whitespace-normal leading-tight' : 'text-xs whitespace-nowrap'
      }`}
    >
      {children}
    </th>
  );
}

/* ── Inline editable input ── */
function InlineInput({ value, onChange, onSave, onCancel, wide }) {
  return (
    <input
      type="text"
      autoFocus
      className={`text-center text-sm border border-blue-400 rounded px-1 py-0.5 outline-none bg-blue-50 ${wide ? 'w-full' : 'w-16'}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onSave}
      onKeyDown={e => {
        if (e.key === 'Enter') onSave();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/* ── Weight cell with color coding ── */
function WeightCell({ preW, dayW, onClick }) {
  if (!dayW && dayW !== 0) {
    return (
      <span className="cursor-pointer hover:bg-blue-50 px-1 rounded text-gray-400" title="Dublu-click pentru a edita" onClick={onClick}>
        –
      </span>
    );
  }
  // Color-code: green if same or within range, amber if changed, red if huge difference
  let color = 'text-green-700';
  if (preW && dayW) {
    const diff = Math.abs(Number(dayW) - Number(preW));
    const pct = (diff / Number(preW)) * 100;
    if (pct > 5) color = 'text-red-600 font-bold';
    else if (pct > 2) color = 'text-amber-600';
  }
  return (
    <span className={`cursor-pointer hover:bg-blue-50 px-1 rounded ${color}`} title="Dublu-click pentru a edita" onClick={onClick}>
      {dayW}
    </span>
  );
}
