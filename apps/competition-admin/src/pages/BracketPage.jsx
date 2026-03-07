import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import { api } from '@shared';

/* ── round label map ── */
const ROUND_LABELS = {
  'qualifications': 'Calificări',
  'quarter-finals': 'Sferturi',
  'semi-finals': 'Semifinale',
  'finals': 'Finală',
  'bronze': 'Meci Bronz',
};

/* ── colour helpers ── */
const genderBg = g =>
  g === 'male' ? 'bg-blue-100 text-blue-900'
    : g === 'female' ? 'bg-pink-100 text-pink-900'
      : 'bg-amber-100 text-amber-900';

const ADMIN_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://127.0.0.1:8000';

/* ═══════════════════════════════════════════════════════════════════
   BRACKET PAGE  –  tabs instead of accordions
   ═══════════════════════════════════════════════════════════════════ */
export default function BracketPage() {
  const ctx = useContext(CentralizatorContext);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [matchDetailModal, setMatchDetailModal] = useState(null); // match object or null

  if (!ctx) return null;

  const { columnStructure, fightWeights } = ctx;

  /* collect unique fight categories across all groups */
  const seenIds = new Set();
  const fightCats = [];
  for (const col of columnStructure) {
    for (const c of col.cats) {
      if (c.type !== 'fight') continue;
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      fightCats.push({ ...c, groupName: col.group?.name });
    }
  }

  /* group by gender, preserving order */
  const orderedCats = [];
  for (const g of ['male', 'female', 'mixt']) {
    const cats = fightCats.filter(c => (c.gender || 'mixt') === g);
    if (cats.length) orderedCats.push(...cats.map(c => ({ ...c, _gender: g })));
  }

  /* auto-select first tab if none selected or selected not in list */
  const activeCatId = orderedCats.find(c => c.id === selectedCatId) ? selectedCatId : (orderedCats[0]?.id || null);
  const activeCat = orderedCats.find(c => c.id === activeCatId);

  if (fightCats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-400 text-sm italic p-4">
        📋 Nu există categorii de tip Luptă pentru această competiție.
      </div>
    );
  }

  /* short label — strip redundant parts */
  const shortLabel = (cat) => {
    return cat.name
      .replace(/ - (Masculin|Feminin|Mixt)/i, '')
      .replace(/Đối Kháng\s*/i, '')
      .trim() || cat.name;
  };

  /* collect unique groups that contain fight categories */
  const fightGroups = [];
  const seenGroupIds = new Set();
  for (const cat of fightCats) {
    const col = columnStructure.find(c => c.cats.some(cc => cc.id === cat.id));
    if (col?.group && !seenGroupIds.has(col.group.id)) {
      seenGroupIds.add(col.group.id);
      fightGroups.push(col.group);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* ═══ GROUP HEADER ═══ */}
      {fightGroups.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200 overflow-x-auto">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Grupe:</span>
          {fightGroups.map(g => (
            <span key={g.id} className="text-[10px] font-semibold text-gray-700 bg-white border border-gray-300 rounded px-2 py-0.5 shrink-0 shadow-sm">
              {g.name}
            </span>
          ))}
        </div>
      )}

      {/* ═══ TAB BAR ═══ */}
      <div className="shrink-0 flex items-center border-b border-gray-300 bg-white px-1 gap-0.5 overflow-x-auto select-none">
        {orderedCats.map((cat, idx) => {
          const isActive = cat.id === activeCatId;
          const showGenderDivider = idx === 0 || cat._gender !== orderedCats[idx - 1]._gender;
          return (
            <React.Fragment key={cat.id}>
              {showGenderDivider && idx > 0 && (
                <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />
              )}
              {showGenderDivider && (
                <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded shrink-0 ${genderBg(cat._gender)}`}>
                  {GENDER_LABELS[cat._gender]?.charAt(0)}
                </span>
              )}
              <button
                onClick={() => setSelectedCatId(cat.id)}
                className={`inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {cat.groupName && (
                  <span className="text-[9px] text-gray-400 font-normal">{cat.groupName} ›</span>
                )}
                {shortLabel(cat)}
                {(cat.enrolled_athletes?.length || 0) > 0 && (
                  <span className="text-[9px] text-gray-400 bg-gray-100 rounded-full px-1.5">
                    {cat.enrolled_athletes.length}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ═══ ACTIVE CATEGORY CONTENT ═══ */}
      <div className="flex-1 overflow-auto">
        {activeCat && (
          <CategoryBracket
            key={activeCat.id}
            category={activeCat}
            fightWeights={fightWeights}
            onMatchClick={(match) => setMatchDetailModal(match)}
          />
        )}
      </div>

      {/* ═══ MATCH DETAIL MODAL ═══ */}
      {matchDetailModal && (
        <MatchDetailModal
          match={matchDetailModal}
          onClose={() => setMatchDetailModal(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MATCH DETAIL MODAL  –  full info about a match
   ═══════════════════════════════════════════════════════════════════ */
function MatchDetailModal({ match: m, onClose }) {
  const adminUrl = `${ADMIN_BASE}/admin/api/match/${m.id}/change/`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">Meci #{m.match_number}</h2>
              <a
                href={adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono hover:bg-indigo-200 transition"
                title="Deschide în Django Admin"
              >
                ID: {m.id} ↗
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {m.match_type && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                  {ROUND_LABELS[m.match_type] || m.match_type}
                </span>
              )}
              {m.category_name && (
                <span className="text-[10px] text-gray-500">{m.category_name}</span>
              )}
              {m.winner && (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">✓ Finalizat</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg flex items-center justify-center transition">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Corners */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Colțuri</h3>

            {/* Colțul roșu */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${m.winner === m.red_corner ? 'bg-green-50 border-green-300' : 'bg-red-50/30 border-red-200'}`}>
              <div className="w-4 h-4 rounded bg-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">
                  {m.red_corner_full_name || <span className="text-gray-400 italic">TBD</span>}
                  {m.red_corner_club_name && <span className="text-xs text-gray-500 font-normal ml-1">({m.red_corner_club_name})</span>}
                </div>
              </div>
              {m.winner === m.red_corner && <span className="text-green-600 text-sm font-bold">🏆 Câștigător</span>}
            </div>

            {/* Colțul albastru */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${m.winner === m.blue_corner ? 'bg-green-50 border-green-300' : 'bg-blue-50/30 border-blue-200'}`}>
              <div className="w-4 h-4 rounded bg-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">
                  {m.blue_corner_full_name || <span className="text-gray-400 italic">TBD</span>}
                  {m.blue_corner_club_name && <span className="text-xs text-gray-500 font-normal ml-1">({m.blue_corner_club_name})</span>}
                </div>
              </div>
              {m.winner === m.blue_corner && <span className="text-green-600 text-sm font-bold">🏆 Câștigător</span>}
            </div>
          </div>

          {/* Referees */}
          {m.referees && m.referees.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Arbitri</h3>
              <div className="flex flex-wrap gap-2">
                {m.referees.map((ref, i) => (
                  <div key={ref.id || i} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-800 font-medium">
                    {ref.referee_name || ref.name || `Arbitru #${ref.referee || ref.id}`}
                    {ref.role && <span className="text-blue-500 ml-1">({ref.role})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Central referee */}
          {m.central_referee_name && (
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Arbitru central</h3>
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 text-xs text-purple-800 font-medium inline-block">
                ⚖️ {m.central_referee_name}
              </div>
              {(m.central_penalties_red > 0 || m.central_penalties_blue > 0) && (
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-red-600">🔴 Penalități roșu: <b>{m.central_penalties_red || 0}</b></span>
                  <span className="text-blue-600">🔵 Penalități albastru: <b>{m.central_penalties_blue || 0}</b></span>
                </div>
              )}
            </div>
          )}

          {/* Referee scores */}
          {m.referee_scores && m.referee_scores.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Scoruri arbitri</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-2 py-1.5 border-b border-gray-200 font-semibold text-gray-600">Arbitru</th>
                      <th className="text-center px-2 py-1.5 border-b border-gray-200 font-semibold text-red-600">🔴 Roșu</th>
                      <th className="text-center px-2 py-1.5 border-b border-gray-200 font-semibold text-blue-600">🔵 Albastru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.referee_scores.map((rs, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 border-b border-gray-100 font-medium text-gray-800">
                          {rs.referee_name || `Arbitru #${rs.referee}`}
                        </td>
                        <td className="text-center px-2 py-1.5 border-b border-gray-100 font-mono text-red-700 font-semibold">
                          {rs.score_red != null ? rs.score_red : '—'}
                        </td>
                        <td className="text-center px-2 py-1.5 border-b border-gray-100 font-mono text-blue-700 font-semibold">
                          {rs.score_blue != null ? rs.score_blue : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Match info */}
          <div>
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Informații meci</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-gray-400 text-[9px] uppercase">Runda</div>
                <div className="font-semibold text-gray-800">{m.round_number || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-gray-400 text-[9px] uppercase">Poziție în tablou</div>
                <div className="font-semibold text-gray-800">{m.bracket_position != null ? m.bracket_position : '—'}</div>
              </div>
              {m.next_match && (
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-gray-400 text-[9px] uppercase">Meci următor</div>
                  <div className="font-semibold text-gray-800">#{m.next_match}</div>
                </div>
              )}
              {m.field_number && (
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-gray-400 text-[9px] uppercase">Tatami</div>
                  <div className="font-semibold text-gray-800">#{m.field_number}</div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PER-CATEGORY BRACKET COMPONENT
   Shows athlete list + bracket tree side-by-side with drag & drop
   ═══════════════════════════════════════════════════════════════════ */
function CategoryBracket({ category, fightWeights, onMatchClick }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [bracketType, setBracketType] = useState('single_elimination'); // 'single_elimination' | 'consolation'

  /* drag state */
  const [draggedAthlete, setDraggedAthlete] = useState(null); // { id, name, club, weight }
  const [dragOverSlot, setDragOverSlot] = useState(null);      // { matchId, corner: 'red'|'blue' }

  const enrolled = category.enrolled_athletes || [];
  const athleteCount = enrolled.length;

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/matches/', { params: { category_id: category.id } });
      const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setMatches(data);
    } catch (err) {
      console.error('Err loading matches', err);
    } finally {
      setLoading(false);
    }
  }, [category.id]);

  /* load matches immediately */
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleGenerate = async () => {
    if (!window.confirm(
      matches.length > 0
        ? `Bracket-ul existent (${matches.length} meciuri) va fi șters și regenerat. Continui?`
        : `Generez bracket pentru ${athleteCount} sportivi?`
    )) return;

    try {
      setGenerating(true);
      setError(null);
      const res = await api.post(`/categories/${category.id}/generate-brackets/`, { bracket_type: bracketType });
      const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setMatches(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la generare.');
    } finally {
      setGenerating(false);
    }
  };

  /* ── Generate empty bracket (no athletes assigned) ── */
  const handleGenerateEmpty = async () => {
    if (!window.confirm(
      matches.length > 0
        ? `Bracket-ul existent va fi șters. Se va genera un bracket gol cu ${athleteCount} sloturi. Continui?`
        : `Generez bracket gol cu ${athleteCount} sloturi? Poți trage sportivii manual.`
    )) return;

    try {
      setGenerating(true);
      setError(null);
      // Generate bracket server-side then clear all assignments
      const res = await api.post(`/categories/${category.id}/generate-brackets/`, { bracket_type: bracketType });
      const data = Array.isArray(res.data) ? res.data : (res.data.results || []);

      // Clear all corner assignments from first-round matches (to allow manual drag & drop)
      const firstRound = Math.min(...data.map(m => m.round_number));
      const updates = data.filter(m => m.round_number === firstRound).map(m =>
        api.patch(`/matches/${m.id}/`, { red_corner: null, blue_corner: null })
      );
      await Promise.all(updates);
      await fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la generare.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAdvance = async (matchId) => {
    try {
      await api.post(`/matches/${matchId}/advance-winner/`);
      await fetchMatches();
    } catch (err) {
      alert(err.response?.data?.error || 'Nu s-a putut avansa câștigătorul.');
    }
  };

  const handleDeleteBracket = async () => {
    if (!window.confirm('Ștergi toate meciurile pentru această categorie?')) return;
    try {
      await Promise.all(matches.map(m => api.delete(`/matches/${m.id}/`)));
      setMatches([]);
    } catch (err) {
      console.error(err);
    }
  };

  /* ── Drag & drop: assign athlete to match corner ── */
  const handleDropOnSlot = async (matchId, corner) => {
    if (!draggedAthlete) return;
    setDragOverSlot(null);
    const athlete = draggedAthlete;
    setDraggedAthlete(null);

    try {
      const field = corner === 'red' ? 'red_corner' : 'blue_corner';
      await api.patch(`/matches/${matchId}/`, { [field]: athlete.id });
      await fetchMatches();
    } catch (err) {
      console.error('Drop failed:', err);
      alert('Nu s-a putut plasa sportivul.');
    }
  };

  /* ── Remove athlete from a corner ── */
  const handleRemoveFromSlot = async (matchId, corner) => {
    try {
      const field = corner === 'red' ? 'red_corner' : 'blue_corner';
      await api.patch(`/matches/${matchId}/`, { [field]: null });
      await fetchMatches();
    } catch (err) {
      console.error('Remove failed:', err);
    }
  };

  /* ── Compute which athletes are already placed in the bracket ── */
  const placedAthleteIds = new Set();
  for (const m of matches) {
    if (m.red_corner) placedAthleteIds.add(m.red_corner);
    if (m.blue_corner) placedAthleteIds.add(m.blue_corner);
  }

  /* ── Build athlete info list from enrollments ── */
  const fwArr = fightWeights || [];
  const athleteList = enrolled.map(ea => {
    const a = ea.athlete_details;
    const athleteId = a?.id || ea.athlete;
    const fw = fwArr.find(f => f.category === category.id && f.athlete === athleteId);
    return {
      id: athleteId,
      name: a ? `${a.last_name || ''} ${a.first_name || ''}`.trim() : `Sportiv #${athleteId}`,
      club: a?.club?.name || '',
      weight: fw?.current_weight_kg || fw?.pre_weight_kg || ea.weight || '',
      isPlaced: placedAthleteIds.has(athleteId),
      isDQ: fw?.is_disqualified || false,
    };
  }).sort((a, b) => {
    // DQ last, then placed, then alphabetically
    if (a.isDQ !== b.isDQ) return a.isDQ ? 1 : -1;
    if (a.isPlaced !== b.isPlaced) return a.isPlaced ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const unplacedCount = athleteList.filter(a => !a.isPlaced && !a.isDQ).length;

  const catLabel = category.name
    .replace(/ - (Masculin|Feminin|Mixt)/i, '')
    .replace(/Đối Kháng\s*/i, '')
    .trim() || category.name;

  return (
    <div className="flex flex-col h-full">
      {/* ── action bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-gray-800">{catLabel}</span>
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {athleteCount} sportivi
          </span>
          {matches.length > 0 && (
            <span className="text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              🏆 {matches.length} meciuri
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bracket type selector */}
          <select
            value={bracketType}
            onChange={(e) => setBracketType(e.target.value)}
            className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            title="Tipul de bracket"
          >
            <option value="single_elimination">Eliminare directă</option>
            <option value="consolation">Cu meci de bronz</option>
          </select>
          {matches.length > 0 && (
            <button
              onClick={handleDeleteBracket}
              className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              🗑️ Șterge
            </button>
          )}
          <button
            onClick={handleGenerateEmpty}
            disabled={athleteCount < 2 || generating}
            className="text-[11px] px-3 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            title="Generează bracket gol și plasează sportivii manual prin drag & drop"
          >
            {generating ? '⏳...' : '🖐️ Bracket Gol (DnD)'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={athleteCount < 2 || generating}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
          >
            {generating ? '⏳ Generare...' : matches.length > 0 ? '🔄 Regenerează' : '⚡ Generează Bracket'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
          {error}
        </div>
      )}

      {/* ── content: athlete list + bracket ── */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-xs animate-pulse p-4">Încărcare meciuri...</p>
        ) : matches.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-12">
            <p>Nu sunt meciuri generate.</p>
            <p className="text-xs mt-1">Apasă <b>Generează Bracket</b> pentru tragere automată sau <b>Bracket Gol</b> pentru plasare manuală.</p>
          </div>
        ) : (
          <div className="flex h-full">
            {/* ── LEFT: Athlete List Panel ── */}
            <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-100">
                  <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">
                    👥 Sportivi ({athleteCount})
                  </p>
                  {unplacedCount > 0 && (
                    <p className="text-[9px] text-amber-600 mt-0.5">
                      ⚠️ {unplacedCount} neplasa{unplacedCount !== 1 ? 'ți' : 't'}
                    </p>
                  )}
                  {unplacedCount === 0 && athleteCount > 0 && (
                    <p className="text-[9px] text-green-600 mt-0.5">
                      ✅ Toți sportivii sunt plasați
                    </p>
                  )}
                </div>
                <div className="max-h-[500px] overflow-y-auto p-1">
                  {athleteList.map(ath => (
                    <div
                      key={ath.id}
                      draggable={!ath.isPlaced && !ath.isDQ}
                      onDragStart={(e) => {
                        if (ath.isPlaced || ath.isDQ) return;
                        setDraggedAthlete(ath);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', ath.id.toString());
                      }}
                      onDragEnd={() => { setDraggedAthlete(null); setDragOverSlot(null); }}
                      className={`
                        flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 text-[11px] select-none transition-all
                        ${ath.isDQ
                          ? 'bg-red-50 text-red-300 line-through cursor-not-allowed opacity-60'
                          : ath.isPlaced
                            ? 'bg-green-50 text-gray-400 cursor-default'
                            : 'bg-white border border-gray-200 cursor-grab hover:shadow-sm hover:border-blue-300 active:cursor-grabbing'
                        }
                      `}
                    >
                      {/* drag handle */}
                      {!ath.isPlaced && !ath.isDQ && (
                        <span className="text-gray-300 text-[10px] shrink-0">⠿</span>
                      )}
                      {ath.isPlaced && <span className="text-green-500 text-[10px] shrink-0">✓</span>}
                      {ath.isDQ && <span className="text-red-400 text-[10px] shrink-0">✕</span>}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">
                          {ath.name}
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-gray-400">
                          {ath.club && <span className="truncate">{ath.club}</span>}
                          {ath.weight && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{ath.weight} kg</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── RIGHT: Bracket Tree ── */}
              <div className="flex-1 overflow-auto p-4">
                <BracketTree
                  matches={matches}
                  onAdvance={handleAdvance}
                  draggedAthlete={draggedAthlete}
                  dragOverSlot={dragOverSlot}
                  setDragOverSlot={setDragOverSlot}
                  onDropOnSlot={handleDropOnSlot}
                  onRemoveFromSlot={handleRemoveFromSlot}
                  onMatchClick={onMatchClick}
                  fightWeights={fightWeights}
                  categoryId={category.id}
                />
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BRACKET TREE  –  horizontal single-elimination bracket layout
   Renders rounds left-to-right with SVG connector lines between them
   ═══════════════════════════════════════════════════════════════════ */
function BracketTree({ matches, onAdvance, draggedAthlete, dragOverSlot, setDragOverSlot, onDropOnSlot, onRemoveFromSlot, onMatchClick, fightWeights, categoryId }) {
  /* Build weight lookup: athleteId → weight (current_weight_kg preferred) */
  const weightMap = {};
  if (fightWeights && categoryId) {
    for (const fw of fightWeights) {
      if (fw.category === categoryId) {
        weightMap[fw.athlete] = fw.current_weight_kg || fw.pre_weight_kg || null;
      }
    }
  }

  /* Group by round */
  const byRound = {};
  for (const m of matches) {
    const rnd = m.round_number || 1;
    if (!byRound[rnd]) byRound[rnd] = [];
    byRound[rnd].push(m);
  }
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  /* layout constants */
  const CARD_W = 230;
  const CARD_H = 80;
  const COL_GAP = 60;   // horizontal gap between rounds (for connectors)
  const BASE_GAP = 10;  // vertical gap in round 1

  /* compute vertical positions for each round */
  const positions = {};  // matchId -> { x, y }
  rounds.forEach((rnd, ri) => {
    const roundMatches = byRound[rnd].sort((a, b) => a.bracket_position - b.bracket_position);
    const gap = BASE_GAP * Math.pow(2, ri);
    const totalH = roundMatches.length * CARD_H + (roundMatches.length - 1) * gap;
    const round1Matches = byRound[rounds[0]]?.length || 1;
    const round1H = round1Matches * CARD_H + (round1Matches - 1) * BASE_GAP;
    const offsetY = (round1H - totalH) / 2;

    roundMatches.forEach((m, mi) => {
      positions[m.id] = {
        x: ri * (CARD_W + COL_GAP),
        y: offsetY + mi * (CARD_H + gap),
      };
    });
  });

  /* total canvas size */
  const allPos = Object.values(positions);
  const canvasW = rounds.length * (CARD_W + COL_GAP);
  const minY = Math.min(...allPos.map(p => p.y), 0);
  const maxY = Math.max(...allPos.map(p => p.y + CARD_H), 0);
  const canvasH = maxY - minY + 40;
  const yShift = minY < 0 ? -minY + 25 : 25;

  /* connector lines */
  const lines = [];
  for (const m of matches) {
    // Winner connector (solid)
    if (m.next_match) {
      const from = positions[m.id];
      const to = positions[m.next_match];
      if (from && to) {
        const x1 = from.x + CARD_W;
        const y1 = from.y + yShift + CARD_H / 2;
        const midX = from.x + CARD_W + COL_GAP / 2;
        const x2 = to.x;
        const y2 = to.y + yShift + CARD_H / 2;

        lines.push(
          <path
            key={`line-${m.id}`}
            d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="2"
          />
        );
      }
    }
    // Loser connector (dashed, for consolation/bronze)
    if (m.loser_next_match) {
      const from = positions[m.id];
      const to = positions[m.loser_next_match];
      if (from && to) {
        const x1 = from.x + CARD_W;
        const y1 = from.y + yShift + CARD_H / 2;
        const midX = from.x + CARD_W + COL_GAP / 2;
        const x2 = to.x;
        const y2 = to.y + yShift + CARD_H / 2;

        lines.push(
          <path
            key={`loser-line-${m.id}`}
            d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        );
      }
    }
  }

  return (
    <div className="relative" style={{ width: canvasW, height: canvasH }}>
      {/* SVG connectors */}
      <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH}>
        {lines}
      </svg>

      {/* round headers */}
      {rounds.map((rnd, ri) => {
        const label = ROUND_LABELS[byRound[rnd][0]?.match_type] || `Runda ${rnd}`;
        return (
          <div
            key={`hdr-${rnd}`}
            className="absolute text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center"
            style={{ left: ri * (CARD_W + COL_GAP), top: 0, width: CARD_W }}
          >
            {label}
          </div>
        );
      })}

      {/* Match cards */}
      {matches.map(m => {
        const pos = positions[m.id];
        if (!pos) return null;
        return (
          <div
            key={m.id}
            className="absolute"
            style={{ left: pos.x, top: pos.y + yShift, width: CARD_W }}
          >
            <MatchCard
              match={m}
              onAdvance={onAdvance}
              isDroppable={!!draggedAthlete}
              dragOverSlot={dragOverSlot}
              setDragOverSlot={setDragOverSlot}
              onDropOnSlot={onDropOnSlot}
              onRemoveFromSlot={onRemoveFromSlot}
              onMatchClick={onMatchClick}
              weightMap={weightMap}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MATCH CARD  –  with drop zones for red & blue corners
   ═══════════════════════════════════════════════════════════════════ */
function MatchCard({ match: m, onAdvance, isDroppable, dragOverSlot, setDragOverSlot, onDropOnSlot, onRemoveFromSlot, onMatchClick, weightMap = {} }) {
  const hasWinner = !!m.winner;
  const redWeight = m.red_corner ? weightMap[m.red_corner] : null;
  const blueWeight = m.blue_corner ? weightMap[m.blue_corner] : null;
  const redWon = m.winner === m.red_corner;
  const blueWon = m.winner === m.blue_corner;
  const isBye = (m.red_corner && !m.blue_corner) || (!m.red_corner && m.blue_corner);

  const isRedOver = dragOverSlot?.matchId === m.id && dragOverSlot?.corner === 'red';
  const isBlueOver = dragOverSlot?.matchId === m.id && dragOverSlot?.corner === 'blue';

  const handleDragOver = (e, corner) => {
    if (!isDroppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot({ matchId: m.id, corner });
  };

  const handleDragLeave = (corner) => {
    if (dragOverSlot?.matchId === m.id && dragOverSlot?.corner === corner) {
      setDragOverSlot(null);
    }
  };

  const handleDrop = (e, corner) => {
    e.preventDefault();
    onDropOnSlot(m.id, corner);
  };

  return (
    <div className={`border rounded shadow-sm text-[11px] flex flex-col overflow-hidden bg-white cursor-pointer hover:shadow-md transition-shadow ${
      hasWinner ? 'border-green-400' : isBye ? 'border-amber-300' : 'border-gray-300'
    }`} onClick={() => onMatchClick && onMatchClick(m)}>
      {/* header */}
      <div className="bg-gray-100 px-2 py-0.5 text-[9px] text-gray-500 font-mono flex justify-between border-b border-gray-200">
        <span title={`ID: ${m.id}`}>#{m.match_number}</span>
        {hasWinner && <span className="text-green-600 font-bold">✓ Finalizat</span>}
        {isBye && <span className="text-amber-600 font-semibold">BYE</span>}
      </div>

      {/* red corner */}
      <div
        className={`px-2 py-1.5 flex items-center gap-1.5 border-b border-gray-100 transition-colors group
          ${redWon ? 'bg-green-50 font-bold' : ''}
          ${isRedOver ? 'bg-red-100 ring-2 ring-inset ring-red-400' : ''}
          ${isDroppable && !m.red_corner ? 'bg-red-50/40' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, 'red')}
        onDragLeave={() => handleDragLeave('red')}
        onDrop={(e) => handleDrop(e, 'red')}
      >
        <div className="w-2.5 h-2.5 rounded-sm bg-red-500 shrink-0" />
        <div className="truncate flex-1">
          {m.red_corner_full_name ? (
            <>
              <span>{m.red_corner_full_name}</span>
              {m.red_corner_club_name && <span className="text-[9px] text-gray-400 ml-1">({m.red_corner_club_name})</span>}
            </>
          ) : (
            <span className={`italic text-[10px] ${isDroppable ? 'text-red-300' : 'text-gray-300'}`}>
              {isDroppable ? '← Trage sportiv aici' : 'TBD'}
            </span>
          )}
        </div>
        {redWeight && <span className="text-[9px] text-gray-400 font-mono shrink-0">{redWeight}kg</span>}
        {redWon && <span className="text-green-600 text-[10px]">🏆</span>}
        {onRemoveFromSlot && m.red_corner && !hasWinner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(m.id, 'red'); }}
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-[9px] ml-1 transition-opacity"
            title="Scoate din slot"
          >✕</button>
        )}
      </div>

      {/* blue corner */}
      <div
        className={`px-2 py-1.5 flex items-center gap-1.5 transition-colors group
          ${blueWon ? 'bg-green-50 font-bold' : ''}
          ${isBlueOver ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''}
          ${isDroppable && !m.blue_corner ? 'bg-blue-50/40' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, 'blue')}
        onDragLeave={() => handleDragLeave('blue')}
        onDrop={(e) => handleDrop(e, 'blue')}
      >
        <div className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
        <div className="truncate flex-1">
          {m.blue_corner_full_name ? (
            <>
              <span>{m.blue_corner_full_name}</span>
              {m.blue_corner_club_name && <span className="text-[9px] text-gray-400 ml-1">({m.blue_corner_club_name})</span>}
            </>
          ) : (
            <span className={`italic text-[10px] ${isDroppable ? 'text-blue-300' : 'text-gray-300'}`}>
              {isDroppable ? '← Trage sportiv aici' : 'TBD'}
            </span>
          )}
        </div>
        {blueWeight && <span className="text-[9px] text-gray-400 font-mono shrink-0">{blueWeight}kg</span>}
        {blueWon && <span className="text-green-600 text-[10px]">🏆</span>}
        {onRemoveFromSlot && m.blue_corner && !hasWinner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(m.id, 'blue'); }}
            className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 text-[9px] ml-1 transition-opacity"
            title="Scoate din slot"
          >✕</button>
        )}
      </div>

      {/* advance button */}
      {hasWinner && m.next_match && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdvance(m.id); }}
          className="bg-blue-50 text-blue-700 text-[10px] py-0.5 hover:bg-blue-100 border-t border-blue-200 font-semibold"
        >
          Avansează câștigător ▸
        </button>
      )}
    </div>
  );
}
