import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { categoryAPI, groupAPI } from '@shared/lib/api';
import { PageHeader, Card, Spinner, EmptyState } from '@shared/components/ui';

/* ── Standard Vovinam age-group presets ─────────────── */
const currentYear = new Date().getFullYear();

const AGE_GROUP_PRESETS = [
  { name: 'Grupa 0 (8-9 ani)',      birth_year_start: currentYear - 9,  birth_year_end: currentYear - 8 },
  { name: 'Grupa 1 (10-13 ani)',     birth_year_start: currentYear - 13, birth_year_end: currentYear - 10 },
  { name: 'Grupa 2 (14-15 ani)',     birth_year_start: currentYear - 15, birth_year_end: currentYear - 14 },
  { name: 'Grupa 3 (16-18 ani)',     birth_year_start: currentYear - 18, birth_year_end: currentYear - 16 },
  { name: 'Seniori Grade Mici',      birth_year_start: currentYear - 35, birth_year_end: currentYear - 19 },
  { name: 'Seniori Grade Mari',      birth_year_start: currentYear - 50, birth_year_end: currentYear - 19 },
];

/* ── Standard category presets for bulk-adding ── */
const STANDARD_CATEGORIES = [
  { name: 'Quyền - Masculin',       category_type: 'solo',  gender: 'male' },
  { name: 'Quyền - Feminin',        category_type: 'solo',  gender: 'female' },
  { name: 'Song Luyện - Masculin',   category_type: 'team',  gender: 'male' },
  { name: 'Song Luyện - Feminin',    category_type: 'team',  gender: 'female' },
  { name: 'Song Luyện - Mixt',       category_type: 'team',  gender: 'mixt' },
  { name: 'Đa Luyện - Masculin',    category_type: 'team',  gender: 'male' },
  { name: 'Đa Luyện - Feminin',     category_type: 'team',  gender: 'female' },
  { name: 'Đa Luyện - Mixt',        category_type: 'team',  gender: 'mixt' },
  { name: 'Đối Kháng -54kg M',      category_type: 'fight', gender: 'male' },
  { name: 'Đối Kháng -60kg M',      category_type: 'fight', gender: 'male' },
  { name: 'Đối Kháng -68kg M',      category_type: 'fight', gender: 'male' },
  { name: 'Đối Kháng -75kg M',      category_type: 'fight', gender: 'male' },
  { name: 'Đối Kháng -82kg M',      category_type: 'fight', gender: 'male' },
  { name: 'Đối Kháng +82kg M',      category_type: 'fight', gender: 'male' },
  { name: 'Đối Kháng -48kg F',      category_type: 'fight', gender: 'female' },
  { name: 'Đối Kháng -55kg F',      category_type: 'fight', gender: 'female' },
  { name: 'Đối Kháng -62kg F',      category_type: 'fight', gender: 'female' },
  { name: 'Đối Kháng +62kg F',      category_type: 'fight', gender: 'female' },
];

const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const TYPE_LABELS = { solo: 'Solo', team: 'Echipă', fight: 'Luptă' };

/* ── Color schemes for groups ── */
const GROUP_COLORS = [
  { bg: 'bg-blue-600',    text: 'text-white',    light: 'bg-blue-50',    border: 'border-blue-200' },
  { bg: 'bg-emerald-600', text: 'text-white',    light: 'bg-emerald-50', border: 'border-emerald-200' },
  { bg: 'bg-purple-600',  text: 'text-white',    light: 'bg-purple-50',  border: 'border-purple-200' },
  { bg: 'bg-orange-600',  text: 'text-white',    light: 'bg-orange-50',  border: 'border-orange-200' },
  { bg: 'bg-rose-600',    text: 'text-white',    light: 'bg-rose-50',    border: 'border-rose-200' },
  { bg: 'bg-teal-600',    text: 'text-white',    light: 'bg-teal-50',    border: 'border-teal-200' },
  { bg: 'bg-yellow-600',  text: 'text-white',    light: 'bg-yellow-50',  border: 'border-yellow-200' },
  { bg: 'bg-indigo-600',  text: 'text-white',    light: 'bg-indigo-50',  border: 'border-indigo-200' },
];

const GENDER_BG = { male: 'bg-blue-100', female: 'bg-pink-100', mixt: 'bg-amber-100' };

export default function CategoriesPage() {
  const { id: eventId } = useParams();

  const [groups, setGroups]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState(false);

  // UI state for group/category management
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [customGroup, setCustomGroup]     = useState({ name: '', birth_year_start: '', birth_year_end: '' });
  const [showSetup, setShowSetup]         = useState(false);

  /* ── data fetching ── */
  const fetchAll = useCallback(async () => {
    const [gRes, cRes] = await Promise.all([
      groupAPI.list({ event: eventId }),
      categoryAPI.list({ event: eventId }),
    ]);
    const g = Array.isArray(gRes.data) ? gRes.data : gRes.data.results ?? [];
    const c = Array.isArray(cRes.data) ? cRes.data : cRes.data.results ?? [];
    setGroups(g);
    setCategories(c);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── derived data ── */
  const existingGroupNames = useMemo(() => new Set(groups.map(g => g.name)), [groups]);

  // Categories sorted by group, then by gender label, then by name
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      if (a.group !== b.group) return (a.group ?? 0) - (b.group ?? 0);
      const ga = a.gender || 'mixt', gb = b.gender || 'mixt';
      if (ga !== gb) return ga.localeCompare(gb);
      return (a.name || '').localeCompare(b.name || '');
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
  // Collect all athletes across all categories, keyed by athlete id
  const { clubRows, athleteMap } = useMemo(() => {
    const aMap = {};   // athleteId → { name, club, details, enrollments: { catId → enrollmentData } }
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

    // Group athletes by club
    const clubMap = {};
    for (const ath of Object.values(aMap)) {
      if (!clubMap[ath.club]) clubMap[ath.club] = [];
      clubMap[ath.club].push(ath);
    }

    // Sort clubs alphabetically, athletes within club alphabetically
    const rows = Object.entries(clubMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([club, athletes]) => ({
        club,
        athletes: athletes.sort((a, b) => a.name.localeCompare(b.name)),
      }));

    return { clubRows: rows, athleteMap: aMap };
  }, [categories]);

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
  const handleAddGroupPreset = async (preset) => {
    if (existingGroupNames.has(preset.name)) return;
    setBusy(true);
    try { await groupAPI.create({ ...preset, event: eventId }); await fetchAll(); }
    finally { setBusy(false); }
  };

  const handleAddAllPresets = async () => {
    const toAdd = AGE_GROUP_PRESETS.filter(p => !existingGroupNames.has(p.name));
    if (!toAdd.length) return;
    setBusy(true);
    try {
      for (const p of toAdd) await groupAPI.create({ ...p, event: eventId });
      await fetchAll();
    } finally { setBusy(false); }
  };

  const handleCustomGroup = async (e) => {
    e.preventDefault();
    if (!customGroup.name.trim()) return;
    setBusy(true);
    try {
      await groupAPI.create({
        name: customGroup.name.trim(), event: eventId,
        birth_year_start: customGroup.birth_year_start ? Number(customGroup.birth_year_start) : null,
        birth_year_end:   customGroup.birth_year_end   ? Number(customGroup.birth_year_end)   : null,
      });
      setCustomGroup({ name: '', birth_year_start: '', birth_year_end: '' });
      setShowGroupForm(false);
      await fetchAll();
    } finally { setBusy(false); }
  };

  const handleDeleteGroup = async (id) => {
    const groupCats = categories.filter(c => c.group === id);
    const msg = groupCats.length
      ? `Ștergi grupa și cele ${groupCats.length} categorii asociate?`
      : 'Ștergi această grupă de vârstă?';
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      for (const c of groupCats) await categoryAPI.delete(c.id);
      await groupAPI.delete(id);
      await fetchAll();
    } finally { setBusy(false); }
  };

  const handleAddStandardCats = async (groupId) => {
    const existing = new Set(categories.filter(c => c.group === groupId).map(c => c.name));
    const toAdd = STANDARD_CATEGORIES.filter(c => !existing.has(c.name));
    if (!toAdd.length) return;
    setBusy(true);
    try {
      const cats = toAdd.map(c => ({ ...c, group_id: groupId }));
      await categoryAPI.bulkAdd(eventId, cats);
      await fetchAll();
    } finally { setBusy(false); }
  };

  const handleDeleteCat = async (id) => {
    if (!confirm('Ștergi această categorie?')) return;
    setBusy(true);
    try { await categoryAPI.delete(id); await fetchAll(); }
    finally { setBusy(false); }
  };

  /* ════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════ */
  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const hasData = groups.length > 0 && categories.length > 0;

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═══ */}
      <PageHeader title="Centralizator" subtitle={`Competiția #${eventId}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{groups.length} grupe</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">{categories.length} categorii</span>
            <span className="text-gray-300">·</span>
            <span className="font-semibold text-blue-600">{totalAthletes} sportivi</span>
          </div>
          <button
            onClick={() => setShowSetup(!showSetup)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              showSetup ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ⚙ Configurare
          </button>
        </div>
      </PageHeader>

      {/* ═══ SETUP PANEL (collapsible) ═══ */}
      {showSetup && (
        <Card>
          <h3 className="font-semibold text-gray-900 text-sm mb-3">⚙ Configurare grupe și categorii</h3>

          {/* Age group presets */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Grupe de vârstă</p>
              <div className="flex gap-2">
                <button onClick={() => setShowGroupForm(!showGroupForm)}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">+ Grupă nouă</button>
                {AGE_GROUP_PRESETS.some(p => !existingGroupNames.has(p.name)) && (
                  <button onClick={handleAddAllPresets} disabled={busy}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                    Adaugă toate
                  </button>
                )}
              </div>
            </div>

            {showGroupForm && (
              <form onSubmit={handleCustomGroup} className="mb-3 rounded-lg bg-gray-50 p-3 space-y-2 max-w-lg">
                <input required placeholder="Nume grupă" value={customGroup.name}
                  onChange={e => setCustomGroup(g => ({ ...g, name: e.target.value }))}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="An naștere de la" value={customGroup.birth_year_start}
                    onChange={e => setCustomGroup(g => ({ ...g, birth_year_start: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                  <input type="number" placeholder="An naștere până la" value={customGroup.birth_year_end}
                    onChange={e => setCustomGroup(g => ({ ...g, birth_year_end: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Salvează</button>
                  <button type="button" onClick={() => setShowGroupForm(false)}
                    className="text-xs text-gray-500 hover:text-gray-700">Anulează</button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap gap-1.5">
              {AGE_GROUP_PRESETS.map(p => {
                const exists = existingGroupNames.has(p.name);
                return (
                  <button key={p.name} disabled={exists || busy} onClick={() => handleAddGroupPreset(p)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                      exists ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-default'
                             : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}>
                    {exists ? '✓ ' : '+ '}{p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Existing groups — add/remove categories */}
          {groups.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Categorii per grupă</p>
              <div className="space-y-2">
                {groups.map((g, gi) => {
                  const color = GROUP_COLORS[gi % GROUP_COLORS.length];
                  const groupCats = categories.filter(c => c.group === g.id);
                  return (
                    <div key={g.id} className={`rounded-lg border ${color.border} p-2`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 rounded ${color.bg}`}></span>
                          <span className="text-xs font-bold text-gray-800">{g.name}</span>
                          <span className="text-[10px] text-gray-400">
                            {g.birth_year_start && g.birth_year_end ? `(${g.birth_year_start}–${g.birth_year_end})` : ''}
                          </span>
                          <span className="text-[10px] text-gray-500">{groupCats.length} categorii</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleAddStandardCats(g.id)} disabled={busy}
                            className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 hover:bg-green-200 disabled:opacity-40">
                            + Standard
                          </button>
                          <button onClick={() => handleDeleteGroup(g.id)} disabled={busy}
                            className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-100 disabled:opacity-40">
                            Șterge grupa
                          </button>
                        </div>
                      </div>
                      {groupCats.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {groupCats.map(cat => (
                            <span key={cat.id} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                              {cat.name}
                              <button onClick={() => handleDeleteCat(cat.id)} disabled={busy}
                                className="text-red-400 hover:text-red-600 ml-0.5">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ═══ THE CENTRALIZATOR TABLE (Excel-style) ═══ */}
      {!hasData ? (
        <EmptyState icon="📋" title="Nicio categorie configurată"
          message="Deschide ⚙ Configurare pentru a adăuga grupe de vârstă și categorii." />
      ) : (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse text-[11px] min-w-full">

              {/* ═══ ROW 1: Group headers (big colored row) ═══ */}
              <thead>
                <tr>
                  <th className="sticky left-0 z-30 bg-gray-800 text-white border border-gray-600 px-3 py-2 text-left font-bold text-xs min-w-[140px]"
                    rowSpan={3}>
                    CLUB
                  </th>
                  {columnStructure.map((col, ci) => {
                    const color = GROUP_COLORS[ci % GROUP_COLORS.length];
                    return (
                      <th key={col.group.id} colSpan={col.colSpan}
                        className={`${color.bg} ${color.text} border border-gray-400 px-2 py-2 text-center font-bold text-xs whitespace-nowrap`}>
                        {col.group.name}
                        {col.group.birth_year_start && col.group.birth_year_end && (
                          <span className="font-normal opacity-80 text-[10px] ml-1">
                            ({col.group.birth_year_start}–{col.group.birth_year_end})
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>

                {/* ═══ ROW 2: Gender sub-headers ═══ */}
                <tr>
                  {columnStructure.map(col =>
                    col.genderSections.length === 0
                      ? <th key={`g-empty-${col.group.id}`} className="bg-gray-100 border border-gray-300 px-1 py-1"></th>
                      : col.genderSections.map(gs => (
                          <th key={`${col.group.id}-${gs.gender}`} colSpan={gs.colSpan}
                            className={`${GENDER_BG[gs.gender] || 'bg-gray-100'} border border-gray-300 px-1 py-1.5 text-center font-bold text-[10px] uppercase tracking-wide text-gray-700`}>
                            {GENDER_LABELS[gs.gender] || gs.gender}
                          </th>
                        ))
                  )}
                </tr>

                {/* ═══ ROW 3: Individual category names (vertical) ═══ */}
                <tr>
                  {allCols.map(cat => (
                    <th key={cat.id}
                      className="bg-gray-50 border border-gray-300 px-1 py-1 text-center font-medium text-[10px] text-gray-700 min-w-[80px] max-w-[110px]"
                      title={`${cat.name} (${TYPE_LABELS[cat.type] || cat.type})`}
                    >
                      <div className="leading-tight whitespace-normal">
                        {cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ═══ BODY: One row per athlete, grouped by club ═══ */}
              <tbody>
                {clubRows.length === 0 ? (
                  <tr>
                    <td colSpan={allCols.length + 1} className="px-4 py-8 text-center text-sm text-gray-400 italic">
                      Niciun sportiv înscris. Sportivii vor apărea aici când sunt adăugați la categorii.
                    </td>
                  </tr>
                ) : (
                  clubRows.map(({ club, athletes }) => (
                    athletes.map((ath, athIdx) => (
                      <tr key={ath.id} className={`${athIdx === 0 ? 'border-t-2 border-gray-400' : ''} hover:bg-yellow-50/40 transition-colors`}>
                        {/* Club cell — spans all rows for this club */}
                        {athIdx === 0 && (
                          <td className="sticky left-0 z-10 bg-white border border-gray-300 px-3 py-1.5 font-bold text-xs text-gray-900 align-top"
                            rowSpan={athletes.length}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-600">🏛</span>
                              {club}
                            </div>
                          </td>
                        )}
                        {/* Category cells — show athlete name if enrolled */}
                        {allCols.map(cat => {
                          const enrollment = ath.enrollments[cat.id];
                          return (
                            <td key={cat.id}
                              className={`border border-gray-200 px-1 py-1 text-center text-[10px] ${
                                enrollment ? 'bg-green-50 text-gray-800' : 'text-gray-200'
                              }`}
                            >
                              {enrollment ? (
                                <span className="font-medium leading-tight block" title={ath.name}>
                                  {ath.name}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ))
                )}
              </tbody>

              {/* ═══ FOOTER: participant count per category ═══ */}
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-400">
                  <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-3 py-2 font-bold text-xs text-gray-700">
                    Număr participanți
                  </td>
                  {allCols.map(cat => (
                    <td key={cat.id} className="border border-gray-300 px-1 py-2 text-center font-bold text-xs text-gray-700">
                      {countPerCat[cat.id] || 0}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
