import React, { useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Lock, Plus, X } from 'lucide-react';
import { CentralizatorContext, GENDER_BG, GENDER_LABELS } from './CategoriesLayout';
import { fightWeightAPI, athleteAPI, enrollmentAPI, categoryAPI, systemAPI } from '@shared/lib/api';
import {
  formatGroupBadgeLabel, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label,
} from '../components/ui';

/* ═══════════════════════════════════════════════════════════════════
   LUPTA PAGE  –  Fight category weigh-in workflow
   Columns: Grupa | Categorie (KG) | Sportiv | Greutate Înregistrată |
            Greutate Zi Competiție | DQ | Motiv DQ | Acțiuni
   ═══════════════════════════════════════════════════════════════════ */
export default function LuptaPage() {
  const ctx = useContext(CentralizatorContext);
  if (!ctx) return null;

  const {
    columnStructure, busy, setBusy,
    handleUnenroll, handleToggleEnroll,
    fightWeights, setFightWeights, fetchAll,
    groups, categories, clubs,
    eventDateStr,
    isEditLocked,
    setConfirmModal,
  } = ctx;

  /* ── inline editing state ── */
  const [editingCell, setEditingCell] = useState(null); // { id, field, value }
  const [activeStage, setActiveStage] = useState('pre'); // pre | enroll
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: '', minKg: '', maxKg: '' });
  const [preAssignTargets, setPreAssignTargets] = useState({});
  const [preAssignManual, setPreAssignManual] = useState({});
  // Etapa 2: manual category-reassignment override when the confirmed
  // competition-day weight no longer fits the athlete's current category.
  const [dayAssignTargets, setDayAssignTargets] = useState({});
  const [dayAssignManual, setDayAssignManual] = useState({});
  const [preSortField, setPreSortField] = useState('club'); // club | name
  const [preSortDir, setPreSortDir] = useState('asc'); // asc | desc
  const [preSearchQuery, setPreSearchQuery] = useState('');
  const [manualEnrollOpen, setManualEnrollOpen] = useState(false);
  const [manualEnrollDraft, setManualEnrollDraft] = useState({ groupId: '', categoryId: '', athleteId: '', weight: '' });
  const [manualEnrollSearch, setManualEnrollSearch] = useState('');
  const [manualEnrollDropdownOpen, setManualEnrollDropdownOpen] = useState(false);
  const [assignNotice, setAssignNotice] = useState('');
  // { message, onUndo } - a temporary banner offering to reverse the last
  // withdraw-from-Lupta action (see handleWithdrawRow), since removing an
  // athlete from the list is otherwise a one-way action here.
  const [undoNotice, setUndoNotice] = useState(null);
  const [athleteDrawer, setAthleteDrawer] = useState(null);

  // Greutatea declarată (pre_weight_kg) comes from the athlete/coach's own
  // submission in the cloud, days before the competition - it has no
  // business being edited from the venue's LAN server, only the day-of
  // official scale reading (current_weight_kg) does.
  const [isLocalServer, setIsLocalServer] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await systemAPI.info();
        if (!cancelled) setIsLocalServer(Boolean(data.is_local_event_server));
      } catch {
        if (!cancelled) setIsLocalServer(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── enrollment picker state (local to Lupta page) ── */
  const [pickerCatId, setPickerCatId] = useState(null);
  const [groupPicker, setGroupPicker] = useState(null); // { groupId, gender }
  const [pickerSearch, setPickerSearch] = useState('');
  // The age window is a guide, not a hard gate: on competition day an
  // athlete whose date of birth was never filled in (or who is a genuine
  // approved exception) otherwise can't be entered at all, because the
  // pickers below hide anyone outside it. Off by default so the rule
  // still does its job; when on, the offenders are shown and flagged
  // rather than silently dropped.
  const [ignoreAgeRule, setIgnoreAgeRule] = useState(false);
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
  const autoAssignInFlightRef = useRef(new Set());

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
        // A record for this (category, athlete) pair can already exist on
        // the server without being in local state yet (e.g. a stray record
        // left behind by an earlier category reassignment) - the backend's
        // unique constraint then rejects the create. Recover by fetching the
        // real record and patching it instead of silently dropping the edit.
        if (err?.response?.status === 400) {
          try {
            const { data } = await fightWeightAPI.list({ category: categoryId });
            const existing = (Array.isArray(data) ? data : data.results ?? []).find((fw) => fw.athlete === athleteId);
            if (existing) {
              const patched = await fightWeightAPI.update(existing.id, patchData);
              setFightWeights((prev) => [...prev.filter((fw) => fw.id !== existing.id), patched.data]);
              return;
            }
          } catch (recoveryErr) {
            console.error('Recovering existing fight weight failed:', recoveryErr);
          }
        }
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
    // A confirmed competition-day weight locks itself automatically (see
    // handleToggleWeightLock) - clearing it back to empty unlocks it too,
    // since an empty value can't be "confirmed".
    const patch = { [field]: value || null };
    if (field === 'current_weight_kg') patch.is_weight_locked = Boolean(value);
    await ensureAndPatch(categoryId, athleteId, patch);
  }, [editingCell, ensureAndPatch]);

  /* ── toggle disqualified ── */
  const handleToggleDQ = useCallback(async (categoryId, athleteId, currentDQ) => {
    await ensureAndPatch(categoryId, athleteId, {
      is_disqualified: !currentDQ,
      ...(!currentDQ ? {} : { disqualification_reason: '' }),
    });
  }, [ensureAndPatch]);

  /* ── lock/unlock the confirmed competition-day weight ── */
  const handleToggleWeightLock = useCallback(async (categoryId, athleteId, currentLocked) => {
    await ensureAndPatch(categoryId, athleteId, { is_weight_locked: !currentLocked });
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

  // Keyed the same way as the row map below (group_id-athlete_id) so it can
  // fall back for athletes whose CategoryAthlete.weight was never (re)set
  // after assignment - assignToCategory only copies registered_weight_kg
  // into CategoryAthlete.weight once, at the moment of assignment, so a
  // weight submitted or corrected afterwards would otherwise never show up
  // here even though it's sitting right there in the pre-registration pool.
  const groupEnrollmentWeightByKey = useMemo(
    () => new Map(fightGroupEnrollments.map((ge) => [`${ge.group}-${ge.athlete}`, ge.registered_weight_kg])),
    [fightGroupEnrollments]
  );

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
          // fw.pre_weight_kg ("Greutate declarată" in Django admin) is the
          // same declared-weight concept as FightGroupEnrollment's own
          // registered_weight_kg, just entered directly on
          // FightAthleteWeight (e.g. by an admin, bypassing the normal
          // coach-submission flow) - without it here, that weight was
          // invisible on this table even though it's sitting right there.
          const submittedWeight = enrollment.weight ?? groupEnrollmentWeightByKey.get(key) ?? fw?.pre_weight_kg ?? existing?.submitted_weight ?? '';
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
            confirmed_weight: fw?.current_weight_kg ?? '',
            confirmed_locked: fw?.is_weight_locked ?? false,
            is_disqualified: fw?.is_disqualified ?? false,
          };
          if (!existing) {
            map.set(key, row);
          } else {
            map.set(key, {
              ...existing,
              submitted_weight: existing.submitted_weight || row.submitted_weight,
            });
          }
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.group_name !== b.group_name) return a.group_name.localeCompare(b.group_name);
      return a.athlete_name.localeCompare(b.athlete_name);
    });
  }, [fightGroups, findWeight, groupEnrollmentWeightByKey]);

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

  // Live name search on top of the sorted list - a display-only filter, so
  // it doesn't affect assignment logic (auto-assign etc. still run over the
  // full preEnrollmentRows, not this filtered view).
  const preEnrollmentRowsFiltered = useMemo(() => {
    const q = preSearchQuery.trim().toLocaleLowerCase('ro');
    if (!q) return preEnrollmentRows;
    return preEnrollmentRows.filter((row) => row.athlete_name.toLocaleLowerCase('ro').includes(q));
  }, [preEnrollmentRows, preSearchQuery]);

  // Shared by both stages: which fight category (same group, compatible
  // gender) actually fits a given weight. Etapa 1 suggests one from the
  // submitted (pre-registration) weight; Etapa 2 suggests one from the
  // confirmed competition-day weight, to flag when an athlete has outgrown
  // the category they were pre-registered into.
  const suggestCategoryForWeight = useCallback((groupId, gender, weightRaw) => {
    const candidates = categories.filter((cat) => {
      if (cat.type !== 'fight') return false;
      if (cat.group !== groupId) return false;
      const catGender = cat.gender || 'mixt';
      return catGender === 'mixt' || gender === 'mixt' || catGender === gender;
    });
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
  }, [categories, parseCategoryBounds]);

  // Once a weight has been confirmed at the scale, it's the authoritative
  // one for suggesting/assigning a category - the submitted weight is only
  // a fallback until then. getInitialSuggestedCategoryId (submitted weight
  // only) is kept separately so rows can be highlighted when the confirmed
  // weight has moved them into a different category than their submission
  // implied (see exceedsInitialCategory in the table body).
  // null when the athlete fits the group's birth-date window, otherwise a
  // short reason - used both to filter them out (rule on) and to label
  // why they stand out in the list (rule overridden).
  const ageRuleViolation = useCallback((athlete, { dateStart, dateEnd, allowYounger }) => {
    if (!dateStart || !dateEnd) return null;
    if (!athlete.date_of_birth) return 'fără dată de naștere';
    if (athlete.date_of_birth < dateStart) return 'născut înainte de grupă';
    if (!allowYounger && athlete.date_of_birth > dateEnd) return 'mai tânăr decât grupa';
    return null;
  }, []);

  const getSuggestedCategoryId = useCallback((row) => (
    suggestCategoryForWeight(row.group_id, row.category_gender, row.confirmed_weight || row.submitted_weight)
  ), [suggestCategoryForWeight]);

  const getInitialSuggestedCategoryId = useCallback((row) => (
    suggestCategoryForWeight(row.group_id, row.category_gender, row.submitted_weight)
  ), [suggestCategoryForWeight]);

  useEffect(() => {
    if (activeStage !== 'pre') return;
    setPreAssignTargets((prev) => {
      let changed = false;
      const next = { ...prev };
      preEnrollmentRows.forEach((row) => {
        if (!(row.key in next)) {
          const suggested = getInitialSuggestedCategoryId(row);
          next[row.key] = suggested ? String(suggested) : '';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [preEnrollmentRows, getInitialSuggestedCategoryId, activeStage]);

  const saveSubmittedWeight = useCallback(async (row, value) => {
    await enrollmentAPI.categoryAthletes.update(row.enrollment_id, { weight: value || null });
    await fetchAll();
  }, [fetchAll]);

  // Etapa 1 only assigns a category from the weight the coach submitted at
  // registration - the actual competition-day weigh-in/confirmation and any
  // reassignment it triggers happen in Etapa 2 (see reassignDayRowToCategory).
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
      // Carry over any existing weigh-in record (confirmed weight, lock, DQ
      // status) to the new category - otherwise it stays attached to the old
      // category id and silently stops showing up anywhere.
      const previousWeight = findWeight(row.current_category_id, row.athlete_id);
      if (previousWeight) {
        await ensureAndPatch(targetId, row.athlete_id, {
          current_weight_kg: previousWeight.current_weight_kg ?? null,
          is_weight_locked: previousWeight.is_weight_locked ?? false,
          pre_weight_kg: previousWeight.pre_weight_kg ?? null,
          is_disqualified: previousWeight.is_disqualified ?? false,
          disqualification_reason: previousWeight.disqualification_reason ?? '',
        });
        try {
          await fightWeightAPI.delete(previousWeight.id);
        } catch (err) {
          console.error('Cleaning up old fight weight failed:', err);
        }
      }
    } else {
      await enrollmentAPI.categoryAthletes.update(row.enrollment_id, {
        weight: row.submitted_weight || null,
      });
    }
    await fetchAll();
  }, [fetchAll, findWeight, ensureAndPatch]);

  // Keep "Pe categorii" in sync with the category shown as selected on
  // "Sportivi și cântărire": that dropdown pre-fills with the category the
  // submitted (pre-registration) weight suggests, without waiting for the
  // coach/admin to touch it, so without this the actual enrollment (and
  // therefore the category card the athlete shows up under) could silently
  // lag behind what the dropdown displays. This only ever follows the
  // submitted weight, and only until a competition-day weight is entered -
  // from that point on the placement is settled by the confirmed weight
  // (either it already matches, or it needs an explicit "Confirmă în
  // categorie" click), so this effect must leave those rows alone.
  // Important: this check has to be based on the row's confirmed_weight
  // (persisted server-side), not just preAssignManual/preAssignTargets
  // (in-memory React state) - otherwise a page reload would forget which
  // rows were already settled and silently reassign already-weighed-in
  // athletes back to their submitted-weight category.
  useEffect(() => {
    if (activeStage !== 'pre') return;
    preEnrollmentRows.forEach((row) => {
      if (preAssignManual[row.key] || row.confirmed_weight) return;
      const suggestedId = getInitialSuggestedCategoryId(row);
      if (!suggestedId) return;
      const suggestedNum = Number(suggestedId);
      if (suggestedNum === row.current_category_id) return;
      if (autoAssignInFlightRef.current.has(row.key)) return;
      autoAssignInFlightRef.current.add(row.key);
      assignPreRowToCategory(row, suggestedId)
        .catch((err) => console.error('Auto-assign to suggested category failed:', err))
        .finally(() => {
          autoAssignInFlightRef.current.delete(row.key);
        });
    });
  }, [preEnrollmentRows, preAssignManual, activeStage, getInitialSuggestedCategoryId, assignPreRowToCategory]);

  // Etapa 2: move an athlete whose confirmed competition-day weight no
  // longer fits their current category into the one selected in the
  // reassignment dropdown (auto-suggested, but always overridable - see
  // dayAssignTargets/dayAssignManual). Keeps the confirmed weight, its lock
  // state, and the original pre-registration weight attached to the new
  // category's FightAthleteWeight record.
  const reassignDayRowToCategory = useCallback(async (row, athleteId, weightValue, isLocked, targetCategoryId) => {
    if (!targetCategoryId) return;
    const targetId = Number(targetCategoryId);
    const enrollId = row.enrollment?.id;
    if (row.cat.id !== targetId) {
      if (enrollId) await enrollmentAPI.categoryAthletes.delete(enrollId);
      await enrollmentAPI.categoryAthletes.create({
        category: targetId,
        athlete: athleteId,
        weight: row.enrollment?.weight || null,
      });
    }
    const previousWeight = findWeight(row.cat.id, athleteId);
    await ensureAndPatch(targetId, athleteId, {
      current_weight_kg: weightValue || null,
      is_weight_locked: Boolean(isLocked),
      ...(previousWeight?.pre_weight_kg ? { pre_weight_kg: previousWeight.pre_weight_kg } : {}),
    });
    // Clean up the now-orphaned weigh-in record at the old category so it
    // can't collide with the unique (category, athlete) constraint if this
    // athlete is ever moved back there later.
    if (previousWeight && previousWeight.category !== targetId) {
      try {
        await fightWeightAPI.delete(previousWeight.id);
      } catch (err) {
        console.error('Cleaning up old fight weight failed:', err);
      }
    }
    await fetchAll();
  }, [findWeight, ensureAndPatch, fetchAll]);

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

  useEffect(() => {
    if (!undoNotice) return;
    const timer = window.setTimeout(() => setUndoNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoNotice]);

  // Withdraw an athlete from Lupta entirely (they scratched, or got cut for
  // being over weight with nowhere left to place them). Unlike a category
  // reassignment this has no "undo the click" affordance in the UI, so it
  // gets its own undo banner: re-creating the same enrollment restores it,
  // including its confirmed-weight record (that's keyed by category+athlete,
  // not by the enrollment row, so it was never touched by the delete).
  const handleWithdrawRow = useCallback((row) => {
    const label = row.athlete_name || 'sportivul selectat';
    setConfirmModal({
      title: 'Retrage sportivul',
      message: `Retragi pe ${label} de la Lupta? Poți anula imediat după, din bara care apare.`,
      icon: '🚪',
      color: 'red',
      confirmLabel: 'Retrage',
      onConfirm: async () => {
        setBusy(true);
        try {
          await enrollmentAPI.categoryAthletes.delete(row.enrollment_id);
          await fetchAll();
          setUndoNotice({
            message: `${label} a fost retras de la Lupta.`,
            onUndo: async () => {
              setBusy(true);
              try {
                await enrollmentAPI.categoryAthletes.create({
                  category: row.current_category_id,
                  athlete: row.athlete_id,
                  weight: row.submitted_weight || null,
                });
                await fetchAll();
                setAssignNotice(`${label} a fost re-înscris.`);
              } finally {
                setBusy(false);
              }
            },
          });
        } finally {
          setBusy(false);
          setConfirmModal(null);
        }
      },
    });
  }, [fetchAll, setConfirmModal, setBusy]);

  const handleToggleDQRow = useCallback((row) => {
    const label = row.athlete_name || 'sportivul selectat';
    const isDQ = row.is_disqualified;
    setConfirmModal({
      title: isDQ ? 'Anulează descalificarea' : 'Descalifică sportivul',
      message: isDQ
        ? `Anulezi descalificarea sportivului „${label}"? Poți descalifica din nou oricând.`
        : `Descalifici sportivul „${label}" (ex. din cauza greutății)? Poți anula descalificarea oricând, din același buton.`,
      icon: '🚫',
      color: isDQ ? 'orange' : 'red',
      confirmLabel: isDQ ? 'Anulează descalificarea' : 'Descalifică',
      onConfirm: async () => {
        setBusy(true);
        try {
          await handleToggleDQ(row.current_category_id, row.athlete_id, isDQ);
        } finally {
          setBusy(false);
          setConfirmModal(null);
        }
      },
    });
  }, [handleToggleDQ, setConfirmModal, setBusy]);

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
      <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm italic p-4 text-center">
        <span>📋 Nu există categorii de tip Luptă. Creează-le din tab-ul Centralizator.</span>
      </div>
    );
  }

  const genderOrder = ['male', 'female', 'mixt'];

  return (
    <div className="flex-1 overflow-auto bg-background p-3 md:p-4">
      <div inert={isEditLocked ? '' : undefined} className={isEditLocked ? 'opacity-95' : ''}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveStage('pre')}
            className={`rounded border px-3 py-1.5 text-xs font-semibold ${
              activeStage === 'pre'
                ? 'border-secondary bg-secondary text-secondary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            Sportivi și cântărire
          </button>
          <button
            type="button"
            onClick={() => setActiveStage('enroll')}
            className={`rounded border px-3 py-1.5 text-xs font-semibold ${
              activeStage === 'enroll'
                ? 'border-secondary bg-secondary text-secondary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            Pe categorii
          </button>
          {activeStage === 'pre' && (
            <Button size="sm" onClick={handleOpenManualEnroll} className="ml-auto">
              Inscrie sportiv
            </Button>
          )}
        </div>

        {assignNotice && (
          <div className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
            {assignNotice}
          </div>
        )}

        {undoNotice && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <span>{undoNotice.message}</span>
            <button
              type="button"
              onClick={async () => {
                const undo = undoNotice.onUndo;
                setUndoNotice(null);
                await undo();
              }}
              className="rounded border border-amber-600 bg-white px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100"
            >
              Anulează
            </button>
          </div>
        )}

        {activeStage === 'pre' && (
          <div className="w-full overflow-x-auto border-2 border-border bg-card">
            <div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
              Toți sportivii înscriși la Lupta — greutatea trimisă de antrenori și confirmarea la cântar în ziua competiției
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 text-xs">
              <span className="font-semibold text-muted-foreground">Sortare:</span>
              <button
                type="button"
                onClick={() => togglePreSort('club')}
                className={`rounded border px-2 py-1 ${preSortField === 'club' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-input bg-background text-muted-foreground'}`}
              >
                Club {preSortField === 'club' ? (preSortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                onClick={() => togglePreSort('name')}
                className={`rounded border px-2 py-1 ${preSortField === 'name' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-input bg-background text-muted-foreground'}`}
              >
                Nume {preSortField === 'name' ? (preSortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <input
                type="text"
                value={preSearchQuery}
                onChange={(event) => setPreSearchQuery(event.target.value)}
                placeholder="Caută după nume..."
                className="ml-auto w-48 rounded border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
            <table className="w-full border-collapse text-sm" style={{ minWidth: '980px' }}>
              <thead>
                <tr>
                  <TH>Grupa</TH>
                  <TH>Gen</TH>
                  <TH>Nume sportiv + club</TH>
                  <TH>Varsta</TH>
                  <TH small>Greutate trimisa</TH>
                  <TH small highlight>Cantar Oficial</TH>
                  <TH>Categorie sugerata</TH>
                  <TH>Categorie selectata</TH>
                  <TH></TH>
                </tr>
              </thead>
              <tbody>
                {preEnrollmentRowsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-border px-3 py-3 text-center text-xs italic text-muted-foreground">
                      {preEnrollmentRows.length === 0
                        ? 'Nu exista sportivi inscrisi la Lupta de catre antrenori.'
                        : 'Niciun sportiv găsit pentru căutarea curentă.'}
                    </td>
                  </tr>
                ) : (
                  preEnrollmentRowsFiltered.map((row) => {
                    const suggestedId = getSuggestedCategoryId(row);
                    // The confirmed competition-day weight suggests a category
                    // that doesn't match where the athlete is currently placed
                    // (which normally follows the submitted weight) - purely
                    // informational until "Confirmă greutate" is clicked,
                    // which is what actually moves the athlete if needed.
                    const categoryMismatch = Boolean(
                      row.confirmed_weight && suggestedId && suggestedId !== row.current_category_id
                    );
                    // Explicit, persisted "this weigh-in is final" flag (backed
                    // by is_weight_locked) - set only by clicking "Confirmă
                    // greutate", not inferred automatically from the weight
                    // happening to already match. Freezes the confirmed-weight
                    // field and the category dropdown once true.
                    const weightConfirmed = Boolean(row.confirmed_weight) && row.confirmed_locked;
                    const isManualSelection = preAssignManual[row.key] === true;
                    // Preselect from the same suggestion shown in "Categorie
                    // sugerată" (confirmed weight once it exists, else the
                    // submitted one) - purely a display default so the two
                    // columns agree. This never moves the athlete by itself:
                    // that still only happens on an explicit dropdown change
                    // or "Confirmă greutate" click.
                    const selectedTarget = isManualSelection
                      ? (preAssignTargets[row.key] || '')
                      : (suggestedId ? String(suggestedId) : '');
                    const options = categories.filter((cat) => (
                      cat.type === 'fight' && cat.group === row.group_id
                    ));
                    const athleteLabel = row.club_name ? `${row.athlete_name} (${row.club_name})` : row.athlete_name;
                    const groupLabel = row.group_years ? `${row.group_name} (${row.group_years})` : row.group_name;
                    return (
                      <tr key={`pre-row-${row.key}`} className={row.is_disqualified ? 'bg-red-50' : categoryMismatch && !weightConfirmed ? 'bg-red-50' : ''}>
                        <td className="border border-border px-2 py-1 text-xs text-muted-foreground">{groupLabel}</td>
                        <td className="border border-border px-2 py-1 text-xs text-muted-foreground">{GENDER_LABELS[row.category_gender] || row.category_gender}</td>
                        <td className="border border-border px-2 py-1 text-sm text-foreground">
                          <button
                            type="button"
                            onClick={() => openAthleteDrawer(row.athlete_details)}
                            className={`text-left underline-offset-2 hover:underline ${row.is_disqualified ? 'text-red-400 line-through' : 'text-blue-700'}`}
                          >
                            {athleteLabel}
                          </button>
                          {row.is_disqualified && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700" title="Sportiv descalificat">
                              DQ
                            </span>
                          )}
                          {categoryMismatch && !weightConfirmed && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700" title="Categoria sugerată de greutatea confirmată diferă de categoria curentă">
                              Depășește
                            </span>
                          )}
                        </td>
                        <td className="border border-border px-2 py-1 text-xs text-muted-foreground">{formatAgeRo(row.athlete_details?.date_of_birth)}</td>
                        <td className="border border-border px-1 py-1 text-center text-xs">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={row.submitted_weight || ''}
                            readOnly
                            className="w-20 cursor-not-allowed rounded border border-border bg-muted px-1 py-0.5 text-center text-xs text-muted-foreground"
                          />
                        </td>
                        <td className="border-y border-border border-l-2 border-r-2 border-l-amber-500 border-r-amber-500 px-1 py-1 text-center text-xs">
                          {weightConfirmed ? (
                            <span
                              className="inline-block w-20 rounded border border-border bg-muted px-1 py-0.5 text-center text-xs text-muted-foreground"
                              title="Greutatea a fost confirmată - câmp needitabil"
                            >
                              {row.confirmed_weight}
                            </span>
                          ) : (
                            <input
                              key={`confirmed-${row.key}-${row.confirmed_weight}`}
                              type="number"
                              step="0.1"
                              min="0"
                              defaultValue={row.confirmed_weight}
                              onBlur={async (event) => {
                                const value = event.target.value;
                                await ensureAndPatch(row.current_category_id, row.athlete_id, {
                                  current_weight_kg: value || null,
                                });
                              }}
                              className="w-20 rounded border border-input px-1 py-0.5 text-center text-xs"
                            />
                          )}
                        </td>
                        <td className="border border-border px-2 py-1 text-xs text-blue-700">
                          {suggestedId ? (categories.find((cat) => cat.id === suggestedId)?.name || '—') : 'Fara sugestie'}
                        </td>
                        <td className="border border-border px-1 py-1 text-xs">
                          <select
                            value={selectedTarget}
                            disabled={busy || weightConfirmed}
                            onChange={async (event) => {
                              const nextValue = event.target.value;
                              setPreAssignTargets((prev) => ({ ...prev, [row.key]: nextValue }));
                              setPreAssignManual((prev) => ({ ...prev, [row.key]: nextValue !== '' }));
                              if (!nextValue || Number(nextValue) === row.current_category_id) return;
                              const targetCat = categories.find((cat) => cat.id === Number(nextValue));
                              const athleteLabel = row.athlete_name || 'sportivul selectat';
                              const targetLabel = targetCat?.name || 'categoria selectata';
                              await assignPreRowToCategory(row, nextValue);
                              setAssignNotice(`${athleteLabel} a fost repartizat la ${targetLabel}.`);
                            }}
                            className="w-full rounded border border-input px-2 py-1 text-xs disabled:opacity-50"
                          >
                            <option value="">Selecteaza categoria</option>
                            {options.map((cat) => (
                              <option key={`pre-opt-${row.key}-${cat.id}`} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border border-border px-1 py-1 text-center text-xs">
                          <div className="flex flex-nowrap items-center justify-center gap-1">
                          {weightConfirmed ? (
                            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 text-[10px] font-semibold text-green-800" title="Greutatea din ziua competiției a fost confirmată">
                              ✓ Confirmat
                            </span>
                          ) : (
                          <Button
                            size="sm"
                            disabled={busy || !row.confirmed_weight}
                            onClick={() => {
                              // If the admin already picked a category by
                              // hand via the dropdown, that choice has
                              // already been applied (its onChange assigns
                              // immediately) - confirming should just lock
                              // it in, not silently override it back to the
                              // weight-based suggestion, even if that pick
                              // doesn't match the suggestion.
                              const shouldAutoMove = categoryMismatch && !isManualSelection;
                              const targetCat = shouldAutoMove ? categories.find((cat) => cat.id === suggestedId) : null;
                              const targetLabel = targetCat?.name || 'categoria selectată';
                              setConfirmModal({
                                title: 'Confirmă greutatea din ziua competiției',
                                message: shouldAutoMove
                                  ? `Greutatea confirmată la cântar (${row.confirmed_weight} kg) diferă de greutatea trimisă (${row.submitted_weight || '—'} kg). Confirmi greutatea și muți pe ${row.athlete_name || 'sportivul selectat'} la ${targetLabel}? Câmpurile de greutate și categorie vor deveni needitabile.`
                                  : `Confirmi greutatea de ${row.confirmed_weight} kg pentru ${row.athlete_name || 'sportivul selectat'}? Câmpurile de greutate și categorie vor deveni needitabile.`,
                                icon: '⚖️',
                                color: 'orange',
                                confirmLabel: 'Confirmă greutatea',
                                onConfirm: async () => {
                                  setBusy(true);
                                  try {
                                    let targetId = row.current_category_id;
                                    if (shouldAutoMove) {
                                      targetId = suggestedId;
                                      setPreAssignTargets((prev) => ({ ...prev, [row.key]: String(suggestedId) }));
                                      setPreAssignManual((prev) => ({ ...prev, [row.key]: true }));
                                      await assignPreRowToCategory(row, suggestedId);
                                    }
                                    await ensureAndPatch(targetId, row.athlete_id, { is_weight_locked: true });
                                    setAssignNotice(shouldAutoMove
                                      ? `${row.athlete_name || 'Sportivul'} a fost confirmat la ${targetLabel}.`
                                      : `Greutatea lui ${row.athlete_name || 'sportivul selectat'} a fost confirmată.`);
                                  } finally {
                                    setBusy(false);
                                    setConfirmModal(null);
                                  }
                                },
                              });
                            }}
                            className="shrink-0"
                          >
                            Confirmă
                          </Button>
                          )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleToggleDQRow(row)}
                              className={`inline-flex h-6 shrink-0 items-center justify-center rounded border px-1.5 text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                                row.is_disqualified
                                  ? 'border-red-600 bg-red-500 text-white hover:bg-red-600'
                                  : 'border-input bg-background text-muted-foreground hover:bg-muted'
                              }`}
                              title={row.is_disqualified ? 'Anulează descalificarea' : 'Descalifică sportivul'}
                            >DQ</button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleWithdrawRow(row)}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                              title="Retrage sportivul de la Lupta"
                            ><X className="h-3.5 w-3.5" /></button>
                          </div>
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
            <div key={`fight-${group.id}`} className="mb-6">
              {genderOrder.filter(g => catsByGender[g]).map(gender => {
                const genderCats = catsByGender[gender];

                return (
                  <div key={`${group.id}-${gender}`} className="mb-4 flex flex-col gap-3 lg:grid lg:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {genderCats.map(cat => {
                      const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
                        const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                        const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                        return na.localeCompare(nb);
                      });
                      const catLabel = cat.name
                        .replace(/ - (Masculin|Feminin|Mixt)/i, '')
                        .replace(/Đối Kháng\s*/i, '').trim() || cat.name;
                      const belowMin = enrolled.length < 3;

                      return (
                        <div key={cat.id} className="border border-sidebar-border bg-card lg:overflow-hidden">
                          <div className="sticky top-0 z-10 bg-card">
                            <div className="flex items-center justify-between gap-2 border-b border-sidebar-border bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                              <span className="truncate">
                                {group.name}
                                {(group.birth_date_start || group.birth_year_start) && (
                                  <span className="ml-1 font-normal text-muted-foreground">
                                    ({group.birth_date_start
                                      ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
                                      : `${group.birth_year_start}–${group.birth_year_end}`})
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 gap-1">
                                {group.allowed_grade_type === 'inferior' && (
                                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-medium text-amber-800" title="Doar grade inferioare (gradele superioare nu au voie)">Grade inf.</span>
                                )}
                                {group.allowed_grade_type === 'superior' && (
                                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-medium text-emerald-800" title="Doar grade superioare">Grade sup.</span>
                                )}
                              </span>
                            </div>
                            <div className={`flex items-center justify-between gap-2 border-b border-sidebar-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${GENDER_BG[gender] || 'bg-muted'}`}>
                              {editingCategoryId === cat.id ? (
                                <div className="flex w-full flex-col gap-1 py-0.5 normal-case">
                                  <input
                                    type="text"
                                    value={categoryDraft.name}
                                    onChange={(event) => setCategoryDraft((prev) => ({ ...prev, name: event.target.value }))}
                                    className="w-full rounded border border-input px-1 py-0.5 text-[10px]"
                                    placeholder="Nume categorie"
                                  />
                                  <div className="grid grid-cols-2 gap-1">
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={categoryDraft.minKg}
                                      onChange={(event) => setCategoryDraft((prev) => ({ ...prev, minKg: event.target.value }))}
                                      className="w-full rounded border border-input px-1 py-0.5 text-[10px]"
                                      placeholder="Min kg"
                                    />
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={categoryDraft.maxKg}
                                      onChange={(event) => setCategoryDraft((prev) => ({ ...prev, maxKg: event.target.value }))}
                                      className="w-full rounded border border-input px-1 py-0.5 text-[10px]"
                                      placeholder="Max kg"
                                    />
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={async () => { await saveCategoryEdit(cat); }}
                                      className="rounded border border-blue-600 bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                    >Salveaza</button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCategoryId(null)}
                                      className="rounded border border-input bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                                    >Anuleaza</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className="flex min-w-0 items-center gap-1 truncate">
                                    <span className="truncate">{catLabel}</span>
                                    <button
                                      type="button"
                                      onClick={() => startCategoryEdit(cat)}
                                      className="inline-flex h-5 shrink-0 items-center rounded border border-black/10 bg-white/40 px-1.5 text-[10px] font-semibold normal-case text-current transition hover:bg-white/70"
                                      title="Editează categoria"
                                    >Edit</button>
                                  </span>
                                  <span className={`shrink-0 rounded px-1 font-bold ${belowMin ? 'bg-red-100 text-red-700' : ''}`} title="Nr. participanți">{enrolled.length}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="border-b border-sidebar-border p-1.5" ref={el => { pickerBtnRefs.current[cat.id] = el; }}>
                            <Button
                              size="sm"
                              onClick={(e) => openPicker(cat.id, e)}
                              disabled={busy}
                              className="w-full text-xs"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Adaugă sportiv
                            </Button>
                          </div>
                          <div className="divide-y divide-sidebar-border">
                            {enrolled.length === 0 ? (
                              <div className="px-2 py-2 text-xs italic text-muted-foreground">Niciun sportiv înscris.</div>
                            ) : enrolled.map(entry => {
                              const a = entry.athlete_details;
                              const athleteId = entry.athlete;
                              const name = a ? `${a.last_name || ''} ${a.first_name || ''}`.trim() : '';
                              const club = a?.club?.name || '';
                              const enrollId = entry.id;

                              const fw = athleteId ? findWeight(cat.id, athleteId) : null;
                              const preW = fw?.pre_weight_kg ?? entry.weight ?? '';
                              const dayW = fw?.current_weight_kg ?? '';
                              const isDQ = fw?.is_disqualified ?? false;
                              const dqReason = fw?.disqualification_reason ?? '';
                              const isWeightLocked = fw?.is_weight_locked ?? false;

                              // Does the confirmed competition-day weight still fit
                              // the category this athlete is currently enrolled in?
                              // If not, offer a reassignment to the category it
                              // actually fits (pre-selected, but overridable).
                              const currentBounds = parseCategoryBounds(cat.name);
                              const dayWeightNum = Number(String(dayW || '').replace(',', '.'));
                              const exceedsCategory = Boolean(
                                athleteId && dayW !== '' && currentBounds && Number.isFinite(dayWeightNum)
                                && (dayWeightNum < currentBounds.min || dayWeightNum > currentBounds.max)
                              );
                              const dayRowKey = `${cat.id}-${athleteId}`;
                              const suggestedDayCatId = exceedsCategory ? suggestCategoryForWeight(group.id, gender, dayW) : '';
                              const isManualDayTarget = dayAssignManual[dayRowKey] === true;
                              const dayTarget = isManualDayTarget
                                ? (dayAssignTargets[dayRowKey] || '')
                                : (suggestedDayCatId ? String(suggestedDayCatId) : '');
                              const dayReassignOptions = categories.filter((c) => c.type === 'fight' && c.group === group.id);

                              const isEditingPre = editingCell?.categoryId === cat.id && editingCell?.athleteId === athleteId && editingCell?.field === 'pre_weight_kg';
                              const isEditingDay = editingCell?.categoryId === cat.id && editingCell?.athleteId === athleteId && editingCell?.field === 'current_weight_kg';
                              const isEditingReason = editingCell?.categoryId === cat.id && editingCell?.athleteId === athleteId && editingCell?.field === 'disqualification_reason';

                              return (
                                <div key={entry.id} className={`px-2 py-1.5 text-xs ${isDQ ? 'bg-red-50' : ''}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openAthleteDrawer(a)}
                                      className={`min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline ${isDQ ? 'text-red-400 line-through' : 'text-blue-700'}`}
                                    >
                                      {name}
                                      {club && <span className="font-normal text-muted-foreground"> ({club})</span>}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!athleteId) return;
                                        setConfirmModal({
                                          title: isDQ ? 'Anulează descalificarea' : 'Descalifică sportivul',
                                          message: isDQ
                                            ? `Anulezi descalificarea sportivului „${name}"?`
                                            : `Descalifici sportivul „${name}"?`,
                                          icon: '🚫',
                                          color: isDQ ? 'orange' : 'red',
                                          confirmLabel: isDQ ? 'Anulează descalificarea' : 'Descalifică',
                                          onConfirm: async () => {
                                            setBusy(true);
                                            try {
                                              await handleToggleDQ(cat.id, athleteId, isDQ);
                                            } finally {
                                              setBusy(false);
                                              setConfirmModal(null);
                                            }
                                          },
                                        });
                                      }}
                                      disabled={!athleteId}
                                      className={`inline-flex h-6 shrink-0 items-center justify-center rounded border px-1.5 text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                                        isDQ
                                          ? 'border-red-600 bg-red-500 text-white hover:bg-red-600'
                                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                                      }`}
                                      title={isDQ ? 'Anulează descalificarea' : 'Descalifică sportivul'}
                                    >DQ</button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleUnenroll(enrollId, name, cat.name, e)}
                                      disabled={busy}
                                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                                      title="Scoate sportivul din categorie"
                                    ><X className="h-3.5 w-3.5" /></button>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span
                                      className="text-muted-foreground"
                                      onDoubleClick={() => athleteId && !isLocalServer && setEditingCell({ categoryId: cat.id, athleteId, field: 'pre_weight_kg', value: preW.toString() })}
                                    >
                                      Greutate trimisă:{' '}
                                      {isEditingPre ? (
                                        <InlineInput
                                          value={editingCell.value}
                                          onChange={v => setEditingCell(prev => ({ ...prev, value: v }))}
                                          onSave={handleSaveEdit}
                                          onCancel={() => setEditingCell(null)}
                                        />
                                      ) : isLocalServer ? (
                                        <span className="rounded px-1 font-medium text-foreground" title="Greutatea declarată vine din cloud (trimisă de antrenor/sportiv) - nu se editează local, doar greutatea din ziua competiției.">{preW || '–'}</span>
                                      ) : (
                                        <span className="cursor-pointer rounded px-1 font-medium text-foreground hover:bg-blue-50" title="Dublu-click pentru a edita">{preW || '–'}</span>
                                      )}
                                    </span>
                                    <span
                                      className="flex items-center gap-1 text-muted-foreground"
                                      onDoubleClick={() => athleteId && !isWeightLocked && setEditingCell({ categoryId: cat.id, athleteId, field: 'current_weight_kg', value: dayW.toString() })}
                                    >
                                      Greutate confirmată:{' '}
                                      {isEditingDay ? (
                                        <InlineInput
                                          value={editingCell.value}
                                          onChange={v => setEditingCell(prev => ({ ...prev, value: v }))}
                                          onSave={handleSaveEdit}
                                          onCancel={() => setEditingCell(null)}
                                        />
                                      ) : isWeightLocked ? (
                                        <span className="inline-flex items-center gap-1">
                                          <WeightCell preW={preW} dayW={dayW} locked />
                                          <button
                                            type="button"
                                            onClick={() => handleToggleWeightLock(cat.id, athleteId, true)}
                                            disabled={busy}
                                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-amber-600 transition hover:bg-amber-100 disabled:opacity-40"
                                            title="Deblochează greutatea pentru corectare"
                                          ><Lock className="h-3 w-3" /></button>
                                        </span>
                                      ) : (
                                        <WeightCell preW={preW} dayW={dayW}
                                          onClick={() => athleteId && setEditingCell({ categoryId: cat.id, athleteId, field: 'current_weight_kg', value: dayW.toString() })}
                                        />
                                      )}
                                    </span>
                                  </div>
                                  {isDQ && (
                                    <div
                                      className="mt-1"
                                      onDoubleClick={() => athleteId && setEditingCell({ categoryId: cat.id, athleteId, field: 'disqualification_reason', value: dqReason })}
                                    >
                                      {isEditingReason ? (
                                        <InlineInput
                                          value={editingCell.value}
                                          onChange={v => setEditingCell(prev => ({ ...prev, value: v }))}
                                          onSave={handleSaveEdit}
                                          onCancel={() => setEditingCell(null)}
                                          wide
                                        />
                                      ) : (
                                        <span className="cursor-pointer rounded px-1 text-red-500 hover:bg-muted" title="Dublu-click pentru a edita motivul">{dqReason || '(click pt motiv DQ)'}</span>
                                      )}
                                    </div>
                                  )}
                                  {exceedsCategory && (
                                    <div className="mt-1 flex flex-col gap-0.5 rounded border border-amber-400 bg-amber-50 px-1 py-1">
                                      <span className="text-[9px] font-semibold text-amber-700">Depășește categoria</span>
                                      <select
                                        value={dayTarget}
                                        onChange={(event) => {
                                          const nextValue = event.target.value;
                                          setDayAssignTargets((prev) => ({ ...prev, [dayRowKey]: nextValue }));
                                          setDayAssignManual((prev) => ({ ...prev, [dayRowKey]: true }));
                                        }}
                                        className="w-full rounded border border-amber-300 bg-white px-1 py-0.5 text-[10px]"
                                      >
                                        <option value="">Selectează categoria</option>
                                        {dayReassignOptions.map((c) => (
                                          <option key={`day-opt-${dayRowKey}-${c.id}`} value={c.id}>{c.name}</option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={!dayTarget || busy}
                                        onClick={() => {
                                          const targetCat = categories.find((c) => c.id === Number(dayTarget));
                                          const targetLabel = targetCat?.name || 'categoria selectată';
                                          setConfirmModal({
                                            title: 'Mută sportivul',
                                            message: `Confirmi mutarea lui ${name || 'sportivul selectat'} la ${targetLabel}?`,
                                            icon: '↔️',
                                            color: 'orange',
                                            confirmLabel: 'Mută',
                                            onConfirm: async () => {
                                              setBusy(true);
                                              try {
                                                await reassignDayRowToCategory({ cat, enrollment: entry }, athleteId, dayW, isWeightLocked, dayTarget);
                                                setAssignNotice(`${name || 'Sportivul'} a fost mutat la ${targetLabel}.`);
                                              } finally {
                                                setBusy(false);
                                                setConfirmModal(null);
                                              }
                                            },
                                          });
                                        }}
                                        className="w-full rounded border border-amber-600 bg-amber-500 px-1 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
                                        title="Mută sportivul la categoria selectată"
                                      >Mută</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
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

        const ageBounds = { dateStart, dateEnd, allowYounger };
        let filtered = hasDateRange && !ignoreAgeRule
          ? allAthletes.filter((ath) => !ageRuleViolation(ath, ageBounds))
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
            className="fixed z-[110] w-80 overflow-hidden border-2 border-border bg-card"
            style={{ top, left }}
          >
            <div className="border-b-2 border-border bg-secondary px-3 py-3">
              <p className="truncate text-sm font-black uppercase tracking-wide text-foreground">Etapa de pre-inscriere</p>
              <div className="mt-1 text-xs text-foreground">
                {group?.name || 'Grupa'} - {GENDER_LABELS[groupPicker.gender] || groupPicker.gender}
              </div>
              {hasDateRange && (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nascuti {dateStart} - {allowYounger ? 'inf (tineri acceptati)' : dateEnd}
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={ignoreAgeRule}
                      onChange={(e) => setIgnoreAgeRule(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>Arată și sportivii în afara grupei de vârstă</span>
                  </label>
                </>
              )}
            </div>
            <div className="border-b border-border px-3 py-2">
              <input
                type="text"
                autoFocus
                placeholder="Cauta sportiv sau club..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring w-full"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {loadingAthletes ? (
                <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">Se incarca...</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground italic">Niciun sportiv disponibil.</div>
              ) : (
                filtered.map((ath) => {
                  const isRegistered = registeredIds.has(ath.id);
                  const violation = ageRuleViolation(ath, ageBounds);
                  return (
                    <button
                      key={`group-pick-${ath.id}`}
                      onClick={async () => {
                        await toggleGroupEnrollment(group, ath, groupPicker.gender);
                      }}
                      disabled={busy}
                      className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                        isRegistered ? 'bg-green-50 hover:bg-green-100 text-foreground' : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center border text-sm font-bold ${
                        isRegistered ? 'bg-green-500 border-green-500 text-white' : 'border-input text-transparent'
                      }`}>✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{ath.last_name} {ath.first_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{ath.club?.name || 'Fara club'}{ath.date_of_birth ? ` · ${ath.date_of_birth}` : ''}</span>
                        {violation && (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                            ⚠ {violation}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted px-3 py-2">
              <span className="text-xs text-muted-foreground">{filtered.length} sportivi disponibili</span>
              <button onClick={() => setGroupPicker(null)} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent">Inchide</button>
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

        const ageBounds = { dateStart, dateEnd, allowYounger };
        let athleteOptions = hasDateRange && !ignoreAgeRule
          ? allAthletes.filter((ath) => !ageRuleViolation(ath, ageBounds))
          : allAthletes;

        if (selectedCategory?.gender && selectedCategory.gender !== 'mixt') {
          athleteOptions = athleteOptions.filter((ath) => !ath.gender || ath.gender === selectedCategory.gender);
        }

        // Once an athlete is picked, the input displays their full label
        // (name + club) rather than what was typed to find them - don't
        // filter against that label if the dropdown is reopened, or it
        // would match nothing and show an empty list.
        const q = manualEnrollDraft.athleteId ? '' : manualEnrollSearch.toLowerCase();
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
          <Dialog open={manualEnrollOpen} onOpenChange={(open) => { if (!open) setManualEnrollOpen(false); }}>
            <DialogContent fullScreen>
              <DialogHeader><DialogTitle>Inscriere manuala sportiv in pre-inscriere</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs font-semibold text-muted-foreground">Grupa</Label>
                  <select
                    value={manualEnrollDraft.groupId}
                    onChange={(e) => {
                      setManualEnrollDraft((prev) => ({ ...prev, groupId: e.target.value, categoryId: '', athleteId: '' }));
                      setManualEnrollSearch('');
                    }}
                    className="w-full rounded border border-input px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecteaza grupa</option>
                    {groups.map((g) => (
                      <option key={`manual-group-${g.id}`} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-semibold text-muted-foreground">Categorie</Label>
                  <select
                    value={manualEnrollDraft.categoryId}
                    onChange={(e) => {
                      setManualEnrollDraft((prev) => ({ ...prev, categoryId: e.target.value, athleteId: '' }));
                      setManualEnrollSearch('');
                    }}
                    className="w-full rounded border border-input px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecteaza categoria</option>
                    {availableCategories.map((cat) => (
                      <option key={`manual-cat-${cat.id}`} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="relative md:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Label className="block text-xs font-semibold text-muted-foreground">Sportiv (cauta dupa nume/club)</Label>
                    {hasDateRange && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={ignoreAgeRule}
                          onChange={(e) => setIgnoreAgeRule(e.target.checked)}
                          className="h-3 w-3"
                        />
                        <span>Arată și sportivii în afara grupei de vârstă</span>
                      </label>
                    )}
                  </div>
                  <Input
                    type="text"
                    value={manualEnrollSearch}
                    onChange={(e) => {
                      setManualEnrollSearch(e.target.value);
                      setManualEnrollDraft((prev) => ({ ...prev, athleteId: '' }));
                      setManualEnrollDropdownOpen(true);
                    }}
                    onFocus={(e) => { setManualEnrollDropdownOpen(true); e.target.select(); }}
                    onBlur={() => window.setTimeout(() => setManualEnrollDropdownOpen(false), 150)}
                    placeholder="Ex: Popescu / Club ..."
                    autoComplete="off"
                  />
                  {manualEnrollDropdownOpen && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-input bg-card shadow-lg">
                      {athleteOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs italic text-muted-foreground">Niciun sportiv gasit.</div>
                      ) : (
                        athleteOptions.map((ath) => {
                          const athLabel = `${ath.last_name} ${ath.first_name} - ${ath.club?.name || 'Fara club'}`;
                          const isSelected = String(ath.id) === String(manualEnrollDraft.athleteId);
                          const violation = ageRuleViolation(ath, ageBounds);
                          return (
                            <button
                              key={`manual-ath-opt-${ath.id}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setManualEnrollDraft((prev) => ({ ...prev, athleteId: String(ath.id) }));
                                setManualEnrollSearch(athLabel);
                                setManualEnrollDropdownOpen(false);
                              }}
                              className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-muted ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-foreground'}`}
                            >
                              {athLabel}
                              {violation && (
                                <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                                  ⚠ {violation}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-semibold text-muted-foreground">Greutate trimisa (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={manualEnrollDraft.weight}
                    onChange={(e) => setManualEnrollDraft((prev) => ({ ...prev, weight: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setManualEnrollOpen(false)}>Renunta</Button>
                <Button
                  size="sm"
                  disabled={!manualEnrollDraft.categoryId || !manualEnrollDraft.athleteId || busy}
                  onClick={async () => { await handleManualEnroll(); }}
                >
                  Inscrie sportiv
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
            className="fixed z-[100] w-80 overflow-hidden border-2 border-border bg-card"
            style={{ top, left }}
          >
            <div className="border-b-2 border-border bg-secondary px-3 py-3">
              <p className="truncate text-sm font-black uppercase tracking-wide text-foreground">
                Adaugă sportivi
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                {groupLabel && <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{groupLabel}</span>}
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{catName}</span>
              </div>
              {hasDateRange && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                </p>
              )}
            </div>
            <div className="border-b border-border px-3 py-2">
              <input
                type="text"
                autoFocus
                placeholder="Caută sportiv sau club…"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring w-full"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {loadingAthletes ? (
                <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">Se încarcă…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground italic">
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
                      className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                        isEnrolled
                          ? 'bg-green-50 hover:bg-green-100 text-foreground'
                          : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center border text-sm font-bold ${
                        isEnrolled
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-input text-transparent'
                      }`}>✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{ath.last_name} {ath.first_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{clubName || 'Fără club'}{ath.date_of_birth ? ` · ${ath.date_of_birth}` : ''}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {enrolledIds.size} înscriș{enrolledIds.size !== 1 ? 'i' : ''} · {filtered.length} afișați
              </span>
              <button onClick={() => setPickerCatId(null)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent">Închide</button>
            </div>
          </div>
        );
      })()}

      {athleteDrawer && (
        <>
          <div className="fixed inset-0 z-[125] bg-black/30" onClick={closeAthleteDrawer} />
          <aside className="fixed right-0 top-0 z-[130] h-full w-full max-w-md overflow-y-auto border-l-2 border-border bg-card shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-secondary px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Detalii sportiv</h3>
                <p className="text-xs text-muted-foreground">
                  {(athleteDrawer.last_name || '').trim()} {(athleteDrawer.first_name || '').trim()}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAthleteDrawer}
                className="rounded border border-input bg-background px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Inchide
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded border border-border bg-muted p-3 text-sm">
                <div><span className="font-semibold">Nume:</span> {(athleteDrawer.last_name || '').trim()} {(athleteDrawer.first_name || '').trim() || '—'}</div>
                <div><span className="font-semibold">Club:</span> {athleteDrawer.club?.name || '—'}</div>
                <div><span className="font-semibold">Gen:</span> {GENDER_LABELS[athleteDrawer.gender] || athleteDrawer.gender || '—'}</div>
                <div><span className="font-semibold">Data nasterii:</span> {formatBirthDateRo(athleteDrawer.date_of_birth)}</div>
                <div><span className="font-semibold">Varsta:</span> {formatAgeRo(athleteDrawer.date_of_birth)}</div>
              </div>

              <div className="rounded border border-border">
                <div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">Informatii complete</div>
                <div className="max-h-[55vh] overflow-auto">
                  {athleteDrawerRows.map(([key, value]) => (
                    <div key={`athlete-row-${key}`} className="grid grid-cols-[140px_1fr] gap-2 border-b border-border px-3 py-2 text-xs">
                      <span className="font-semibold text-muted-foreground">{key}</span>
                      <span className="break-words text-foreground">{value}</span>
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
function TH({ children, small, highlight }) {
  return (
    <th
      className={`bg-muted px-1.5 py-1.5 text-center font-bold text-foreground ${
        highlight ? 'border-y border-border border-l-2 border-r-2 border-l-amber-500 border-r-amber-500' : 'border border-border'
      } ${small ? 'text-[10px] whitespace-normal leading-tight' : 'text-xs whitespace-nowrap'}`}
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
function WeightCell({ preW, dayW, onClick, locked }) {
  const interactionClass = locked ? '' : 'cursor-pointer hover:bg-blue-50';
  const title = locked ? 'Greutate blocată' : 'Dublu-click pentru a edita';
  if (!dayW && dayW !== 0) {
    return (
      <span className={`px-1 rounded text-muted-foreground ${interactionClass}`} title={title} onClick={locked ? undefined : onClick}>
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
    <span className={`px-1 rounded ${color} ${interactionClass}`} title={title} onClick={locked ? undefined : onClick}>
      {dayW}
    </span>
  );
}
