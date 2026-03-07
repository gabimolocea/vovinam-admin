import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { categoryAPI, groupAPI, clubAPI, enrollmentAPI, athleteAPI, competitionAPI, fightWeightAPI } from '@shared/lib/api';

/**
 * Shared hook for Centralizator / Tehnica / Lupta pages.
 * Owns all data fetching, derived state, and mutation handlers.
 */
export default function useCentralizator() {
  const { id: eventId } = useParams();

  const [groups, setGroups]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [clubs, setClubs]           = useState([]);
  const [eventData, setEventData]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState(false);

  // UI state for group/category management
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Modal state
  const [groupModal, setGroupModal] = useState(null);
  const [groupForm, setGroupForm]   = useState({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false });
  const [catModal, setCatModal]     = useState(null);
  const [catForm, setCatForm]       = useState({ name: '', category_type: 'solo', gender: 'male' });
  const [confirmModal, setConfirmModal] = useState(null);

  // Drag & drop
  const [dragType, setDragType]     = useState(null);
  const [dragId, setDragId]         = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Enrollment picker
  const [enrollPickerCell, setEnrollPickerCell] = useState(null);
  const [clubAthleteCache, setClubAthleteCache] = useState({});
  const enrollPickerRef = useRef(null);

  // Inline weight editing
  const [editingWeight, setEditingWeight] = useState(null);

  // Fight athlete weights (separate model for fight categories)
  const [fightWeights, setFightWeights] = useState([]);

  /* ── data fetching ── */
  const fetchAll = useCallback(async () => {
    const [gRes, cRes, clRes, evRes, fwRes] = await Promise.all([
      groupAPI.list({ event: eventId }),
      categoryAPI.list({ event: eventId }),
      clubAPI.list(),
      competitionAPI.get(eventId).catch(() => ({ data: null })),
      fightWeightAPI.list({ event: eventId }).catch(() => ({ data: [] })),
    ]);
    const g = Array.isArray(gRes.data) ? gRes.data : gRes.data.results ?? [];
    const c = Array.isArray(cRes.data) ? cRes.data : cRes.data.results ?? [];
    const cl = Array.isArray(clRes.data) ? clRes.data : clRes.data.results ?? [];
    const fw = Array.isArray(fwRes.data) ? fwRes.data : fwRes.data.results ?? [];
    setGroups(g);
    setCategories(c);
    setClubs(cl);
    setFightWeights(fw);
    if (evRes.data) setEventData(evRes.data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── derived data ── */
  const eventYear = useMemo(() => {
    if (eventData?.start_date) return new Date(eventData.start_date).getFullYear();
    return new Date().getFullYear();
  }, [eventData]);

  const eventDateStr = useMemo(() => {
    if (eventData?.start_date) return new Date(eventData.start_date).toISOString().slice(0, 10);
    return null;
  }, [eventData]);

  const sortedCategories = useMemo(() => {
    const genderPriority = { male: 0, female: 1, mixt: 2 };
    return [...categories].sort((a, b) => {
      if (a.group !== b.group) return (a.group ?? 0) - (b.group ?? 0);
      const ga = a.gender || 'mixt', gb = b.gender || 'mixt';
      if (ga !== gb) return (genderPriority[ga] ?? 3) - (genderPriority[gb] ?? 3);
      return (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id;
    });
  }, [categories]);

  const columnStructure = useMemo(() => {
    const struct = [];
    for (const group of groups) {
      const groupCats = sortedCategories.filter(c => c.group === group.id);
      if (groupCats.length === 0) {
        struct.push({ group, genderSections: [], cats: [], colSpan: 1 });
        continue;
      }
      const genderMap = {};
      for (const cat of groupCats) {
        const g = cat.gender || 'mixt';
        if (!genderMap[g]) genderMap[g] = [];
        genderMap[g].push(cat);
      }
      const genderOrder = ['male', 'female', 'mixt'];
      const genderSections = genderOrder
        .filter(g => genderMap[g])
        .map(g => ({ gender: g, cats: genderMap[g], colSpan: genderMap[g].length }));

      struct.push({
        group,
        genderSections,
        cats: groupCats,
        colSpan: groupCats.length || 1,
      });
    }
    return struct;
  }, [groups, sortedCategories]);

  const allCols = useMemo(() => columnStructure.flatMap(s => s.cats), [columnStructure]);

  const { clubRows, athleteMap } = useMemo(() => {
    const aMap = {};
    for (const cat of categories) {
      for (const enrollment of (cat.enrolled_athletes || [])) {
        const a = enrollment.athlete_details;
        if (!a) continue;
        const aid = a.id || enrollment.athlete;
        if (!aMap[aid]) {
          aMap[aid] = {
            id: aid,
            name: `${a.last_name || ''} ${a.first_name || ''}`.trim(),
            club: a.club?.name || '—',
            clubId: a.club?.id || 0,
            enrollments: {},
          };
        }
        aMap[aid].enrollments[cat.id] = enrollment;
      }
    }

    const athletesByClubId = {};
    for (const ath of Object.values(aMap)) {
      if (!athletesByClubId[ath.clubId]) athletesByClubId[ath.clubId] = [];
      athletesByClubId[ath.clubId].push(ath);
    }

    const rows = clubs.map(club => ({
      clubId: club.id,
      club: club.name,
      athletes: (athletesByClubId[club.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
    }));

    return { clubRows: rows, athleteMap: aMap };
  }, [categories, clubs]);

  const countPerCat = useMemo(() => {
    const counts = {};
    for (const cat of categories) {
      counts[cat.id] = cat.enrolled_athletes?.length ?? 0;
    }
    return counts;
  }, [categories]);

  const totalAthletes = Object.keys(athleteMap).length;

  /* ════════════════════════════════════════════════════
     HANDLERS
     ════════════════════════════════════════════════════ */
  const handleCustomGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: groupForm.name.trim(), event: eventId,
        birth_date_start: groupForm.birth_date_start || null,
        birth_date_end:   groupForm.birth_date_end   || null,
        allow_younger:    groupForm.allow_younger || false,
      };
      if (payload.birth_date_start) payload.birth_year_start = new Date(payload.birth_date_start).getFullYear();
      if (payload.birth_date_end) payload.birth_year_end = new Date(payload.birth_date_end).getFullYear();
      const res = await groupAPI.create(payload);
      const atIndex = groupModal?.atIndex ?? null;
      if (atIndex !== null) {
        const newId = res.data.id;
        const currentOrder = groups.map(g => g.id);
        currentOrder.splice(atIndex, 0, newId);
        await groupAPI.reorder(currentOrder);
      }
      setGroupModal(null);
      setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false });
      await fetchAll();
    } finally { setBusy(false); }
  };

  const handleDeleteGroup = (id) => {
    const group = groups.find(g => g.id === id);
    const groupCats = categories.filter(c => c.group === id);
    const groupName = group?.name || 'această grupă';
    setConfirmModal({
      title: 'Șterge grupa',
      message: groupCats.length
        ? `Ești sigur că vrei să ștergi grupa „${groupName}" împreună cu cele ${groupCats.length} categori${groupCats.length === 1 ? 'e' : 'i'} asociate?`
        : `Ești sigur că vrei să ștergi grupa „${groupName}"?`,
      detail: groupCats.length ? groupCats.map(c => c.name).join(', ') : null,
      icon: '🗑️',
      color: 'red',
      confirmLabel: 'Șterge grupa',
      onConfirm: async () => {
        setBusy(true);
        try {
          for (const c of groupCats) await categoryAPI.delete(c.id);
          await groupAPI.delete(id);
          await fetchAll();
        } finally { setBusy(false); setConfirmModal(null); }
      },
    });
  };

  const handleAddCustomCat = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim() || !catModal) return;
    setBusy(true);
    try {
      await categoryAPI.create({
        name: catForm.name.trim(),
        category_type: catForm.category_type,
        gender: catForm.gender,
        group_id: catModal.groupId,
        event: Number(eventId),
      });
      setCatModal(null);
      setCatForm({ name: '', category_type: 'solo', gender: 'male' });
      await fetchAll();
    } finally { setBusy(false); }
  };

  const handleUnenroll = (enrollmentId, athleteName, catName, e) => {
    e.stopPropagation();
    setConfirmModal({
      title: 'Scoate sportivul',
      message: `Ești sigur că vrei să scoți sportivul „${athleteName}" din categoria „${catName}"?`,
      icon: '🚫',
      color: 'orange',
      confirmLabel: 'Scoate din categorie',
      onConfirm: async () => {
        setBusy(true);
        try {
          await enrollmentAPI.categoryAthletes.delete(enrollmentId);
          await fetchAll();
        } finally { setBusy(false); setConfirmModal(null); }
      },
    });
  };

  const handleWeightSave = async (enrollmentId) => {
    if (!editingWeight || editingWeight.enrollmentId !== enrollmentId) return;
    const newWeight = editingWeight.value?.trim() || null;
    setEditingWeight(null);
    try {
      await enrollmentAPI.categoryAthletes.update(enrollmentId, { weight: newWeight });
      setCategories(prev => prev.map(cat => ({
        ...cat,
        enrolled_athletes: (cat.enrolled_athletes || []).map(ea =>
          ea.id === enrollmentId ? { ...ea, weight: newWeight } : ea
        ),
      })));
    } catch (err) {
      console.error('Weight update failed:', err);
      await fetchAll();
    }
  };

  const handleDeleteCat = (id) => {
    const cat = categories.find(c => c.id === id);
    const catName = cat?.name || 'această categorie';
    const enrolledCount = cat?.enrolled_athletes?.length || 0;
    setConfirmModal({
      title: 'Șterge categoria',
      message: enrolledCount
        ? `Ești sigur că vrei să ștergi categoria „${catName}"? ${enrolledCount} sportiv${enrolledCount === 1 ? '' : 'i'} înscriși vor fi eliminați.`
        : `Ești sigur că vrei să ștergi categoria „${catName}"?`,
      icon: '🗑️',
      color: 'red',
      confirmLabel: 'Șterge categoria',
      onConfirm: async () => {
        setBusy(true);
        try { await categoryAPI.delete(id); await fetchAll(); }
        finally { setBusy(false); setConfirmModal(null); }
      },
    });
  };

  const handleGroupRenameStart = (group) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const handleGroupRenameSubmit = async (group) => {
    const newName = editingGroupName.trim();
    setEditingGroupId(null);
    if (!newName || newName === group.name) return;
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: newName } : g));
    try { await groupAPI.update(group.id, { ...group, name: newName }); }
    catch { await fetchAll(); }
  };

  const handleToggleAllowYounger = async (group) => {
    const newVal = !group.allow_younger;
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, allow_younger: newVal } : g));
    try { await groupAPI.update(group.id, { ...group, allow_younger: newVal }); }
    catch { await fetchAll(); }
  };

  const handleCatRenameStart = (cat) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
  };

  const handleCatRenameSubmit = async (cat) => {
    const newName = editingCatName.trim();
    setEditingCatId(null);
    if (!newName || newName === cat.name) return;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: newName } : c));
    try { await categoryAPI.update(cat.id, { name: newName }); }
    catch { await fetchAll(); }
  };

  /* ── Drag & drop ── */
  const handleGroupDragStart = (e, groupId) => { setDragType('group'); setDragId(groupId); e.dataTransfer.effectAllowed = 'move'; };
  const handleGroupDragOver = (e, groupId) => { if (dragType !== 'group' || dragId === groupId) return; e.preventDefault(); setDragOverId(groupId); };
  const handleGroupDrop = async (e, targetGroupId) => {
    e.preventDefault();
    if (dragType !== 'group' || !dragId || dragId === targetGroupId) return;
    const oldOrder = groups.map(g => g.id);
    const fromIdx = oldOrder.indexOf(dragId);
    const toIdx = oldOrder.indexOf(targetGroupId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...oldOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    const reordered = newOrder.map((id, idx) => ({ ...groups.find(g => g.id === id), display_order: idx }));
    setGroups(reordered);
    setDragType(null); setDragId(null); setDragOverId(null);
    try { await groupAPI.reorder(newOrder); } catch { await fetchAll(); }
  };

  const handleCatDragStart = (e, catId) => { setDragType('category'); setDragId(catId); e.dataTransfer.effectAllowed = 'move'; };
  const handleCatDragOver = (e, catId) => {
    if (dragType !== 'category' || dragId === catId) return;
    const src = categories.find(c => c.id === dragId);
    const tgt = categories.find(c => c.id === catId);
    if (!src || !tgt || src.group !== tgt.group) return;
    e.preventDefault();
    setDragOverId(catId);
  };
  const handleCatDrop = async (e, targetCatId) => {
    e.preventDefault();
    if (dragType !== 'category' || !dragId || dragId === targetCatId) return;
    const src = categories.find(c => c.id === dragId);
    const tgt = categories.find(c => c.id === targetCatId);
    if (!src || !tgt || src.group !== tgt.group) return;
    const groupCats = sortedCategories.filter(c => c.group === src.group);
    const oldOrder = groupCats.map(c => c.id);
    const fromIdx = oldOrder.indexOf(dragId);
    const toIdx = oldOrder.indexOf(targetCatId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...oldOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    const updated = categories.map(c => {
      const idx = newOrder.indexOf(c.id);
      return idx !== -1 ? { ...c, display_order: idx } : c;
    });
    setCategories(updated);
    setDragType(null); setDragId(null); setDragOverId(null);
    try { await categoryAPI.reorder(newOrder); } catch { await fetchAll(); }
  };

  const handleDragEnd = () => { setDragType(null); setDragId(null); setDragOverId(null); };

  const handleClubDragStart = (e, clubId) => { setDragType('club'); setDragId(clubId); e.dataTransfer.effectAllowed = 'move'; };
  const handleClubDragOver = (e, clubId) => { if (dragType !== 'club' || dragId === clubId) return; e.preventDefault(); setDragOverId(clubId); };
  const handleClubDrop = async (e, targetClubId) => {
    e.preventDefault();
    if (dragType !== 'club' || !dragId || dragId === targetClubId) return;
    const oldOrder = clubs.map(c => c.id);
    const fromIdx = oldOrder.indexOf(dragId);
    const toIdx = oldOrder.indexOf(targetClubId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...oldOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    const reordered = newOrder.map((id, idx) => ({ ...clubs.find(c => c.id === id), display_order: idx }));
    setClubs(reordered);
    setDragType(null); setDragId(null); setDragOverId(null);
    try { await clubAPI.reorder(newOrder); } catch { await fetchAll(); }
  };

  const handleCellClick = async (clubId, catId, e) => {
    e.stopPropagation();
    if (enrollPickerCell && enrollPickerCell.clubId === clubId && enrollPickerCell.catId === catId) {
      setEnrollPickerCell(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setEnrollPickerCell({ clubId, catId, rect });
    const cacheKey = clubId ?? '__all__';
    if (!clubAthleteCache[cacheKey]) {
      try {
        const params = clubId ? { club: clubId } : {};
        const res = await athleteAPI.list(params);
        const athletes = Array.isArray(res.data) ? res.data : res.data.results ?? [];
        setClubAthleteCache(prev => ({ ...prev, [cacheKey]: athletes }));
      } catch (err) { console.error('Failed to fetch athletes', err); }
    }
  };

  const handleToggleEnroll = async (athleteId, catId) => {
    setBusy(true);
    try {
      const cat = categories.find(c => c.id === catId);
      const existing = cat?.enrolled_athletes?.find(ea => (ea.athlete_details?.id || ea.athlete) === athleteId);
      if (existing) {
        await enrollmentAPI.categoryAthletes.delete(existing.id);
      } else {
        await enrollmentAPI.categoryAthletes.create({ athlete: athleteId, category: catId });
      }
      await fetchAll();
    } finally { setBusy(false); }
  };

  /* ── close menus on outside click ── */
  useEffect(() => {
    const handleClick = (e) => {
      if (enrollPickerCell && enrollPickerRef.current && !enrollPickerRef.current.contains(e.target)) setEnrollPickerCell(null);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') { setGroupModal(null); setCatModal(null); setEnrollPickerCell(null); setConfirmModal(null); }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [enrollPickerCell]);

  return {
    eventId, loading, busy, setBusy,
    groups, setGroups, categories, setCategories, clubs, setClubs,
    eventData, eventYear, eventDateStr,
    sortedCategories, columnStructure, allCols,
    clubRows, athleteMap, countPerCat, totalAthletes,
    // UI state
    editingGroupId, setEditingGroupId, editingGroupName, setEditingGroupName,
    editingCatId, setEditingCatId, editingCatName, setEditingCatName,
    groupModal, setGroupModal, groupForm, setGroupForm,
    catModal, setCatModal, catForm, setCatForm,
    confirmModal, setConfirmModal,
    dragType, dragId, dragOverId,
    enrollPickerCell, setEnrollPickerCell, clubAthleteCache, enrollPickerRef,
    editingWeight, setEditingWeight,
    // Handlers
    fetchAll,
    handleCustomGroup, handleDeleteGroup,
    handleAddCustomCat, handleDeleteCat,
    handleUnenroll, handleWeightSave,
    handleGroupRenameStart, handleGroupRenameSubmit, handleToggleAllowYounger,
    handleCatRenameStart, handleCatRenameSubmit,
    handleGroupDragStart, handleGroupDragOver, handleGroupDrop,
    handleCatDragStart, handleCatDragOver, handleCatDrop, handleDragEnd,
    handleClubDragStart, handleClubDragOver, handleClubDrop,
    handleCellClick, handleToggleEnroll,
    // Fight weights
    fightWeights, setFightWeights, fightWeightAPI,
  };
}
