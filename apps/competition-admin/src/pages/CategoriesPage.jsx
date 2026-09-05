import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categoryAPI, groupAPI, clubAPI, enrollmentAPI, athleteAPI, competitionAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';



const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const TYPE_LABELS = { solo: 'Solo', team: 'Echipă', fight: 'Luptă' };

const GENDER_BG = { male: 'bg-blue-100', female: 'bg-pink-100', mixt: 'bg-amber-100' };

export default function CategoriesPage() {
  const { id: eventId } = useParams();

  const [groups, setGroups]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [clubs, setClubs]           = useState([]);
  const [eventData, setEventData]   = useState(null); // { start_date, name, ... }
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState(false);

  // UI state for group/category management
  const [editingGroupId, setEditingGroupId] = useState(null); // group being renamed
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingCatId, setEditingCatId] = useState(null); // category being renamed
  const [editingCatName, setEditingCatName] = useState('');
  const navigate = useNavigate();

  // Modal state for group creation
  const [groupModal, setGroupModal] = useState(null); // { atIndex } or null
  const [groupForm, setGroupForm]   = useState({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false });
  // Modal state for category creation
  const [catModal, setCatModal] = useState(null); // { groupId } or null
  const [catForm, setCatForm]   = useState({ name: '', category_type: 'solo', gender: 'male' });
  // Confirmation modal for delete actions
  // { title, message, detail?, icon, color, confirmLabel, onConfirm } or null
  const [confirmModal, setConfirmModal] = useState(null);

  // Sheet tabs
  const [activeSheet, setActiveSheet] = useState('centralizator');

  // Drag & drop state
  const [dragType, setDragType] = useState(null); // 'group' | 'category' | 'club'
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Enrollment picker state
  const [enrollPickerCell, setEnrollPickerCell] = useState(null); // { clubId, catId, rect }
  const [clubAthleteCache, setClubAthleteCache] = useState({});   // { clubId: [athletes] }
  const enrollPickerRef = useRef(null);

  // Inline weight editing state for Tehnica/Lupta sheets
  const [editingWeight, setEditingWeight] = useState(null); // { enrollmentId, value }

  /* ── data fetching ── */
  const fetchAll = useCallback(async () => {
    const [gRes, cRes, clRes, evRes] = await Promise.all([
      groupAPI.list({ event: eventId }),
      categoryAPI.list({ event: eventId }),
      clubAPI.list(),
      competitionAPI.get(eventId).catch(() => ({ data: null })),
    ]);
    const g = Array.isArray(gRes.data) ? gRes.data : gRes.data.results ?? [];
    const c = Array.isArray(cRes.data) ? cRes.data : cRes.data.results ?? [];
    const cl = Array.isArray(clRes.data) ? clRes.data : clRes.data.results ?? [];
    setGroups(g);
    setCategories(c);
    setClubs(cl);
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


  // Categories sorted by group, then by gender label, then by name
  const sortedCategories = useMemo(() => {
    const genderPriority = { male: 0, female: 1, mixt: 2 };
    return [...categories].sort((a, b) => {
      if (a.group !== b.group) return (a.group ?? 0) - (b.group ?? 0);
      const ga = a.gender || 'mixt', gb = b.gender || 'mixt';
      if (ga !== gb) return (genderPriority[ga] ?? 3) - (genderPriority[gb] ?? 3);
      return (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id;
    });
  }, [categories]);

  // Build the multi-level column structure: Group → Gender sections → individual categories
  const columnStructure = useMemo(() => {
    const struct = [];
    for (const group of groups) {
      const groupCats = sortedCategories.filter(c => c.group === group.id);
      if (groupCats.length === 0) {
        struct.push({ group, genderSections: [], cats: [], colSpan: 1 });
        continue;
      }
      // Group categories by gender
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

  // All categories in column order (flattened from columnStructure)
  const allCols = useMemo(() => columnStructure.flatMap(s => s.cats), [columnStructure]);

  // Build the ROW data: one row per (club, athlete) combination
  // Uses backend clubs list so ALL clubs are shown, ordered by display_order
  const { clubRows, athleteMap } = useMemo(() => {
    const aMap = {};   // athleteId → { name, club, clubId, enrollments: { catId → enrollmentData } }
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

    // Group enrolled athletes by club ID
    const athletesByClubId = {};
    for (const ath of Object.values(aMap)) {
      if (!athletesByClubId[ath.clubId]) athletesByClubId[ath.clubId] = [];
      athletesByClubId[ath.clubId].push(ath);
    }

    // Build rows from backend clubs list (keeps display_order from backend)
    const rows = clubs.map(club => ({
      clubId: club.id,
      club: club.name,
      athletes: (athletesByClubId[club.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
    }));

    return { clubRows: rows, athleteMap: aMap };
  }, [categories, clubs]);

  // Count per category (for footer)
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
          await groupAPI.delete(id, { cascade_categories: true });
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

  /* ── Unenroll athlete directly from cell ── */
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

  /* ── Update weight on enrollment (inline edit from Tehnica/Lupta) ── */
  const handleWeightSave = async (enrollmentId) => {
    if (!editingWeight || editingWeight.enrollmentId !== enrollmentId) return;
    const newWeight = editingWeight.value?.trim() || null;
    setEditingWeight(null);
    try {
      await enrollmentAPI.categoryAthletes.update(enrollmentId, { weight: newWeight });
      // Update local state to avoid full refetch
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

  /* ── Inline rename handlers ── */
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

  /* ── Group drag & drop ── */
  const handleGroupDragStart = (e, groupId) => {
    setDragType('group');
    setDragId(groupId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleGroupDragOver = (e, groupId) => {
    if (dragType !== 'group' || dragId === groupId) return;
    e.preventDefault();
    setDragOverId(groupId);
  };

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

  /* ── Category drag & drop ── */
  const handleCatDragStart = (e, catId) => {
    setDragType('category');
    setDragId(catId);
    e.dataTransfer.effectAllowed = 'move';
  };

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

  /* ── Club drag & drop ── */
  const handleClubDragStart = (e, clubId) => {
    setDragType('club');
    setDragId(clubId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleClubDragOver = (e, clubId) => {
    if (dragType !== 'club' || dragId === clubId) return;
    e.preventDefault();
    setDragOverId(clubId);
  };

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

  /* ── Enrollment picker ── */
  const handleCellClick = async (clubId, catId, e) => {
    e.stopPropagation();
    // Toggle picker
    if (enrollPickerCell && enrollPickerCell.clubId === clubId && enrollPickerCell.catId === catId) {
      setEnrollPickerCell(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setEnrollPickerCell({ clubId, catId, rect });
    // Fetch club athletes if not cached
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

  /* ════════════════════════════════════════════════════
     RENDER — full-screen, no sidebar, no padding
     ════════════════════════════════════════════════════ */
  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Spinner /></div>;

  /* total columns = CLUB + all categories (or 1 per empty group) + insert zones (1 per group + 1 trailing) */
  const totalColSpan = 1 + (allCols.length || columnStructure.length) + columnStructure.length + 1;

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between border-b-2 border-yellow-400 bg-black px-3 py-2 shrink-0 text-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/competitions/${eventId}`)}
            className="border border-yellow-400 bg-white px-2 py-1 text-xs font-semibold text-gray-700 transition hover:bg-yellow-300 hover:text-black">
            ← Înapoi
          </button>
          <div className="h-4 w-px bg-yellow-400/30" />
          <h1 className="text-sm font-black uppercase tracking-wide text-yellow-200">
            {activeSheet === 'centralizator' ? 'Centralizator' : activeSheet === 'tehnica' ? 'Tehnică' : 'Luptă'}
          </h1>
          <span className="text-xs text-yellow-100/75">{eventData?.name || `Competiția #${eventId}`}</span>
          {eventDateStr && <span className="border border-yellow-400 bg-yellow-300 px-1.5 py-0.5 text-[10px] font-bold text-black">📅 {eventDateStr}</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-yellow-100/75">{groups.length} grupe</span>
          <span className="text-yellow-400/40">·</span>
          <span className="text-yellow-100/75">{categories.length} categorii</span>
          <span className="text-yellow-400/40">·</span>
          <span className="text-yellow-100/75">{clubs.length} cluburi</span>
          <span className="text-yellow-400/40">·</span>
          <span className="font-semibold text-yellow-300">{totalAthletes} sportivi</span>
        </div>
      </div>

      {/* ═══ TABLE — fills remaining space, always visible ═══ */}
      {activeSheet === 'centralizator' && (
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-[11px] w-max min-w-full">

          {/* ═══ ROW 1: Group headers + "+" add-group column ═══ */}
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-40 bg-gray-800 text-white border border-gray-600 px-3 py-2 text-left font-bold text-xs min-w-[140px]"
                rowSpan={3}>
                CLUB
              </th>
              {columnStructure.map((col, ci) => {
                return (
                  <React.Fragment key={col.group.id}>
                    {/* ── Between-group insert zone ── */}
                    <th className="border-none p-0 w-0 relative group/insert" rowSpan={3}>
                      <div className="absolute inset-y-0 -left-2 -right-2 z-30 flex items-center justify-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setGroupModal({ atIndex: ci }); setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false }); }}
                          className="opacity-0 group-hover/insert:opacity-100 inline-flex items-center gap-1 border border-black bg-yellow-300 text-[9px] font-bold text-black shadow-lg px-2.5 py-1 transition-all hover:scale-105 hover:bg-yellow-400 whitespace-nowrap"
                          title="Adaugă grupă aici"
                        >+ Adaugă grupă</button>
                      </div>
                    </th>

                    {/* ── Group header ── */}
                    <th colSpan={col.colSpan}
                      draggable
                      onDragStart={(e) => handleGroupDragStart(e, col.group.id)}
                      onDragOver={(e) => handleGroupDragOver(e, col.group.id)}
                      onDrop={(e) => handleGroupDrop(e, col.group.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-gray-700 text-white border border-gray-500 px-2 py-1.5 text-center font-bold text-xs whitespace-nowrap relative cursor-grab active:cursor-grabbing transition-all ${
                        dragType === 'group' && dragId === col.group.id ? 'opacity-40 scale-95' : ''
                      } ${dragType === 'group' && dragOverId === col.group.id ? 'ring-2 ring-yellow-300 ring-inset' : ''}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="opacity-40 text-[10px] select-none">⠿</span>
                        {editingGroupId === col.group.id ? (
                          <input
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onBlur={() => handleGroupRenameSubmit(col.group)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleGroupRenameSubmit(col.group); if (e.key === 'Escape') setEditingGroupId(null); }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white/20 border border-white/40 rounded px-1 py-0.5 text-white text-xs font-bold text-center w-28 outline-none focus:bg-white/30"
                            autoFocus
                          />
                        ) : (
                          <span onDoubleClick={(e) => { e.stopPropagation(); handleGroupRenameStart(col.group); }}
                            className="cursor-text" title="Dublu-click pentru a redenumi">
                            {col.group.name}
                            {(col.group.birth_date_start || col.group.birth_year_start) && (col.group.birth_date_end || col.group.birth_year_end) && (
                              <span className="font-normal opacity-70 text-[10px] ml-1">
                                ({col.group.birth_date_start
                                  ? `${col.group.birth_date_start} – ${col.group.birth_date_end}`
                                  : `${col.group.birth_year_start}–${col.group.birth_year_end}`})
                              </span>
                            )}
                          </span>
                        )}
                        {/* Allow younger toggle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleAllowYounger(col.group); }}
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-medium transition ${
                            col.group.allow_younger
                              ? 'bg-amber-400/30 text-amber-200 hover:bg-amber-400/50'
                              : 'bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70'
                          }`}
                          title={col.group.allow_younger ? 'Acceptă vârste mai mici (activ) — click pentru a dezactiva' : 'Permite sportivi mai tineri să urce la categorie superioară'}
                        >
                          <span>{col.group.allow_younger ? '⬆' : '⬆'}</span>
                          <span className="hidden sm:inline">{col.group.allow_younger ? 'Tineri ✓' : 'Tineri'}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setCatModal({ groupId: col.group.id }); setCatForm({ name: '', category_type: 'solo', gender: 'male' }); }}
                          className="inline-flex items-center gap-0.5 rounded-full bg-white/20 hover:bg-white/40 text-white text-[8px] font-semibold px-1.5 py-0.5 transition"
                          title="Adaugă categorie"
                        >+ Categorie</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(col.group.id); }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/15 hover:bg-red-500/80 text-white/60 hover:text-white text-xs font-bold transition"
                          title="Șterge grupa"
                        >×</button>
                      </div>
                    </th>
                  </React.Fragment>
                );
              })}

              {/* ═══ Trailing insert zone (after last group) ═══ */}
              <th className="border-none p-0 w-0 relative group/insert" rowSpan={3}>
                <div className="absolute inset-y-0 -left-2 right-0 z-30 flex items-center justify-center" style={{ minWidth: '24px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setGroupModal({ atIndex: columnStructure.length }); setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false }); }}
                    className="opacity-0 group-hover/insert:opacity-100 inline-flex items-center gap-1 rounded-full bg-blue-500 text-white text-[9px] font-semibold shadow-lg px-2.5 py-1 transition-all hover:scale-105 hover:bg-blue-600 whitespace-nowrap"
                    title="Adaugă grupă"
                  >+ Adaugă grupă</button>
                </div>
              </th>
            </tr>

            {/* ═══ ROW 2: Gender sub-headers ═══ */}
            <tr>
              {columnStructure.map(col =>
                col.genderSections.length === 0
                  ? <th key={`g-empty-${col.group.id}`} className="bg-gray-100 border border-gray-300 px-1 py-1 text-center text-[9px] text-gray-400 italic">
                      Fără categorii
                    </th>
                  : col.genderSections.map(gs => (
                      <th key={`${col.group.id}-${gs.gender}`} colSpan={gs.colSpan}
                        className={`${GENDER_BG[gs.gender] || 'bg-gray-100'} border border-gray-300 px-1 py-1 text-center font-bold text-[10px] uppercase tracking-wide text-gray-700`}>
                        {GENDER_LABELS[gs.gender] || gs.gender}
                      </th>
                    ))
              )}
            </tr>

            {/* ═══ ROW 3: Individual category names with delete ═══ */}
            <tr>
              {allCols.length === 0 && columnStructure.length > 0 ? (
                columnStructure.map(col => (
                  <th key={`empty-${col.group.id}`} className="bg-gray-50 border border-gray-300 px-1 py-1 text-center text-[9px] text-gray-300 italic min-w-[80px]">
                    click + sus
                  </th>
                ))
              ) : (
                allCols.map(cat => (
                  <th key={cat.id}
                    draggable
                    onDragStart={(e) => handleCatDragStart(e, cat.id)}
                    onDragOver={(e) => handleCatDragOver(e, cat.id)}
                    onDrop={(e) => handleCatDrop(e, cat.id)}
                    onDragEnd={handleDragEnd}
                    className={`bg-gray-50 border border-gray-300 px-1 py-1 text-center font-medium text-[10px] text-gray-700 min-w-[80px] group/cat cursor-grab active:cursor-grabbing transition-all ${
                      dragType === 'category' && dragId === cat.id ? 'opacity-40 scale-95' : ''
                    } ${dragType === 'category' && dragOverId === cat.id ? 'ring-2 ring-blue-400 ring-inset bg-blue-50' : ''}`}
                    title={`${cat.name} (${TYPE_LABELS[cat.type] || cat.type}) — trage pentru a reordona`}
                  >
                    <div className="leading-tight whitespace-normal relative">
                      {editingCatId === cat.id ? (
                        <input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onBlur={() => handleCatRenameSubmit(cat)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCatRenameSubmit(cat); if (e.key === 'Escape') setEditingCatId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-white border border-gray-400 rounded px-1 py-0.5 text-[10px] text-gray-800 font-medium text-center w-full outline-none focus:border-blue-400"
                          autoFocus
                        />
                      ) : (
                        <span onDoubleClick={(e) => { e.stopPropagation(); handleCatRenameStart(cat); }}
                          className="cursor-text" title="Dublu-click pentru a redenumi">
                          {cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}
                        </span>
                      )}
                      <button onClick={() => handleDeleteCat(cat.id)} disabled={busy}
                        className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-red-100 text-xs font-bold leading-none text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-40 sm:hidden sm:group-hover/cat:inline-flex sm:border-0 sm:bg-red-500 sm:text-white"
                        title="Șterge categoria">×</button>
                    </div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          {/* ═══ BODY: One row per athlete, grouped by club ═══ */}
          <tbody>
            {clubRows.length === 0 ? (
              <tr>
                <td colSpan={totalColSpan} className="px-4 py-12 text-center text-sm text-gray-400 italic">
                  {groups.length === 0
                    ? <><span className="text-2xl block mb-2">📋</span>Treci cu mouse-ul între coloane pentru a adăuga prima grupă de vârstă.</>
                    : allCols.length === 0
                    ? 'Apasă + pe header-ul fiecărei grupe pentru a adăuga categorii.'
                    : 'Niciun club în baza de date.'}
                </td>
              </tr>
            ) : (
              clubRows.map(({ clubId, club, athletes }) => {
                const rowCount = Math.max(athletes.length, 1);
                const isDraggedClub = dragType === 'club' && dragId === clubId;
                const isDragOverClub = dragType === 'club' && dragOverId === clubId;
                return athletes.length === 0 ? (
                  /* Club with no enrolled athletes — single empty row */
                  <tr key={`club-${clubId}`}
                    className={`border-t-2 border-gray-400 hover:bg-yellow-50/40 transition-colors ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                  >
                    <td className="sticky left-0 z-10 bg-white border border-gray-300 px-3 py-1.5 font-bold text-xs text-gray-900 align-middle cursor-grab active:cursor-grabbing select-none"
                      draggable
                      onDragStart={(e) => handleClubDragStart(e, clubId)}
                      onDragOver={(e) => handleClubDragOver(e, clubId)}
                      onDrop={(e) => handleClubDrop(e, clubId)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="opacity-40 text-[10px]">⠿</span>
                        <span className="text-blue-600">🏛</span>
                        {club}
                      </div>
                    </td>
                    {columnStructure.map(col => (
                      <React.Fragment key={`grp-${col.group.id}`}>
                        <td className="p-0 w-0 border-none"></td>
                        {col.cats.length === 0 ? (
                          <td className="border border-gray-200 text-gray-200"></td>
                        ) : col.cats.map(cat => {
                          const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                          return (
                            <td key={cat.id}
                              onClick={(e) => handleCellClick(clubId, cat.id, e)}
                              className={`border border-gray-200 px-1 py-1 text-center text-[10px] cursor-pointer transition-colors ${
                                isPickerOpen ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : 'hover:bg-blue-50'
                              }`}
                            ></td>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    <td className="border border-gray-100"></td>
                  </tr>
                ) : (
                  athletes.map((ath, athIdx) => (
                    <tr key={ath.id}
                      className={`${athIdx === 0 ? 'border-t-2 border-gray-400' : ''} hover:bg-yellow-50/40 transition-colors ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub && athIdx === 0 ? 'ring-t-2 ring-blue-400' : ''}`}
                    >
                      {athIdx === 0 && (
                        <td className="sticky left-0 z-10 bg-white border border-gray-300 px-3 py-1.5 font-bold text-xs text-gray-900 align-top cursor-grab active:cursor-grabbing select-none"
                          rowSpan={rowCount}
                          draggable
                          onDragStart={(e) => handleClubDragStart(e, clubId)}
                          onDragOver={(e) => handleClubDragOver(e, clubId)}
                          onDrop={(e) => handleClubDrop(e, clubId)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="opacity-40 text-[10px]">⠿</span>
                            <span className="text-blue-600">🏛</span>
                            {club}
                          </div>
                        </td>
                      )}
                      {columnStructure.map(col => (
                        <React.Fragment key={`grp-${col.group.id}`}>
                          <td className="p-0 w-0 border-none"></td>
                          {col.cats.length === 0 ? (
                            <td className="border border-gray-200 text-gray-200"></td>
                          ) : col.cats.map(cat => {
                            const enrollment = ath.enrollments[cat.id];
                            const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                            return (
                              <td key={cat.id}
                                onClick={(e) => handleCellClick(clubId, cat.id, e)}
                                className={`border border-gray-200 px-1 py-1 text-center text-[10px] cursor-pointer transition-colors ${
                                  isPickerOpen
                                    ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset'
                                    : enrollment ? 'bg-green-50 text-gray-800 hover:bg-green-100' : 'hover:bg-blue-50'
                                }`}
                              >
                                {enrollment ? (
                                  <span className="font-medium leading-tight block relative group/athlete" title={ath.name}>
                                    {ath.name}
                                      <button
                                        onClick={(e) => handleUnenroll(enrollment.id, ath.name, cat.name, e)}
                                        disabled={busy}
                                        className="absolute -top-1 -right-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-red-200 bg-red-100 text-[8px] font-bold leading-none text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-40 sm:hidden sm:group-hover/athlete:inline-flex sm:border-0 sm:bg-red-500 sm:text-white"
                                        title="Scoate sportivul din categorie"
                                      >×</button>
                                  </span>
                                ) : null}
                              </td>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      <td className="border border-gray-100"></td>
                    </tr>
                  ))
                );
              })
            )}
          </tbody>

          {/* ═══ FOOTER: participant count per category ═══ */}
          {allCols.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-400">
                <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-3 py-2 font-bold text-xs text-gray-700">
                  Număr participanți
                </td>
                {columnStructure.map(col => (
                  <React.Fragment key={`f-${col.group.id}`}>
                    <td className="p-0 w-0 border-none bg-gray-100"></td>
                    {col.cats.length === 0 ? (
                      <td className="border border-gray-300 bg-gray-100"></td>
                    ) : col.cats.map(cat => (
                      <td key={cat.id} className={`border px-1 py-2 text-center font-bold text-xs ${((countPerCat[cat.id] || 0) < 3) ? 'border-red-300 bg-red-100 text-red-700' : 'border-gray-300 text-gray-700'}`}>
                        {countPerCat[cat.id] || 0}
                      </td>
                    ))}
                  </React.Fragment>
                ))}
                <td className="border border-gray-100 bg-gray-100"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}

      {/* ═══ TEHNICA SHEET — Solo + Team categories detailed view ═══ */}
      {activeSheet === 'tehnica' && (
      <div className="flex-1 overflow-auto bg-white p-2">
        {(() => {
          // Collect solo/team categories that have enrolled athletes, deduplicated
          const seenCatIds = new Set();
          const techGroups = columnStructure
            .map(col => ({
              group: col.group,
              cats: col.cats.filter(c => {
                if (seenCatIds.has(c.id)) return false;
                if (c.type !== 'solo' && c.type !== 'team') return false;
                if (!c.enrolled_athletes || c.enrolled_athletes.length === 0) return false;
                seenCatIds.add(c.id);
                return true;
              }),
            }))
            .filter(g => g.cats.length > 0);

          if (techGroups.length === 0) {
            return (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm italic">
                <span>📋 Nu există sportivi înscriși în categorii de tip Solo sau Echipă. Înscrie-i din tab-ul Centralizator.</span>
              </div>
            );
          }

          // For each group, chunk categories in rows of MAX_COLS_PER_ROW for readability
          const MAX_COLS_PER_ROW = 4;

          return techGroups.map(({ group, cats }) => {
            // Split categories into chunks
            const chunks = [];
            for (let i = 0; i < cats.length; i += MAX_COLS_PER_ROW) {
              chunks.push(cats.slice(i, i + MAX_COLS_PER_ROW));
            }

            return (
              <React.Fragment key={`tech-grp-${group.id}`}>
                {chunks.map((chunk, chunkIdx) => {
                  const maxEnrolled = Math.max(1, ...chunk.map(c => (c.enrolled_athletes?.length || 0)));

                  return (
                    <div key={`tech-${group.id}-${chunkIdx}`} className="mb-8">
                      <table className="border-collapse text-[11px]">
                        <thead>
                          {/* Group header — yellow */}
                          <tr>
                            {chunk.map(cat => (
                              <th key={cat.id} colSpan={2}
                                className="bg-yellow-300 border border-gray-500 px-3 py-1.5 text-center font-bold text-xs text-gray-900">
                                {group.name}
                                {(group.birth_date_start || group.birth_year_start) && (
                                  <span className="font-normal ml-1">
                                    ( {group.birth_date_start
                                      ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
                                      : `${group.birth_year_start}–${group.birth_year_end}`} )
                                  </span>
                                )}
                              </th>
                            ))}
                          </tr>
                          {/* PROBA + Category name row */}
                          <tr>
                            {chunk.map(cat => (
                              <React.Fragment key={cat.id}>
                                <th className="bg-gray-200 border border-gray-500 px-2 py-1.5 text-left font-bold text-[10px] text-gray-700 uppercase tracking-wide w-[60px]">
                                  PROBA
                                </th>
                                <th className={`border border-gray-500 px-2 py-1.5 text-left font-bold text-[10px] uppercase tracking-wide min-w-[200px] ${
                                  cat.gender === 'male' ? 'bg-blue-100 text-blue-900' : cat.gender === 'female' ? 'bg-pink-100 text-pink-900' : 'bg-amber-100 text-amber-900'
                                }`}>
                                  {cat.name} - {GENDER_LABELS[cat.gender] || cat.gender}
                                </th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Enrolled athlete rows — only actual athletes, no empty filler rows */}
                          {Array.from({ length: maxEnrolled }).map((_, rowIdx) => (
                            <tr key={rowIdx}>
                              {chunk.map(cat => {
                                const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
                                  const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                                  const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                                  return na.localeCompare(nb);
                                });
                                const ath = enrolled[rowIdx];
                                const athleteDetails = ath?.athlete_details;
                                const athleteName = athleteDetails
                                  ? `${athleteDetails.last_name || ''} ${athleteDetails.first_name || ''}`.trim()
                                  : '';
                                const clubName = athleteDetails?.club?.name || '';
                                return (
                                  <React.Fragment key={cat.id}>
                                    <td className="border border-gray-300 px-1 py-0.5 text-[10px] w-[30px] text-center text-gray-400 bg-gray-50">
                                      {ath ? rowIdx + 1 : ''}
                                    </td>
                                    <td className={`border border-gray-300 px-1 py-0.5 text-[11px] min-w-[200px] ${ath ? 'text-gray-800' : ''}`}>
                                      {ath ? (
                                        <span className="flex items-center justify-between group/ath">
                                          <span>
                                            {athleteName}
                                            {clubName && <span className="text-gray-400 ml-1">({clubName})</span>}
                                          </span>
                                          <button
                                            onClick={(e) => handleUnenroll(ath.id, athleteName, cat.name, e)}
                                            disabled={busy}
                                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 text-[9px] font-bold leading-none hover:bg-red-500 hover:text-white disabled:opacity-40 shrink-0 ml-1 transition-colors"
                                            title="Scoate sportivul din categorie"
                                          >×</button>
                                        </span>
                                      ) : null}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          ))}
                          {/* + Adaugă row — one empty row per category with hover action */}
                          <tr>
                            {chunk.map(cat => (
                              <React.Fragment key={cat.id}>
                                <td className="border border-gray-200 px-1 py-0.5 w-[30px] bg-gray-50"></td>
                                <td
                                  className="border border-gray-200 px-1 py-1 min-w-[200px] cursor-pointer group/add hover:bg-blue-50 transition-colors"
                                  onClick={(e) => handleCellClick(null, cat.id, e)}
                                >
                                  <span className="hidden group-hover/add:inline-flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                                    <span className="text-blue-400">＋</span> {(cat.type === 'team' || cat.type === 'teams') ? 'Adaugă echipă' : 'Adaugă sportiv'}
                                  </span>
                                </td>
                              </React.Fragment>
                            ))}
                          </tr>
                          {/* Total row */}
                          <tr className="border-t-2 border-gray-500">
                            {chunk.map(cat => (
                              <React.Fragment key={cat.id}>
                                <td className="border border-gray-500 px-2 py-1.5 font-bold text-[10px] text-gray-700 bg-gray-100 text-center">
                                  TOTAL
                                </td>
                                <td className={`border border-gray-500 px-2 py-1.5 font-bold text-xs ${((cat.enrolled_athletes?.length || 0) < 3) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-900'}`}>
                                  {cat.enrolled_athletes?.length || 0}
                                </td>
                              </React.Fragment>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          });
        })()}
      </div>
      )}

      {/* ═══ LUPTA SHEET — Fight categories detailed view ═══ */}
      {activeSheet === 'lupta' && (
      <div className="flex-1 overflow-auto bg-white p-2">
        {(() => {
          // Collect fight categories that have enrolled athletes, deduplicated
          const seenFightIds = new Set();
          const fightGroups = columnStructure
            .map(col => ({
              group: col.group,
              cats: col.cats.filter(c => {
                if (seenFightIds.has(c.id)) return false;
                if (c.type !== 'fight') return false;
                if (!c.enrolled_athletes || c.enrolled_athletes.length === 0) return false;
                seenFightIds.add(c.id);
                return true;
              }),
            }))
            .filter(g => g.cats.length > 0);

          if (fightGroups.length === 0) {
            return (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm italic">
                <span>📋 Nu există sportivi înscriși în categorii de tip Luptă. Înscrie-i din tab-ul Centralizator.</span>
              </div>
            );
          }

          return fightGroups.map(({ group, cats }) => {
            // Group by gender
            const genderOrder = ['male', 'female', 'mixt'];
            const catsByGender = {};
            for (const cat of cats) {
              const g = cat.gender || 'mixt';
              if (!catsByGender[g]) catsByGender[g] = [];
              catsByGender[g].push(cat);
            }

            return (
              <div key={`fight-${group.id}`} className="mb-8">
                {genderOrder.filter(g => catsByGender[g]).map(gender => {
                  const genderCats = catsByGender[gender];
                  const totalGroupRows = genderCats.reduce((sum, c) => sum + Math.max((c.enrolled_athletes?.length || 0), 1), 0);

                  const flatRows = [];
                  let globalRowIdx = 0;
                  for (const cat of genderCats) {
                    const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
                      const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                      const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                      return na.localeCompare(nb);
                    });
                    const catLabel = cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '').replace(/Đối Kháng\s*/i, '').trim() || cat.name;
                    if (enrolled.length === 0) {
                      flatRows.push({ cat, catLabel, enrollment: null, enrolledCount: 0, isFirstInCat: true, isFirstRow: globalRowIdx === 0, totalGroupRows });
                      globalRowIdx++;
                    } else {
                      enrolled.forEach((enrollment, idx) => {
                        flatRows.push({ cat, catLabel, enrollment, enrolledCount: enrolled.length, isFirstInCat: idx === 0, isFirstRow: globalRowIdx === 0, totalGroupRows });
                        globalRowIdx++;
                      });
                    }
                  }

                  return (
                    <table key={`${group.id}-${gender}`} className="border-collapse text-[11px] mb-4">
                      <thead>
                        <tr>
                          <th colSpan={5}
                            className={`border border-gray-500 px-3 py-1 text-center font-bold text-xs uppercase tracking-wide ${
                              gender === 'male' ? 'bg-blue-200 text-blue-900' : gender === 'female' ? 'bg-pink-200 text-pink-900' : 'bg-amber-200 text-amber-900'
                            }`}>
                            {GENDER_LABELS[gender]}
                          </th>
                        </tr>
                        <tr>
                          <th className="bg-gray-200 border border-gray-500 px-3 py-1.5 text-center font-bold text-xs text-gray-800 min-w-[130px]">
                            GRUPA
                          </th>
                          <th className="bg-gray-200 border border-gray-500 px-3 py-1.5 text-center font-bold text-[10px] text-gray-800 min-w-[120px]">
                            ÎNSCRIS LA<br/>CATEGORIA (KG)
                          </th>
                          <th className="bg-gray-200 border border-gray-500 px-3 py-1.5 text-center font-bold text-[10px] text-gray-800 min-w-[220px]">
                            NUME PRACTICANT
                          </th>
                          <th className="bg-gray-200 border border-gray-500 px-3 py-1.5 text-center font-bold text-[10px] text-gray-800 min-w-[70px]">
                            KG
                          </th>
                          <th className="bg-gray-200 border border-gray-500 px-1 py-1.5 text-center font-bold text-[10px] text-gray-800 w-[30px]">
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {flatRows.map((row, ri) => {
                          const a = row.enrollment?.athlete_details;
                          const name = a ? `${a.last_name || ''} ${a.first_name || ''}`.trim() : '';
                          const club = a?.club?.name || '';
                          const enrollId = row.enrollment?.id;
                          const isEditing = editingWeight?.enrollmentId === enrollId;
                          const weight = row.enrollment?.weight || '';
                          return (
                            <tr key={ri}>
                              {row.isFirstRow && (
                                <td className="border border-gray-400 px-2 py-1 text-xs font-bold text-gray-800 align-top bg-white"
                                  rowSpan={row.totalGroupRows}>
                                  {group.name}
                                  {(group.birth_date_start || group.birth_year_start) && (
                                    <span className="font-normal text-[10px] block text-gray-500 mt-0.5">
                                      ({group.birth_date_start
                                        ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
                                        : `${group.birth_year_start}–${group.birth_year_end}`})
                                    </span>
                                  )}
                                </td>
                              )}
                              {row.isFirstInCat && (
                                  <td className={`border border-gray-400 px-2 py-1 text-center text-[10px] font-semibold ${((row.enrolledCount || 0) < 3) ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}
                                  rowSpan={row.enrolledCount || 1}>
                                  {row.catLabel}
                                </td>
                              )}
                              <td className="border border-gray-300 px-2 py-1 text-[11px] text-gray-800">
                                {name}
                                {club && name && <span className="text-gray-400 ml-1">({club})</span>}
                              </td>
                              <td className="border border-gray-300 px-1 py-0.5 text-center text-[11px] text-gray-700 font-medium min-w-[70px]"
                                onDoubleClick={() => enrollId && setEditingWeight({ enrollmentId: enrollId, value: weight.toString() })}>
                                {enrollId ? (
                                  isEditing ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      className="w-full text-center text-[11px] border border-blue-400 rounded px-1 py-0.5 outline-none bg-blue-50"
                                      value={editingWeight.value}
                                      onChange={(e) => setEditingWeight({ enrollmentId: enrollId, value: e.target.value })}
                                      onBlur={() => handleWeightSave(enrollId)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleWeightSave(enrollId);
                                        if (e.key === 'Escape') setEditingWeight(null);
                                      }}
                                    />
                                  ) : (
                                    <span className="cursor-pointer hover:bg-blue-50 px-1 rounded" title="Dublu-click pentru a edita">
                                      {weight || '–'}
                                    </span>
                                  )
                                ) : null}
                              </td>
                              <td className="border border-gray-300 px-0.5 py-0.5 text-center w-[30px]">
                                {enrollId && (
                                  <button
                                    onClick={(e) => handleUnenroll(enrollId, name, row.cat.name, e)}
                                    disabled={busy}
                                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 text-[9px] font-bold leading-none hover:bg-red-500 hover:text-white disabled:opacity-40 transition-colors"
                                    title="Scoate sportivul din categorie"
                                  >×</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })}
              </div>
            );
          });
        })()}
      </div>
      )}

      {/* ═══ BOTTOM TAB BAR (Google Sheets style) ═══ */}
      <div className="shrink-0 flex items-center border-t-2 border-yellow-400 bg-black px-1 h-10 gap-0.5 select-none">
        {[
          { key: 'centralizator', label: 'CENTRALIZATOR', icon: '📊' },
          { key: 'tehnica',       label: 'Tehnica',       icon: '🥋' },
          { key: 'lupta',         label: 'Lupta',         icon: '🥊' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSheet(tab.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all border border-b-0 ${
              activeSheet === tab.key
                ? 'bg-yellow-300 text-black border-yellow-400 shadow-sm -mb-px z-10'
                : 'bg-white text-gray-700 border-yellow-400/60 hover:bg-yellow-200 hover:text-black'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-yellow-100/75 pr-2">
          {groups.length} grupe · {categories.length} categorii · {totalAthletes} sportivi
        </span>
      </div>

      {/* ═══ GROUP CREATION MODAL ═══ */}
      {groupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setGroupModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-900">Grupă personalizată</h2>
              <button onClick={() => setGroupModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleCustomGroup} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nume grupă *</label>
                <input required value={groupForm.name}
                  onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: U16 Special, Masters 40+"
                  className="frvv-input w-full" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Data nașterii — de la</label>
                  <input type="date" value={groupForm.birth_date_start}
                    onChange={e => setGroupForm(f => ({ ...f, birth_date_start: e.target.value }))}
                    className="frvv-input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Data nașterii — până la</label>
                  <input type="date" value={groupForm.birth_date_end}
                    onChange={e => setGroupForm(f => ({ ...f, birth_date_end: e.target.value }))}
                    className="frvv-input w-full" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={groupForm.allow_younger}
                  onChange={e => setGroupForm(f => ({ ...f, allow_younger: e.target.checked }))}
                  className="border border-black text-yellow-500 focus:ring-0" />
                <span className="text-xs text-gray-700">Permite sportivi mai tineri să urce la categorie superioară</span>
              </label>
              {eventDateStr && (
                <p className="text-[10px] text-gray-400">📅 Data evenimentului: {eventDateStr} (anul de referință: {eventYear})</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setGroupModal(null)}
                  className="frvv-btn-secondary text-xs">Anulează</button>
                <button type="submit" disabled={busy}
                  className="frvv-btn-primary text-xs">Creează grupă</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ CATEGORY CREATION MODAL ═══ */}
      {catModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setCatModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-900">Categorie personalizată</h2>
              <button onClick={() => setCatModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <form onSubmit={handleAddCustomCat} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nume categorie *</label>
                <input required value={catForm.name}
                  onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Quyền Duo Mixt"
                  className="frvv-input w-full" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tip</label>
                  <select value={catForm.category_type}
                    onChange={e => setCatForm(f => ({ ...f, category_type: e.target.value }))}
                    className="frvv-input w-full">
                    <option value="solo">Solo (Quyền)</option>
                    <option value="team">Echipă (Song Luyện / Đa Luyện)</option>
                    <option value="fight">Luptă (Đối Kháng)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Gen</label>
                  <select value={catForm.gender}
                    onChange={e => setCatForm(f => ({ ...f, gender: e.target.value }))}
                    className="frvv-input w-full">
                    <option value="male">Masculin</option>
                    <option value="female">Feminin</option>
                    <option value="mixt">Mixt</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCatModal(null)}
                  className="frvv-btn-secondary text-xs">Anulează</button>
                <button type="submit" disabled={busy}
                  className="frvv-btn-primary text-xs">Creează categorie</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ CONFIRMATION MODAL (delete / unenroll) ═══ */}
      {confirmModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="text-4xl mb-3">{confirmModal.icon || '⚠️'}</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{confirmModal.message}</p>
              {confirmModal.detail && (
                <p className="mt-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 max-h-20 overflow-y-auto">
                  {confirmModal.detail}
                </p>
              )}
            </div>
            <div className="flex border-t border-gray-200">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition border-r border-gray-200"
              >Anulează</button>
              <button
                onClick={confirmModal.onConfirm}
                disabled={busy}
                className={`flex-1 px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                  confirmModal.color === 'orange'
                    ? 'text-orange-600 hover:bg-orange-50'
                    : 'text-red-600 hover:bg-red-50'
                }`}
              >{confirmModal.confirmLabel || 'Confirmă'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ENROLLMENT PICKER POPOVER ═══ */}
      {enrollPickerCell && (() => {
        const { clubId, catId, rect } = enrollPickerCell;
        const isAllMode = clubId === null;
        const cacheKey = clubId ?? '__all__';
        const clubName = isAllMode ? 'Toți sportivii' : (clubs.find(c => c.id === clubId)?.name || '—');
        const cat = categories.find(c => c.id === catId);
        const catName = cat?.name || '—';
        const allClubAthletes = clubAthleteCache[cacheKey] || [];
        const isLoading = !clubAthleteCache[cacheKey];
        const enrolledIds = new Set(
          (cat?.enrolled_athletes || [])
            .filter(ea => {
              if (isAllMode) return true;
              const aClub = ea.athlete_details?.club;
              return aClub?.id === clubId || aClub === clubId;
            })
            .map(ea => ea.athlete_details?.id || ea.athlete)
        );

        // Find the group for this category and its date range
        const group = groups.find(g => g.id === cat?.group);
        const dateStart = group?.birth_date_start || (group?.birth_year_start ? `${group.birth_year_start}-01-01` : null);
        const dateEnd = group?.birth_date_end || (group?.birth_year_end ? `${group.birth_year_end}-12-31` : null);
        const hasDateRange = dateStart && dateEnd;
        const allowYounger = group?.allow_younger || false;

        // Filter athletes by date range if group has one
        // dateStart = earliest birth date (oldest athletes), dateEnd = latest birth date (youngest athletes)
        // When allow_younger: skip the upper bound (dateEnd) so younger athletes can enter a higher age group
        const athleteList = hasDateRange
          ? allClubAthletes.filter(ath => {
              if (!ath.date_of_birth) return false;
              // Must be born on or after dateStart (not too old)
              if (ath.date_of_birth < dateStart) return false;
              // If allow_younger is OFF, must be born on or before dateEnd (not too young)
              if (!allowYounger && ath.date_of_birth > dateEnd) return false;
              return true;
            })
          : allClubAthletes;

        const outOfRangeCount = hasDateRange ? allClubAthletes.length - athleteList.length : 0;

        // Position: below the cell, clamped to viewport
        const top = Math.min(rect.bottom + 4, window.innerHeight - 360);
        const left = Math.min(rect.left, window.innerWidth - 280);

        return (
          <div ref={enrollPickerRef}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[100] w-72 rounded-lg border border-gray-200 bg-white shadow-2xl"
            style={{ top, left }}
          >
            <div className="p-2 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wide truncate">{isAllMode ? '👥' : '🏛'} {clubName}</p>
              <p className="text-[9px] text-gray-400 truncate">{catName}</p>
              {hasDateRange && (
                <p className="text-[8px] text-blue-500 mt-0.5">
                  📅 Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                  {eventDateStr && <span className="text-gray-400 ml-1">· Eveniment: {eventDateStr}</span>}
                </p>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-[10px] text-gray-400">Se încarcă…</div>
              ) : athleteList.length === 0 ? (
                <div className="p-4 text-center text-[10px] text-gray-400 italic">
                  {hasDateRange
                    ? `Niciun sportiv din acest club nu se încadrează în intervalul de vârstă (${outOfRangeCount} exclu${outOfRangeCount === 1 ? 's' : 'și'}).`
                    : 'Niciun sportiv în acest club.'}
                </div>
              ) : (
                athleteList.map(ath => {
                  const isEnrolled = enrolledIds.has(ath.id);
                  const dob = ath.date_of_birth;
                  return (
                    <button key={ath.id}
                      onClick={() => handleToggleEnroll(ath.id, catId)}
                      disabled={busy}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors disabled:opacity-50 ${
                        isEnrolled
                          ? 'bg-green-50 hover:bg-green-100 text-gray-800'
                          : 'hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[9px] font-bold ${
                        isEnrolled
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 text-transparent'
                      }`}>✓</span>
                      <span className="truncate flex-1">{ath.last_name} {ath.first_name}</span>
                      {dob && <span className="text-[8px] text-gray-400 shrink-0">{dob}</span>}
                    </button>
                  );
                })
              )}
            </div>
            {outOfRangeCount > 0 && (
              <div className="px-2 py-1 border-t border-gray-100 text-[8px] text-gray-400">
                {outOfRangeCount} sportiv{outOfRangeCount === 1 ? '' : 'i'} din club nu se încadrează în vârstă
              </div>
            )}
            <div className="p-1.5 border-t border-gray-100 text-center">
              <button onClick={() => setEnrollPickerCell(null)}
                className="text-[9px] text-gray-400 hover:text-gray-600 transition">Închide</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
