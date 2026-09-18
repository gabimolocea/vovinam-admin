import { useState } from 'react';
import { categoryAPI, groupAPI, clubAPI, competitionAPI } from '@shared/lib/api';
import useCoachCentralizator from './useCoachCentralizator';

/**
 * Admin-only extension of useCoachCentralizator: same data/enrollment
 * plumbing (shared so enroll/unenroll/team-build behave identically), plus
 * group/category structure management (create, rename, delete, reorder)
 * and "generate standard structure" - none of which a coach can do.
 *
 * No optimistic local state updates for structure mutations (the coach
 * hook doesn't expose raw setGroups/setCategories) - each mutation just
 * refetches via fetchAll(). Acceptable for a pre-event admin screen.
 */
export default function useAdminCentralizator(eventId) {
  const ctx = useCoachCentralizator(eventId);
  const { groups, categories, clubs, fetchAll, setConfirmModal, setBusy } = ctx;

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');

  const [groupModal, setGroupModal] = useState(null);
  const [groupForm, setGroupForm] = useState({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false });
  const [catModal, setCatModal] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', category_type: 'solo', gender: 'male' });

  const [dragType, setDragType] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const [generatingDefaults, setGeneratingDefaults] = useState(false);

  /* ── group/category CRUD ── */
  const handleCustomGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: groupForm.name.trim(), event: eventId,
        birth_date_start: groupForm.birth_date_start || null,
        birth_date_end: groupForm.birth_date_end || null,
        allow_younger: groupForm.allow_younger || false,
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
        try {
          await categoryAPI.delete(id);
          await fetchAll();
        } finally { setBusy(false); setConfirmModal(null); }
      },
    });
  };

  /* ── rename ── */
  const handleGroupRenameStart = (group) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const handleGroupRenameSubmit = async (group) => {
    const newName = editingGroupName.trim();
    setEditingGroupId(null);
    if (!newName || newName === group.name) return;
    try { await groupAPI.update(group.id, { ...group, name: newName }); }
    finally { await fetchAll(); }
  };

  const handleToggleAllowYounger = async (group) => {
    try { await groupAPI.update(group.id, { ...group, allow_younger: !group.allow_younger }); }
    finally { await fetchAll(); }
  };

  const handleCatRenameStart = (cat) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
  };

  const handleCatRenameSubmit = async (cat) => {
    const newName = editingCatName.trim();
    setEditingCatId(null);
    if (!newName || newName === cat.name) return;
    try { await categoryAPI.update(cat.id, { name: newName }); }
    finally { await fetchAll(); }
  };

  /* ── drag & drop reorder ── */
  const handleGroupDragStart = (e, groupId) => { setDragType('group'); setDragId(groupId); e.dataTransfer.effectAllowed = 'move'; };
  const handleGroupDragOver = (e, groupId) => { if (dragType !== 'group' || dragId === groupId) return; e.preventDefault(); setDragOverId(groupId); };
  const handleGroupDrop = async (e, targetGroupId) => {
    e.preventDefault();
    if (dragType !== 'group' || !dragId || dragId === targetGroupId) return;
    const oldOrder = groups.map(g => g.id);
    const fromIdx = oldOrder.indexOf(dragId);
    const toIdx = oldOrder.indexOf(targetGroupId);
    setDragType(null); setDragId(null); setDragOverId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...oldOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    try { await groupAPI.reorder(newOrder); } finally { await fetchAll(); }
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
    setDragType(null); setDragId(null); setDragOverId(null);
    if (!src || !tgt || src.group !== tgt.group) return;
    const groupCats = ctx.sortedCategories.filter(c => c.group === src.group);
    const oldOrder = groupCats.map(c => c.id);
    const fromIdx = oldOrder.indexOf(dragId);
    const toIdx = oldOrder.indexOf(targetCatId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...oldOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    try { await categoryAPI.reorder(newOrder); } finally { await fetchAll(); }
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
    setDragType(null); setDragId(null); setDragOverId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...oldOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    try { await clubAPI.reorder(newOrder); } finally { await fetchAll(); }
  };

  /* ── generate standard structure ── */
  const handleGenerateStandardStructure = async () => {
    if (!eventId || generatingDefaults) return;
    const shouldContinue = window.confirm(
      'Generez grupele și categoriile standard lipsă pentru această competiție? Elementele existente nu vor fi duplicate.'
    );
    if (!shouldContinue) return;

    setGeneratingDefaults(true);
    try {
      const { data } = await competitionAPI.generateStandardGroupsCategories(eventId);
      await fetchAll();
      const result = data?.result || {};
      window.alert(
        `Sincronizare finalizată. Grupe create: ${result.groups_created || 0}, actualizate: ${result.groups_updated || 0}; categorii create: ${result.categories_created || 0}, actualizate: ${result.categories_updated || 0}.`
      );
    } catch (err) {
      window.alert(err.response?.data?.detail || 'Nu s-au putut genera grupele și categoriile standard.');
    } finally {
      setGeneratingDefaults(false);
    }
  };

  return {
    ...ctx,
    editingGroupId, setEditingGroupId, editingGroupName, setEditingGroupName,
    editingCatId, setEditingCatId, editingCatName, setEditingCatName,
    groupModal, setGroupModal, groupForm, setGroupForm,
    catModal, setCatModal, catForm, setCatForm,
    dragType, dragId, dragOverId,
    generatingDefaults,
    handleGenerateStandardStructure,
    handleCustomGroup, handleDeleteGroup,
    handleAddCustomCat, handleDeleteCat,
    handleGroupRenameStart, handleGroupRenameSubmit, handleToggleAllowYounger,
    handleCatRenameStart, handleCatRenameSubmit,
    handleGroupDragStart, handleGroupDragOver, handleGroupDrop,
    handleCatDragStart, handleCatDragOver, handleCatDrop, handleDragEnd,
    handleClubDragStart, handleClubDragOver, handleClubDrop,
  };
}
