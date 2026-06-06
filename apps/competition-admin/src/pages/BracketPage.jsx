import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import { api } from '@shared';
import { formatGroupBadgeLabel } from '@shared/components/ui';

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
  const { id: eventId } = useParams();
  const [matchDetailModal, setMatchDetailModal] = useState(null); // match object or null
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');

  if (!ctx) return null;

  const { columnStructure, fightWeights, isEditLocked } = ctx;

  /* collect unique fight categories across all groups */
  const seenIds = new Set();
  const fightCats = [];
  for (const col of columnStructure) {
    for (const c of col.cats) {
      if (c.type !== 'fight') continue;
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      fightCats.push({ ...c, groupName: formatGroupBadgeLabel(col.group, c) });
    }
  }

  /* group by gender, preserving order */
  const orderedCats = [];
  for (const g of ['male', 'female', 'mixt']) {
    const cats = fightCats.filter(c => (c.gender || 'mixt') === g);
    if (cats.length) orderedCats.push(...cats.map(c => ({ ...c, _gender: g })));
  }

  if (fightCats.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white p-4 text-center text-sm italic text-gray-400">
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

  const groupOptions = Array.from(new Set(orderedCats.map(cat => cat.groupName).filter(Boolean)));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCats = orderedCats.filter(cat => {
    const matchesGroup = groupFilter === 'all' || cat.groupName === groupFilter;
    const label = shortLabel(cat).toLowerCase();
    const group = (cat.groupName || '').toLowerCase();
    const matchesSearch = !normalizedSearch || label.includes(normalizedSearch) || group.includes(normalizedSearch);
    return matchesGroup && matchesSearch;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-white p-3">
      <div className={`flex w-full flex-col gap-4 ${isEditLocked ? 'opacity-95' : ''}`} inert={isEditLocked ? '' : undefined}>
        <div className="border-2 border-black bg-yellow-100 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-sm font-bold uppercase tracking-wide text-gray-900">Caută categorie sau grupă</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ex: Juniori, -60kg, Feminin"
                className="border border-black bg-white px-3 py-2 text-sm text-gray-800 outline-none"
              />
            </div>
            <div className="flex w-full flex-col gap-1 lg:w-72">
              <label className="text-sm font-bold uppercase tracking-wide text-gray-900">Filtru grupă</label>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="border border-black bg-white px-3 py-2 text-sm text-gray-800 outline-none"
              >
                <option value="all">Toate grupele</option>
                {groupOptions.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredCats.length === 0 ? (
          <div className="border-2 border-black bg-white px-4 py-10 text-center text-sm text-gray-500">
            Nu există categorii care să corespundă filtrului curent.
          </div>
        ) : filteredCats.map((cat) => {
          return (
            <CategoryBracket
              key={cat.id}
              category={cat}
              shortLabel={shortLabel(cat)}
              eventId={eventId}
              fightWeights={fightWeights}
              onMatchClick={(match) => setMatchDetailModal(match)}
            />
          );
        })}
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
      <div className="flex max-h-[85vh] w-[90vw] max-w-lg flex-col overflow-hidden border-2 border-black bg-white shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black bg-yellow-300 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">Meci ID {m.id}</h2>
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
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center border-2 border-black bg-white text-lg font-black text-gray-700 transition hover:bg-yellow-100">×</button>
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
function CategoryBracket({ category, shortLabel, eventId, fightWeights, onMatchClick }) {
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

  const catLabel = shortLabel || category.name
    .replace(/ - (Masculin|Feminin|Mixt)/i, '')
    .replace(/Đối Kháng\s*/i, '')
    .trim() || category.name;
  const groupLabel = category.groupName || category.group?.name || '';

  return (
    <section className="shrink-0 overflow-hidden border-2 border-black bg-white shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-yellow-300 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          {groupLabel && (
            <span className="border border-black bg-white px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gray-900">
              {groupLabel}
            </span>
          )}
          <span className="border border-black bg-yellow-300 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-black">Luptă</span>
          {category.gender && (
            <span className={`border border-black px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${genderBg(category.gender)}`}>
              {GENDER_LABELS[category.gender] || category.gender}
            </span>
          )}
          <span className="text-base font-bold text-gray-900 sm:text-lg">{catLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bracket type selector */}
          <select
            value={bracketType}
            onChange={(e) => setBracketType(e.target.value)}
            className="border border-black bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:bg-yellow-50"
            title="Tipul de bracket"
          >
            <option value="single_elimination">Eliminare directă</option>
            <option value="consolation">Cu meci de bronz</option>
          </select>
          {matches.length > 0 && (
            <button
              onClick={handleDeleteBracket}
              className="border border-black bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Șterge
            </button>
          )}
          <button
            onClick={handleGenerateEmpty}
            disabled={athleteCount < 2 || generating}
            className="border border-black bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Generează bracket gol și plasează sportivii manual prin drag & drop"
          >
            {generating ? 'Se generează...' : 'Bracket gol'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={athleteCount < 2 || generating}
            className="border border-black bg-yellow-300 px-3 py-2 text-sm font-semibold text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? 'Generare...' : matches.length > 0 ? 'Regenerează' : 'Generează bracket'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 border border-black bg-white px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── content: athlete list + bracket ── */}
      <div>
        {loading ? (
          <p className="p-4 text-sm text-gray-400 animate-pulse">Încărcare meciuri...</p>
        ) : (
          <div className="flex min-h-[520px] flex-col lg:flex-row">
            {/* ── LEFT: Athlete List Panel ── */}
            <div className="flex shrink-0 flex-col border-b-2 border-black bg-white lg:w-80 lg:border-b-0 lg:border-r-2">
                <div className="border-b-2 border-black bg-white px-4 py-3">
                  <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                    Sportivi ({athleteCount})
                  </p>
                  {unplacedCount > 0 && (
                    <p className="mt-1 text-sm text-gray-700">
                      {unplacedCount} neplasa{unplacedCount !== 1 ? 'ți' : 't'}
                    </p>
                  )}
                  {unplacedCount === 0 && athleteCount > 0 && (
                    <p className="mt-1 text-sm text-gray-700">
                      Toți sportivii sunt plasați
                    </p>
                  )}
                </div>
                <div className="max-h-[560px] overflow-y-auto p-2">
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
                        mb-1 flex select-none items-center gap-2 border px-3 py-2 text-sm transition-all
                        ${ath.isDQ
                          ? 'border-black bg-red-50 text-red-300 line-through cursor-not-allowed opacity-60'
                          : ath.isPlaced
                            ? 'border-black bg-gray-100 text-gray-400 cursor-default'
                            : 'border-black bg-white cursor-grab hover:bg-yellow-100 hover:shadow-sm active:cursor-grabbing'
                        }
                      `}
                    >
                      {/* drag handle */}
                      {!ath.isPlaced && !ath.isDQ && (
                        <span className="shrink-0 text-xs text-gray-400">⠿</span>
                      )}
                      {ath.isPlaced && <span className="shrink-0 text-xs text-gray-700">✓</span>}
                      {ath.isDQ && <span className="shrink-0 text-xs text-red-400">✕</span>}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-bold text-gray-900">
                          {ath.name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
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
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-white p-4 sm:p-5">
                {matches.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center border-2 border-dashed border-black bg-yellow-50/30 px-6 text-center text-base text-gray-500">
                    <div>
                      <p>Nu sunt meciuri generate.</p>
                      <p className="mt-2 text-sm">Apasă <b>Generează bracket</b> pentru tragere automată sau <b>Bracket gol</b> pentru plasare manuală.</p>
                    </div>
                  </div>
                ) : (
                  <BracketTree
                    matches={matches}
                    eventId={eventId}
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
                )}
              </div>
            </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BRACKET TREE  –  horizontal single-elimination bracket layout
   Renders rounds left-to-right with SVG connector lines between them
   ═══════════════════════════════════════════════════════════════════ */
function BracketTree({ matches, eventId, onAdvance, draggedAthlete, dragOverSlot, setDragOverSlot, onDropOnSlot, onRemoveFromSlot, onMatchClick, fightWeights, categoryId }) {
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
  const CARD_W = 290;
  const CARD_H = 214;
  const COL_GAP = 84;   // horizontal gap between rounds (for connectors)
  const BASE_GAP = 24;  // vertical gap in round 1

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
  const canvasW = Math.max(rounds.length * (CARD_W + COL_GAP), CARD_W);
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
    <div className="relative min-w-max" style={{ width: canvasW, height: canvasH }}>
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
            className="absolute border border-black bg-yellow-100 px-2 py-1 text-center text-xs font-bold uppercase tracking-wider text-gray-700"
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
              eventId={eventId}
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
function MatchCard({ match: m, eventId, onAdvance, isDroppable, dragOverSlot, setDragOverSlot, onDropOnSlot, onRemoveFromSlot, onMatchClick, weightMap = {} }) {
  const hasWinner = !!m.winner;
  const redWeight = m.red_corner ? weightMap[m.red_corner] : null;
  const blueWeight = m.blue_corner ? weightMap[m.blue_corner] : null;
  const redWon = m.winner === m.red_corner;
  const blueWon = m.winner === m.blue_corner;
  const isBye = (m.red_corner && !m.blue_corner) || (!m.red_corner && m.blue_corner);
  const assignedFieldId = m.field_id || m.field || null;
  const hasAssignedField = Boolean(assignedFieldId || m.field_number || m.field_name);
  const fullscreenHref = assignedFieldId
    ? `/competitions/${eventId}/live-fullscreen?field=${assignedFieldId}&panel=match&id=${m.id}`
    : null;

  const handleMoreInfoClick = (e) => {
    e.stopPropagation();
    if (!hasAssignedField || !fullscreenHref) {
      const shouldSchedule = window.confirm('Acest meci nu este programat pe niciun tatami. Vrei să mergi la Programare pentru a-l programa?');
      if (shouldSchedule) {
        window.location.href = `/competitions/${eventId}/categories/programare`;
      }
      return;
    }
    window.location.href = fullscreenHref;
  };

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
    <div className={`flex min-h-[214px] cursor-pointer flex-col overflow-hidden border-2 bg-white text-sm shadow-sm transition-shadow hover:shadow-md ${
      hasWinner ? 'border-black' : isBye ? 'border-black' : 'border-black'
    }`} onClick={() => onMatchClick && onMatchClick(m)}>
      {/* header */}
      <div className="flex justify-between border-b-2 border-black bg-yellow-100 px-3 py-1 text-xs font-mono text-gray-600">
        <span title={`ID backend: ${m.id}`}>ID {m.id}</span>
        {hasWinner && <span className="font-bold text-gray-900">Finalizat</span>}
        {isBye && <span className="font-semibold text-gray-700">BYE</span>}
      </div>

      {/* red corner */}
      <div
        className={`group flex min-h-[56px] items-center gap-2 border-b border-gray-200 px-3 py-2.5 transition-colors
          ${redWon ? 'bg-yellow-100 font-bold' : ''}
          ${isRedOver ? 'bg-yellow-100 ring-2 ring-inset ring-black' : ''}
          ${isDroppable && !m.red_corner ? 'bg-gray-50' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, 'red')}
        onDragLeave={() => handleDragLeave('red')}
        onDrop={(e) => handleDrop(e, 'red')}
      >
        <div className="h-3 w-3 shrink-0 bg-red-500" />
        <div className="min-w-0 flex-1">
          {m.red_corner_full_name ? (
            <>
              <span className="block truncate font-bold text-gray-900">{m.red_corner_full_name}</span>
              {m.red_corner_club_name && <span className="block truncate text-xs text-gray-500">{m.red_corner_club_name}</span>}
            </>
          ) : (
            <span className={`text-sm italic ${isDroppable ? 'text-gray-500' : 'text-gray-300'}`}>
              {isDroppable ? '← Trage sportiv aici' : 'TBD'}
            </span>
          )}
        </div>
        {redWeight && <span className="shrink-0 font-mono text-xs text-gray-500">{redWeight}kg</span>}
        {redWon && <span className="text-xs font-bold text-gray-900">CÂȘTIGĂ</span>}
        {onRemoveFromSlot && m.red_corner && !hasWinner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(m.id, 'red'); }}
            className="ml-1 text-xs text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
            title="Scoate din slot"
          >✕</button>
        )}
      </div>

      {/* blue corner */}
      <div
        className={`group flex min-h-[56px] items-center gap-2 px-3 py-2.5 transition-colors
          ${blueWon ? 'bg-yellow-100 font-bold' : ''}
          ${isBlueOver ? 'bg-yellow-100 ring-2 ring-inset ring-black' : ''}
          ${isDroppable && !m.blue_corner ? 'bg-gray-50' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, 'blue')}
        onDragLeave={() => handleDragLeave('blue')}
        onDrop={(e) => handleDrop(e, 'blue')}
      >
        <div className="h-3 w-3 shrink-0 bg-blue-500" />
        <div className="min-w-0 flex-1">
          {m.blue_corner_full_name ? (
            <>
              <span className="block truncate font-bold text-gray-900">{m.blue_corner_full_name}</span>
              {m.blue_corner_club_name && <span className="block truncate text-xs text-gray-500">{m.blue_corner_club_name}</span>}
            </>
          ) : (
            <span className={`text-sm italic ${isDroppable ? 'text-gray-500' : 'text-gray-300'}`}>
              {isDroppable ? '← Trage sportiv aici' : 'TBD'}
            </span>
          )}
        </div>
        {blueWeight && <span className="shrink-0 font-mono text-xs text-gray-500">{blueWeight}kg</span>}
        {blueWon && <span className="text-xs font-bold text-gray-900">CÂȘTIGĂ</span>}
        {onRemoveFromSlot && m.blue_corner && !hasWinner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(m.id, 'blue'); }}
            className="ml-1 text-xs text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-600"
            title="Scoate din slot"
          >✕</button>
        )}
      </div>

      {/* advance button */}
      {hasWinner && m.next_match && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdvance(m.id); }}
          className="border-t-2 border-black bg-yellow-300 py-1.5 text-sm font-semibold text-black hover:bg-yellow-200"
        >
          Avansează câștigător ▸
        </button>
      )}
      <button
        type="button"
        onClick={handleMoreInfoClick}
        className="border-t border-gray-200 bg-white px-3 py-1.5 text-center text-xs font-semibold text-gray-700 hover:bg-gray-100"
      >
        Mai multe informații ↗
      </button>
    </div>
  );
}
