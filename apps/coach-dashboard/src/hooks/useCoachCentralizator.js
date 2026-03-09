import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { categoryAPI, groupAPI, clubAPI, enrollmentAPI, athleteAPI, competitionAPI, teamAPI } from '@shared/lib/api';
import { useAuth } from '@shared';

const isTeamCategoryType = (type) => type === 'team' || type === 'teams';

/**
 * Hook for the coach-dashboard centralizator.
 * Read-only view of the full competition grid — enrollment/unenrollment
 * is restricted to the coach's own club only.
 */
export default function useCoachCentralizator(eventId) {
  const { user } = useAuth();
  const myClubId = user?.athlete?.club ?? null;

  const [groups, setGroups]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [clubs, setClubs]           = useState([]);
  const [eventData, setEventData]   = useState(null);
  const [loading, setLoading]       = useState(false);
  const [busy, setBusy]             = useState(false);

  // Confirm modal (unenroll)
  const [confirmModal, setConfirmModal] = useState(null);

  // Weight modal for fight categories
  const [weightModal, setWeightModal] = useState(null); // { athleteId, catId, athleteName }
  const [weightValue, setWeightValue] = useState('');

  // Enrollment picker
  const [enrollPickerCell, setEnrollPickerCell] = useState(null);
  const [clubAthleteCache, setClubAthleteCache] = useState({});
  const enrollPickerRef = useRef(null);
  const [teamBuilderBusy, setTeamBuilderBusy] = useState(false);

  /* ── data fetching ── */
  const fetchAll = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [gRes, cRes, clRes, evRes] = await Promise.all([
        groupAPI.list({ event: eventId }),
        categoryAPI.list({ event: eventId }),
        clubAPI.list(),
        competitionAPI.get(eventId).catch(() => ({ data: null })),
      ]);
      setGroups(Array.isArray(gRes.data) ? gRes.data : gRes.data.results ?? []);
      setCategories(Array.isArray(cRes.data) ? cRes.data : cRes.data.results ?? []);
      setClubs(Array.isArray(clRes.data) ? clRes.data : clRes.data.results ?? []);
      if (evRes.data) setEventData(evRes.data);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventId) {
      setClubAthleteCache({});
      setEnrollPickerCell(null);
      fetchAll();
    } else {
      setGroups([]);
      setCategories([]);
      setClubs([]);
      setEventData(null);
    }
  }, [eventId, fetchAll]);

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

      struct.push({ group, genderSections, cats: groupCats, colSpan: groupCats.length || 1 });
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

    // Coach sees only their own club
    const filteredClubs = myClubId ? clubs.filter(c => c.id === myClubId) : clubs;
    const rows = filteredClubs.map(club => ({
      clubId: club.id,
      club: club.name,
      athletes: (athletesByClubId[club.id] || []).sort((a, b) => {
        const aCount = Object.keys(a.enrollments || {}).length;
        const bCount = Object.keys(b.enrollments || {}).length;
        if (aCount !== bCount) return bCount - aCount;
        return a.name.localeCompare(b.name);
      }),
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
     HANDLERS (coach-restricted — own club only)
     ════════════════════════════════════════════════════ */

  const handleUnenroll = (enrollmentId, athleteName, catName, e, options = {}) => {
    e.stopPropagation();
    const enrollmentType = options.enrollmentType || 'athlete';
    setConfirmModal({
      title: enrollmentType === 'team' ? 'Scoate echipa' : 'Scoate sportivul',
      message: enrollmentType === 'team'
        ? `Ești sigur că vrei să scoți echipa „${athleteName}" din categoria „${catName}"?`
        : `Ești sigur că vrei să scoți sportivul „${athleteName}" din categoria „${catName}"?`,
      icon: '🚫',
      color: 'orange',
      confirmLabel: enrollmentType === 'team' ? 'Scoate echipa' : 'Scoate din categorie',
      onConfirm: async () => {
        setBusy(true);
        try {
          if (enrollmentType === 'team') {
            await enrollmentAPI.categoryTeams.delete(enrollmentId);
          } else {
            await enrollmentAPI.categoryAthletes.delete(enrollmentId);
          }
          await fetchAll();
        } finally { setBusy(false); setConfirmModal(null); }
      },
    });
  };

  const handleCellClick = async (clubId, catId, e) => {
    e.stopPropagation();
    // Only allow opening the picker for the coach's own club
    if (clubId !== myClubId) return;

    if (enrollPickerCell && enrollPickerCell.clubId === clubId && enrollPickerCell.catId === catId) {
      setEnrollPickerCell(null);
      return;
    }
    setEnrollPickerCell({ clubId, catId });
    if (!clubAthleteCache[clubId]) {
      try {
        const res = await athleteAPI.list({ club: clubId });
        const athletes = Array.isArray(res.data) ? res.data : res.data.results ?? [];
        setClubAthleteCache(prev => ({ ...prev, [clubId]: athletes }));
      } catch (err) { console.error('Failed to fetch athletes', err); }
    }
  };

  const handleToggleEnroll = async (athleteId, catId, weight) => {
    setBusy(true);
    try {
      const cat = categories.find(c => c.id === catId);
      const existing = cat?.enrolled_athletes?.find(ea => (ea.athlete_details?.id || ea.athlete) === athleteId);
      if (existing) {
        await enrollmentAPI.categoryAthletes.delete(existing.id);
        await fetchAll();
      } else {
        // If fight category and no weight provided yet, show weight modal
        const isFight = cat?.type === 'fight' || cat?.category_type === 'fight';
        if (isFight && weight === undefined) {
          const allAthletes = clubAthleteCache[myClubId] || [];
          const ath = allAthletes.find(a => a.id === athleteId);
          const athName = ath ? `${ath.last_name} ${ath.first_name}` : `#${athleteId}`;
          setWeightModal({ athleteId, catId, athleteName: athName });
          setWeightValue('');
          setBusy(false);
          return;
        }
        const payload = { athlete: athleteId, category: catId };
        if (weight) payload.weight = weight;
        await enrollmentAPI.categoryAthletes.create(payload);
        await fetchAll();
      }
    } finally { setBusy(false); }
  };

  const handleWeightSubmit = async () => {
    if (!weightModal) return;
    const { athleteId, catId } = weightModal;
    setWeightModal(null);
    await handleToggleEnroll(athleteId, catId, weightValue || null);
  };

  const createTeamEnrollment = async (catId, athleteIds) => {
    const cat = categories.find((item) => item.id === catId);
    if (!cat || !isTeamCategoryType(cat.type) || athleteIds.length < 2) return;

    const selectedIds = [...new Set((athleteIds || []).map(Number).filter(Boolean))];
    const clubAthletes = clubAthleteCache[myClubId] || [];
    const selectedAthletes = clubAthletes.filter((athlete) => selectedIds.includes(athlete.id));
    if (selectedAthletes.length !== selectedIds.length) {
      window.alert('Poți adăuga doar sportivi din clubul tău.');
      return;
    }

    const selectedSignature = selectedAthletes.map((athlete) => athlete.id).sort((a, b) => a - b).join('-');
    const duplicateTeam = (cat.enrolled_teams || []).find((team) => {
      const memberSignature = (team.members || []).map((member) => member.id).sort((a, b) => a - b).join('-');
      return memberSignature && memberSignature === selectedSignature;
    });
    if (duplicateTeam) {
      window.alert('Echipa este deja înscrisă în această categorie.');
      return;
    }

    setTeamBuilderBusy(true);
    setBusy(true);
    try {
      const { data: team } = await teamAPI.create({ name: `Team ${Date.now()}` });
      for (const athleteId of selectedIds) {
        await teamAPI.members.create({ team: team.id, athlete: athleteId });
      }
      await enrollmentAPI.categoryTeams.create({ category: catId, team: team.id });
      setEnrollPickerCell(null);
      await fetchAll();
    } catch (error) {
      console.error('Failed to enroll team', error);
      window.alert(error?.response?.data?.error || 'Nu s-a putut înrola echipa.');
    } finally {
      setBusy(false);
      setTeamBuilderBusy(false);
    }
  };

  /* ── close menus on outside click / escape ── */
  useEffect(() => {
    if (!eventId) return;
    const handleClick = (e) => {
      if (enrollPickerCell && enrollPickerRef.current && !enrollPickerRef.current.contains(e.target)) setEnrollPickerCell(null);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') { setEnrollPickerCell(null); setConfirmModal(null); }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [enrollPickerCell, eventId]);

  return {
    myClubId,
    loading, busy, setBusy,
    groups, categories, clubs,
    eventData, eventYear, eventDateStr,
    sortedCategories, columnStructure, allCols,
    clubRows, athleteMap, countPerCat, totalAthletes,
    // UI state
    confirmModal, setConfirmModal,
    enrollPickerCell, setEnrollPickerCell, clubAthleteCache, enrollPickerRef,
    weightModal, setWeightModal, weightValue, setWeightValue,
    teamBuilderBusy,
    // Handlers
    fetchAll,
    handleUnenroll,
    handleCellClick,
    handleToggleEnroll,
    handleWeightSubmit,
    createTeamEnrollment,
  };
}
