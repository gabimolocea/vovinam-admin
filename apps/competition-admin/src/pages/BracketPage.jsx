import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CentralizatorContext, GENDER_BG, GENDER_LABELS } from './CategoriesLayout';
import { api, MEDIA_BASE_URL, fieldAPI, matchFieldAssignmentAPI } from '@shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, formatGroupBadgeLabel } from '../components/ui';
import ExcelJS from 'exceljs';

/* ── round label map ── */
const ROUND_LABELS = {
  'qualifications': 'Calificări',
  'quarter-finals': 'Sferturi',
  'semi-finals': 'Semifinale',
  'finals': 'Finală',
  'bronze': 'Finala mică',
};

const ADMIN_BASE = MEDIA_BASE_URL;

/* Shared bracket-tree layout math, used by both the on-screen BracketTree
   and the standalone print/PDF export - so the two never drift apart.
   Round 1 is evenly spaced; every later round is positioned from whoever
   actually feeds into each match - via next_match for a normal winner
   slot, or loser_next_match for the bronze match's two semi-final losers.
   Deriving from real match relationships (rather than "the previous
   round's paired slot" by bracket_position) is what lets the bronze match
   live in its own round/column - possibly before the final's - without
   the final losing track of the two semis it actually descends from. */
function computeBracketLayout(matches, { CARD_W, CARD_H, COL_GAP, BASE_GAP }) {
  const byRound = {};
  for (const m of matches) {
    const rnd = m.round_number || 1;
    if (!byRound[rnd]) byRound[rnd] = [];
    byRound[rnd].push(m);
  }
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  const positions = {}; // matchId -> { x, y }
  rounds.forEach((rnd, ri) => {
    const roundMatches = byRound[rnd].sort((a, b) => a.bracket_position - b.bracket_position);

    if (ri === 0) {
      roundMatches.forEach((m, mi) => {
        positions[m.id] = { x: 0, y: mi * (CARD_H + BASE_GAP) };
      });
      return;
    }

    roundMatches.forEach((m) => {
      const children = matches.filter((cm) => cm.next_match === m.id || cm.loser_next_match === m.id);
      const ys = children.map((c) => positions[c.id]?.y).filter((y) => y != null);
      const y = ys.length > 0 ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
      positions[m.id] = { x: ri * (CARD_W + COL_GAP), y };
    });

    // The bronze match lands on the exact same row as the final (both are
    // fed by the very same two semis) - drop it into its own lane below
    // the main tree so the semis-to-final winner line never has to cross
    // through it, whichever column bronze is drawn in.
    const bronze = roundMatches.find((m) => m.match_type === 'bronze');
    if (bronze) {
      positions[bronze.id].y += CARD_H + BASE_GAP;
    }
  });

  const allPos = Object.values(positions);
  const canvasW = Math.max(rounds.length * (CARD_W + COL_GAP), CARD_W);
  const minY = Math.min(...allPos.map(p => p.y), 0);
  const maxY = Math.max(...allPos.map(p => p.y + CARD_H), 0);
  const canvasH = maxY - minY + 40;
  const yShift = minY < 0 ? -minY + 25 : 25;

  return { byRound, rounds, positions, canvasW, canvasH, yShift };
}

/* ═══════════════════════════════════════════════════════════════════
   BRACKET PAGE  –  tabs instead of accordions
   ═══════════════════════════════════════════════════════════════════ */
export default function BracketPage() {
  const ctx = useContext(CentralizatorContext);
  const { id: eventId } = useParams();
  const [matchDetailModal, setMatchDetailModal] = useState(null); // match object or null
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  // categoryId -> that CategoryBracket's own fetchMatches, so the drawer can
  // refresh just the affected category's cards after a quick-schedule action.
  const categoryRefetchersRef = useRef({});
  const registerCategoryRefetch = useCallback((categoryId, fn) => {
    categoryRefetchersRef.current[categoryId] = fn;
  }, []);

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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-4 text-center text-sm italic text-muted-foreground">
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
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background p-3">
      <div className={`flex w-full flex-col gap-4 ${isEditLocked ? 'opacity-95' : ''}`} inert={isEditLocked ? '' : undefined}>
        <div className="border border-border bg-muted px-3 py-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-sm font-bold uppercase tracking-wide text-foreground">Caută categorie sau grupă</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ex: Juniori, -60kg, Feminin"
                className="rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none"
              />
            </div>
            <div className="flex w-full flex-col gap-1 lg:w-64">
              <label className="text-sm font-bold uppercase tracking-wide text-foreground">Filtru grupă</label>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none"
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
          <div className="border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
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
              registerRefetch={registerCategoryRefetch}
            />
          );
        })}
      </div>

      {/* ═══ MATCH DETAIL MODAL ═══ */}
      {matchDetailModal && (
        <MatchDetailModal
          match={matchDetailModal}
          onClose={() => setMatchDetailModal(null)}
          eventId={eventId}
          onScheduled={(updatedMatch) => {
            setMatchDetailModal(updatedMatch);
            categoryRefetchersRef.current[updatedMatch.category]?.();
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MATCH DETAIL MODAL  –  full info about a match
   ═══════════════════════════════════════════════════════════════════ */
function MatchDetailModal({ match: m, onClose, eventId, onScheduled }) {
  const adminUrl = `${ADMIN_BASE}/admin/api/match/${m.id}/change/`;
  // hasWinner-gated so a still-open BYE/TBD slot (both m.winner and the
  // empty corner are null/undefined) doesn't false-positive as "won".
  const redWon = !!m.winner && m.winner === m.red_corner;
  const blueWon = !!m.winner && m.winner === m.blue_corner;
  const redLost = !!m.winner && !redWon && !!m.red_corner;
  const blueLost = !!m.winner && !blueWon && !!m.blue_corner;
  // Aggregate final score: sum of every referee's tally for each corner
  // (each referee's total already has central penalties folded in - see
  // MatchSerializer.get_referee_scores on the backend).
  const hasScores = m.referee_scores && m.referee_scores.length > 0;
  const finalRedScore = hasScores ? m.referee_scores.reduce((sum, rs) => sum + (rs.total_red || 0), 0) : null;
  const finalBlueScore = hasScores ? m.referee_scores.reduce((sum, rs) => sum + (rs.total_blue || 0), 0) : null;

  // Quick tatami scheduling, right from the drawer - full drag-and-drop
  // ordering within a tatami's queue still only lives on Programare.
  const [fields, setFields] = useState([]);
  const [fieldAssignments, setFieldAssignments] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fieldsRes, assignRes] = await Promise.all([
          fieldAPI.list({ event_id: eventId }),
          matchFieldAssignmentAPI.list({ event_id: eventId }),
        ]);
        if (cancelled) return;
        setFields((fieldsRes.data?.results || fieldsRes.data || []).slice().sort((a, b) => a.field_number - b.field_number));
        setFieldAssignments(assignRes.data?.results || assignRes.data || []);
      } catch {
        /* quick-scheduling just won't be available this time */
      } finally {
        if (!cancelled) setFieldsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const handleScheduleChange = async (e) => {
    const value = e.target.value;
    const existing = fieldAssignments.find((a) => a.match === m.id);
    setAssigning(true);
    setScheduleError(null);
    try {
      if (!value) {
        if (existing) {
          await matchFieldAssignmentAPI.delete(existing.id);
          setFieldAssignments((prev) => prev.filter((a) => a.id !== existing.id));
        }
        onScheduled?.({ ...m, field_id: null, field_number: null, field_status: null });
        return;
      }
      const fieldId = Number(value);
      const field = fields.find((f) => f.id === fieldId);
      if (existing) {
        await matchFieldAssignmentAPI.update(existing.id, { field: fieldId });
        setFieldAssignments((prev) => prev.map((a) => (a.id === existing.id ? { ...a, field: fieldId } : a)));
      } else {
        const maxOrder = fieldAssignments.filter((a) => a.field === fieldId).reduce((max, a) => Math.max(max, a.order), -1) + 1;
        const res = await matchFieldAssignmentAPI.create({ match: m.id, field: fieldId, order: maxOrder });
        setFieldAssignments((prev) => [...prev, res.data]);
      }
      onScheduled?.({ ...m, field_id: fieldId, field_number: field?.field_number ?? null, field_status: null });
    } catch (err) {
      setScheduleError(err.response?.data?.error || 'Nu s-a putut programa meciul.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent fullScreen className="gap-0 p-0">

        {/* Header */}
        <DialogHeader className="border-b-2 border-border bg-muted px-5 py-3 text-left">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm font-bold">Meci #{m.id}</DialogTitle>
            <a
              href={adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Deschide în Django Admin"
            >
              ↗
            </a>
            {m.winner && <span className="text-sm font-semibold text-green-700">· Finalizat</span>}
          </div>
          {(m.match_type || m.category_name) && (
            <div className="text-sm text-muted-foreground">
              {[ROUND_LABELS[m.match_type] || m.match_type, m.category_name].filter(Boolean).join(' · ')}
            </div>
          )}
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Corners - same visual language as the bracket card (MatchCard) */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Sportivi</h3>

            <div className="border-2 border-border overflow-hidden">
              {/* Colțul roșu */}
              <div className={`relative flex min-h-[38px] items-center gap-1 border-b border-border px-2 py-1 ${redWon ? 'bg-green-100 font-bold' : ''}`}>
                {redLost && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    <line x1="0" y1="0" x2="100%" y2="100%" stroke="#ef4444" strokeWidth="1.5" />
                  </svg>
                )}
                <div className="h-2.5 w-2.5 shrink-0 bg-red-500" />
                <div className="min-w-0 flex-1">
                  {m.red_corner_full_name ? (
                    <>
                      <span className="block truncate font-bold text-foreground">{m.red_corner_full_name}</span>
                      {m.red_corner_club_name && <span className="block truncate text-xs text-muted-foreground">{m.red_corner_club_name}</span>}
                    </>
                  ) : (
                    <span className="text-xs italic text-muted-foreground/50">TBD</span>
                  )}
                </div>
                {finalRedScore != null && <span className="shrink-0 font-mono text-sm text-foreground">{finalRedScore}</span>}
              </div>

              {/* Colțul albastru */}
              <div className={`relative flex min-h-[38px] items-center gap-1 px-2 py-1 ${blueWon ? 'bg-green-100 font-bold' : ''}`}>
                {blueLost && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    <line x1="0" y1="0" x2="100%" y2="100%" stroke="#ef4444" strokeWidth="1.5" />
                  </svg>
                )}
                <div className="h-2.5 w-2.5 shrink-0 bg-blue-500" />
                <div className="min-w-0 flex-1">
                  {m.blue_corner_full_name ? (
                    <>
                      <span className="block truncate font-bold text-foreground">{m.blue_corner_full_name}</span>
                      {m.blue_corner_club_name && <span className="block truncate text-xs text-muted-foreground">{m.blue_corner_club_name}</span>}
                    </>
                  ) : (
                    <span className="text-xs italic text-muted-foreground/50">TBD</span>
                  )}
                </div>
                {finalBlueScore != null && <span className="shrink-0 font-mono text-sm text-foreground">{finalBlueScore}</span>}
              </div>
            </div>
          </div>

          {/* Referees - names only (central marked separately), no
              per-round breakdown - see finalRedScore/finalBlueScore above
              for the score summary instead. Chip style matches the live
              scoring referee slots (LiveFullscreenPage.jsx). */}
          {(m.referees?.length > 0 || m.central_referee_name) && (
            <div>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Arbitri</span>
              <div className="flex flex-wrap gap-1.5">
                {m.central_referee_name && (
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground/80">
                    <span className="font-black text-foreground">C</span>
                    <span className="truncate">{m.central_referee_name}</span>
                  </div>
                )}
                {m.referees?.map((ref, i) => (
                  // m.referees is a StringRelatedField (many=True) on the backend - already plain
                  // display strings (e.g. "Florin Macovei, Club Sportiv X"), not objects.
                  <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground/80">
                    <span className="font-black text-foreground">A{i + 1}</span>
                    <span className="truncate">{ref}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match info + quick tatami scheduling */}
          <div className="flex gap-2 text-sm">
            {m.next_match && (
              <div className="flex-1 bg-muted rounded-lg p-2">
                <div className="text-muted-foreground text-xs uppercase">Meci următor</div>
                <div className="font-semibold text-foreground">#{m.next_match}</div>
              </div>
            )}
            <div className="flex-1 bg-muted rounded-lg p-2">
              <div className="text-muted-foreground text-xs uppercase">Tatami</div>
              {fieldsLoading ? (
                <div className="text-sm text-muted-foreground">Se încarcă…</div>
              ) : (
                <select
                  value={m.field_id || ''}
                  onChange={handleScheduleChange}
                  disabled={assigning}
                  className="mt-0.5 w-full rounded border border-input bg-background px-1.5 py-1 text-sm font-semibold text-foreground outline-none disabled:opacity-50"
                >
                  <option value="">— neprogramat —</option>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>Tatami {f.field_number}</option>
                  ))}
                </select>
              )}
              {scheduleError && <div className="mt-1 text-xs text-red-600">{scheduleError}</div>}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PER-CATEGORY BRACKET COMPONENT
   Shows athlete list + bracket tree side-by-side with drag & drop
   ═══════════════════════════════════════════════════════════════════ */
function CategoryBracket({ category, shortLabel, eventId, fightWeights, onMatchClick, registerRefetch }) {
  const ctx = useContext(CentralizatorContext);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [bracketType, setBracketType] = useState('single_elimination');
  const [exportingExcel, setExportingExcel] = useState(false);
  const bracketRef = useRef(null);

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

  /* let BracketPage trigger a refetch for this specific category after a
     change made outside this component's own handlers (e.g. MatchDetailModal
     quick-scheduling a match to a tatami). */
  useEffect(() => {
    registerRefetch?.(category.id, fetchMatches);
  }, [registerRefetch, category.id, fetchMatches]);

  const handleGenerate = () => {
    ctx?.setConfirmModal({
      title: 'Generează bracket',
      message: matches.length > 0
        ? `Bracket-ul existent (${matches.length} meciuri) va fi șters și regenerat. Continui?`
        : `Generez bracket pentru ${athleteCount} sportivi?`,
      icon: '🏆',
      color: 'orange',
      confirmLabel: 'Generează',
      onConfirm: async () => {
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
          ctx?.setConfirmModal(null);
        }
      },
    });
  };

  /* ── Generate empty bracket (no athletes assigned) ── */
  const handleGenerateEmpty = () => {
    ctx?.setConfirmModal({
      title: 'Generează bracket gol',
      message: matches.length > 0
        ? `Bracket-ul existent va fi șters. Se va genera un bracket gol cu ${athleteCount} sloturi. Continui?`
        : `Generez bracket gol cu ${athleteCount} sloturi? Poți trage sportivii manual.`,
      icon: '🏆',
      color: 'orange',
      confirmLabel: 'Generează',
      onConfirm: async () => {
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
          ctx?.setConfirmModal(null);
        }
      },
    });
  };

  const handleAdvance = async (matchId) => {
    try {
      await api.post(`/matches/${matchId}/advance-winner/`);
      await fetchMatches();
    } catch (err) {
      alert(err.response?.data?.error || 'Nu s-a putut avansa câștigătorul.');
    }
  };

  /* ── Add a 3rd-place/bronze match to an existing bracket that was
     generated without one - without wiping and regenerating everything. ── */
  const [addingBronze, setAddingBronze] = useState(false);
  const handleAddBronzeMatch = () => {
    ctx?.setConfirmModal({
      title: 'Adaugă meci de bronz',
      message: 'Se creează un meci pentru locul 3 între pierzătorii semifinalelor (deja jucate). Continui?',
      icon: '🥉',
      color: 'orange',
      confirmLabel: 'Adaugă',
      onConfirm: async () => {
        try {
          setAddingBronze(true);
          setError(null);
          await api.post(`/categories/${category.id}/add-bronze-match/`);
          await fetchMatches();
        } catch (err) {
          setError(err.response?.data?.error || 'Nu s-a putut adăuga meciul de bronz.');
        } finally {
          setAddingBronze(false);
          ctx?.setConfirmModal(null);
        }
      },
    });
  };

  const handleDeleteBracket = () => {
    ctx?.setConfirmModal({
      title: 'Șterge bracket',
      message: 'Ștergi toate meciurile pentru această categorie?',
      icon: '🗑️',
      color: 'red',
      confirmLabel: 'Șterge',
      onConfirm: async () => {
        try {
          await Promise.all(matches.map(m => api.delete(`/matches/${m.id}/`)));
          setMatches([]);
        } catch (err) {
          console.error(err);
        } finally {
          ctx?.setConfirmModal(null);
        }
      },
    });
  };

  /* ── Export Excel ── */
  const exportExcel = async () => {
    setExportingExcel(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'FRVV Admin';
      wb.created = new Date();

      const catTitle = (shortLabel || category.name) + (category.groupName ? ` — ${category.groupName}` : '');
      const DARK_HDR  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      const YELLOW_HD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
      const RED_BG    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      const BLUE_BG   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      const GREEN_BG  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      const GRAY_BG   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      const BLACK_B   = { style: 'thin', color: { argb: 'FF000000' } };
      const GRAY_B    = { style: 'thin', color: { argb: 'FFD1D5DB' } };
      const allB      = (b = BLACK_B) => ({ top: b, left: b, bottom: b, right: b });
      const boldF     = (sz = 14, hex = '000000') => ({ name: 'Calibri', size: sz, bold: true,  color: { argb: 'FF' + hex } });
      const normF     = (sz = 13, hex = '000000') => ({ name: 'Calibri', size: sz, bold: false, color: { argb: 'FF' + hex } });
      const CC = { horizontal: 'center', vertical: 'middle' };
      const LC = { horizontal: 'left',   vertical: 'middle' };

      const fwArr = fightWeights || [];
      const weightMap = {};
      for (const fw of fwArr) {
        if (fw.category === category.id) weightMap[fw.athlete] = fw.current_weight_kg || fw.pre_weight_kg || null;
      }

      // ─── Sheet 1: Sportivi ───
      const ws1 = wb.addWorksheet('Sportivi');
      // Title
      ws1.addRow([catTitle]);
      ws1.getRow(1).height = 40;
      ws1.getRow(1).getCell(1).font = boldF(18, 'FFFFFF');
      ws1.getRow(1).getCell(1).fill = DARK_HDR;
      ws1.getRow(1).getCell(1).alignment = LC;
      ws1.mergeCells(1, 1, 1, 6);
      ws1.addRow([]); ws1.getRow(2).height = 4;
      // Header
      ws1.addRow(['#', 'Nume', 'Club', 'Greutate (kg)', 'Gen', 'Plasat în bracket']);
      ws1.getRow(3).height = 34;
      ws1.getRow(3).eachCell(c => { c.font = boldF(15, 'FFFFFF'); c.fill = DARK_HDR; c.alignment = CC; c.border = allB(); });
      [7, 44, 32, 20, 16, 22].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

      const placedIds = new Set(matches.flatMap(m => [m.red_corner, m.blue_corner].filter(Boolean)));
      const enrolled = category.enrolled_athletes || [];
      const athList = enrolled.map((ea, i) => {
        const a = ea.athlete_details;
        const id = a?.id || ea.athlete;
        return {
          id,
          idx: i + 1,
          name: a ? `${a.last_name || ''} ${a.first_name || ''}`.trim() : `Sportiv #${id}`,
          club: a?.club?.name || '',
          weight: weightMap[id] || '',
          gender: GENDER_LABELS[category.gender] || '',
          placed: placedIds.has(id),
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      // Tracks each athlete's row in this sheet, so the Bracket sheet's match
      // cells can link straight back to them - and vice versa, see
      // athleteFirstBracketCell below, filled in once the Bracket sheet is built.
      const athleteRowInSportivi = {};
      athList.forEach((ath, ri) => {
        const rowNumber = 3 + 1 + ri;
        athleteRowInSportivi[ath.id] = rowNumber;
        ws1.addRow([ri + 1, ath.name, ath.club, ath.weight || '', ath.gender, ath.placed ? 'Da' : '—']);
        const dr = ws1.getRow(rowNumber); dr.height = 26;
        dr.eachCell(c => { c.alignment = CC; c.border = allB(GRAY_B); c.font = normF(13); });
        dr.getCell(2).alignment = LC; dr.getCell(2).font = boldF(14);
        dr.getCell(3).alignment = LC; dr.getCell(3).font = normF(13, '4B5563');
        if (ath.placed) dr.getCell(6).font = boldF(14, '059669');
        if (ri % 2 === 1) dr.eachCell(c => { if (!c.fill?.fgColor) c.fill = GRAY_BG; });
      });

      // ─── Sheet 2: Bracket (visual tournament tree) ───
      const ws2 = wb.addWorksheet('Bracket');

      // Group matches by round, sort by bracket_position
      const byRound = {};
      for (const m of matches) {
        const rnd = m.round_number || 1;
        if (!byRound[rnd]) byRound[rnd] = [];
        byRound[rnd].push(m);
      }
      const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

      // Keeps the Sportivi sheet's "Plasat în bracket" link pointing at each
      // athlete's earliest (Round 1) appearance - the most useful anchor,
      // since that's the row they'd look for right after generating. Declared
      // outside the round-drawing branch so the Sportivi sheet can read it
      // afterward even for an (empty) not-yet-generated bracket.
      const athleteFirstBracketCell = {};

      if (rounds.length === 0) {
        ws2.addRow([catTitle + ' — Nu există meciuri generate.']);
      } else {
        // ── Layout constants ──
        // Each match occupies 2 player rows; gap between R1 matches = GAP rows
        const H = 2;   // rows per match (top player + bottom player)
        const GAP = 2; // gap rows between matches in round 1
        const UNIT = H + GAP; // = 4 rows per slot in R1
        const COL_W = 36; // match column width
        const CON_W = 4;  // connector column width
        const COLS_PER_ROUND = 2; // match col + connector col
        const ROW_OFFSET = 3; // first data row (after title rows)

        // Total rounds
        const nRounds = rounds.length;
        // R1 match count
        const nR1 = byRound[rounds[0]].length;
        // Total canvas rows
        const totalRows = ROW_OFFSET + nR1 * UNIT - GAP + 4;
        // Total columns
        const totalCols = nRounds * COLS_PER_ROUND + 1;

        // ── Helper: get row position of match top player ──
        // round: 1-indexed (using rounds array index)
        // pos: 0-indexed position in that round
        const getTopRow = (roundIdx, pos) => {
          // spacing doubles each round
          const spacing = UNIT * Math.pow(2, roundIdx);
          // offset centers this round between R1 pairs
          const offset = (spacing - UNIT) / 2;
          return ROW_OFFSET + Math.round(offset) + pos * spacing;
        };

        // ── Helper: get column of match cell ──
        const getMatchCol = (roundIdx) => 1 + roundIdx * COLS_PER_ROUND;
        const getConnCol  = (roundIdx) => 2 + roundIdx * COLS_PER_ROUND;

        // ── Border helpers ──
        const thin  = { style: 'thin',  color: { argb: 'FF374151' } };
        const thick = { style: 'medium', color: { argb: 'FF111827' } };
        const none  = { style: 'none' };
        const winnerBorder = { style: 'medium', color: { argb: 'FF059669' } };

        // ── Title row ──
        ws2.addRow([catTitle + ' — Bracket']);
        ws2.getRow(1).height = 36;
        ws2.getRow(1).getCell(1).font = boldF(18, 'FFFFFF');
        ws2.getRow(1).getCell(1).fill = DARK_HDR;
        ws2.getRow(1).getCell(1).alignment = LC;
        ws2.mergeCells(1, 1, 1, Math.max(totalCols, 6));
        ws2.addRow([]); ws2.getRow(2).height = 6;

        // ── Round header labels (row 2, above each match column) ──
        rounds.forEach((rnd, ri) => {
          const matchCol = getMatchCol(ri);
          const roundLabel = ROUND_LABELS[byRound[rnd][0]?.match_type] || `Runda ${rnd}`;
          const cell = ws2.getCell(ROW_OFFSET - 1, matchCol);
          cell.value = roundLabel;
          cell.font = boldF(13, 'FFFFFF');
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = allB();
          ws2.getRow(ROW_OFFSET - 1).height = 26;
          // merge over 2 cols (match + connector)
          if (ri < nRounds - 1) {
            try { ws2.mergeCells(ROW_OFFSET - 1, matchCol, ROW_OFFSET - 1, matchCol + 1); } catch (e) {}
          }
        });

        // ── Place each match ──
        rounds.forEach((rnd, ri) => {
          const matchCol = getMatchCol(ri);
          const connCol  = getConnCol(ri);
          const rndMatches = byRound[rnd].sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0));

          rndMatches.forEach((m, mi) => {
            const topRow = getTopRow(ri, mi);
            const botRow = topRow + 1;
            const redWon  = m.winner && m.winner === m.red_corner;
            const blueWon = m.winner && m.winner === m.blue_corner;
            const redName  = m.red_corner_full_name  || 'TBD';
            const blueName = m.blue_corner_full_name || 'TBD';

            // ── Top player (red corner) ──
            const topCell = ws2.getCell(topRow, matchCol);
            const redSportiviRow = m.red_corner ? athleteRowInSportivi[m.red_corner] : null;
            topCell.value = redSportiviRow ? { text: redName, hyperlink: `#'Sportivi'!A${redSportiviRow}` } : redName;
            if (m.red_corner && !athleteFirstBracketCell[m.red_corner]) athleteFirstBracketCell[m.red_corner] = topCell.address;
            topCell.font = boldF(14, redWon ? '059669' : m.red_corner ? '111827' : '9CA3AF');
            topCell.fill = redWon ? GREEN_BG : m.red_corner ? RED_BG : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
            topCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            topCell.border = {
              top:    redWon ? winnerBorder : thick,
              left:   redWon ? winnerBorder : thick,
              bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
              right:  none,
            };
            ws2.getRow(topRow).height = 24;

            // ── Bottom player (blue corner) ──
            const botCell = ws2.getCell(botRow, matchCol);
            const blueSportiviRow = m.blue_corner ? athleteRowInSportivi[m.blue_corner] : null;
            botCell.value = blueSportiviRow ? { text: blueName, hyperlink: `#'Sportivi'!A${blueSportiviRow}` } : blueName;
            if (m.blue_corner && !athleteFirstBracketCell[m.blue_corner]) athleteFirstBracketCell[m.blue_corner] = botCell.address;
            botCell.font = boldF(14, blueWon ? '059669' : m.blue_corner ? '111827' : '9CA3AF');
            botCell.fill = blueWon ? GREEN_BG : m.blue_corner ? BLUE_BG : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
            botCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            botCell.border = {
              top:    { style: 'hair', color: { argb: 'FFD1D5DB' } },
              left:   blueWon ? winnerBorder : thick,
              bottom: blueWon ? winnerBorder : thick,
              right:  none,
            };
            ws2.getRow(botRow).height = 24;

            // ── Right arm (connector from match → right) ──
            // Top arm: ─┐
            const topArm = ws2.getCell(topRow, connCol);
            topArm.border = { top: thin, right: thin, bottom: none, left: none };

            // Bottom arm: ─┘
            const botArm = ws2.getCell(botRow, connCol);
            botArm.border = { bottom: thin, right: thin, top: none, left: none };

            // Vertical line: fill right border for rows between top and bottom arm
            // This connects the two arms going to the next round
            if (ri < nRounds - 1) {
              // The next round match for this pair feeds at midpoint
              const nextRi = ri + 1;
              const nextMi = Math.floor(mi / 2);
              const nextTopRow = getTopRow(nextRi, nextMi);
              const nextBotRow = nextTopRow + 1;
              const midRowStart = topRow;
              const midRowEnd = topRow + (UNIT * Math.pow(2, ri)) - GAP - 1;

              // Draw right border line down the connector column from top arm to bottom arm of sibling
              for (let vr = topRow; vr <= Math.round(midRowEnd); vr++) {
                const vc = ws2.getCell(vr, connCol);
                if (vr === topRow) {
                  vc.border = { top: thin, right: thin, bottom: none, left: none };
                } else if (vr === Math.round(midRowEnd)) {
                  vc.border = { bottom: thin, right: thin, top: none, left: none };
                } else {
                  const existing = vc.border || {};
                  vc.border = { ...existing, right: thin };
                }
              }

              // Horizontal connector going into next round match
              // The midpoint row is between nextTopRow and nextBotRow
              const midRow = Math.round((topRow + midRowEnd) / 2);
              // Already handled by the right-border cells above; next match starts at nextTopRow
            }
          });
        });

        // ── Column widths ──
        rounds.forEach((_, ri) => {
          ws2.getColumn(getMatchCol(ri)).width = COL_W;
          ws2.getColumn(getConnCol(ri)).width  = CON_W;
        });
        // Extra winner column after last round
        ws2.getColumn(getMatchCol(nRounds)).width = COL_W;
      }

      // ─── Link Sportivi → Bracket ───
      // Now that the Bracket sheet's cells exist, turn each placed athlete's
      // "Da" into a clickable link to their Round 1 cell there - completing
      // the two-way connection (the Bracket sheet already links each name
      // back to its Sportivi row, set above).
      athList.forEach((ath, ri) => {
        if (!ath.placed) return;
        const targetCell = athleteFirstBracketCell[ath.id];
        if (!targetCell) return;
        const cell = ws1.getCell(3 + 1 + ri, 6);
        cell.value = { text: 'Da → Bracket', hyperlink: `#'Bracket'!${targetCell}` };
        cell.font = boldF(14, '059669'); // Excel auto-applies its own hyperlink style otherwise
        cell.alignment = CC;
      });

      // Download
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bracket_${(shortLabel || category.name).replace(/[\\/:*?"<>|]/g, '_').substring(0, 50)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export Excel failed', err);
      window.alert('Export Excel a eșuat: ' + err.message);
    }
    setExportingExcel(false);
  };

  /* ── Print/PDF bracket ── */
  const printBracket = () => {
    const catTitle = (shortLabel || category.name) + (category.groupName ? ` — ${category.groupName}` : '');
    const genLabel = GENDER_LABELS[category.gender] || '';
    if (matches.length === 0) return;

    // Standalone document, not a clone of the on-screen DOM: the live page's
    // styling comes from Tailwind utility classes, which this new window has
    // no stylesheet for, so cloning innerHTML here used to print completely
    // unstyled. Recomputing the same layout (via the shared
    // computeBracketLayout, so it can never drift from what's on screen) and
    // writing real CSS - with larger, more accessible print sizing - fixes
    // that and matches the app's own colors/typography.
    const CARD_W = 300;
    const CARD_H = 150;
    const COL_GAP = 90;
    const BASE_GAP = 20;
    const { rounds, byRound, positions, canvasW, canvasH, yShift } = computeBracketLayout(
      matches, { CARD_W, CARD_H, COL_GAP, BASE_GAP },
    );

    const fwArr = fightWeights || [];
    const weightMap = {};
    for (const fw of fwArr) {
      if (fw.category === category.id) weightMap[fw.athlete] = fw.current_weight_kg || fw.pre_weight_kg || null;
    }

    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const svgLines = [];
    for (const m of matches) {
      if (m.next_match && positions[m.id] && positions[m.next_match]) {
        const from = positions[m.id], to = positions[m.next_match];
        const x1 = from.x + CARD_W, y1 = from.y + yShift + CARD_H / 2;
        const midX = from.x + CARD_W + COL_GAP / 2;
        svgLines.push(`<path d="M ${x1} ${y1} H ${midX} V ${to.y + yShift + CARD_H / 2} H ${to.x}" fill="none" stroke="#94a3b8" stroke-width="2"/>`);
      }
      if (m.loser_next_match && positions[m.id] && positions[m.loser_next_match]) {
        const from = positions[m.id], to = positions[m.loser_next_match];
        const x1 = from.x + CARD_W, y1 = from.y + yShift + CARD_H / 2;
        const midX = from.x + CARD_W + COL_GAP / 2;
        svgLines.push(`<path d="M ${x1} ${y1} H ${midX} V ${to.y + yShift + CARD_H / 2} H ${to.x}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5 4"/>`);
      }
    }

    const roundHeaders = rounds.map((rnd, ri) => `
      <div class="round-header" style="left:${ri * (CARD_W + COL_GAP)}px; width:${CARD_W}px;">
        ${esc(ROUND_LABELS[byRound[rnd][0]?.match_type] || `Runda ${rnd}`)}
      </div>
    `).join('');

    const cornerRow = (name, club, weight, won, hasAthlete, colorClass) => `
      <div class="corner-row ${won ? 'won' : ''}">
        <span class="corner-dot ${colorClass}"></span>
        <span class="corner-info">
          <span class="corner-name">${hasAthlete ? esc(name) : 'TBD'}</span>
          ${hasAthlete && club ? `<span class="corner-club">${esc(club)}</span>` : ''}
        </span>
        ${weight ? `<span class="corner-weight">${esc(weight)}kg</span>` : ''}
        ${won ? '<span class="corner-won">CÂȘTIGĂ</span>' : ''}
      </div>
    `;

    const cards = matches.map((m) => {
      const pos = positions[m.id];
      if (!pos) return '';
      const redWon = m.winner && m.winner === m.red_corner;
      const blueWon = m.winner && m.winner === m.blue_corner;
      const isBye = (m.red_corner && !m.blue_corner) || (!m.red_corner && m.blue_corner);
      return `
        <div class="match-card" style="left:${pos.x}px; top:${pos.y + yShift}px; width:${CARD_W}px;">
          <div class="match-header">
            <span>ID ${m.id}</span>
            ${m.winner ? '<span class="match-status">Finalizat</span>' : isBye ? '<span class="match-status">BYE</span>' : ''}
          </div>
          ${cornerRow(m.red_corner_full_name, m.red_corner_club_name, weightMap[m.red_corner], redWon, Boolean(m.red_corner), 'red')}
          ${cornerRow(m.blue_corner_full_name, m.blue_corner_club_name, weightMap[m.blue_corner], blueWon, Boolean(m.blue_corner), 'blue')}
        </div>
      `;
    }).join('');

    const win = window.open('', '_blank', 'width=1200,height=900');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Bracket — ${esc(catTitle)}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
          body { background: white; color: #111827; padding: 24px; }
          h1 { font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 6px; }
          .subtitle { font-size: 16px; color: #4b5563; margin-bottom: 20px; }
          .bracket-canvas { position: relative; }
          .round-header {
            position: absolute; top: 0; height: 30px; display: flex; align-items: center; justify-content: center;
            background: #1e293b; color: #fff; font-size: 15px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.04em; border-radius: 4px;
          }
          .match-card {
            position: absolute; margin-top: 38px; border: 2px solid #cbd5e1; border-radius: 6px; background: #fff;
            overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          }
          .match-header {
            display: flex; justify-content: space-between; padding: 5px 10px; background: #f3f4f6;
            font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #cbd5e1;
          }
          .match-status { color: #111827; font-weight: 700; }
          .corner-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; min-height: 44px; border-bottom: 1px solid #e5e7eb; }
          .corner-row:last-child { border-bottom: none; }
          .corner-row.won { background: #fef9c3; }
          .corner-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
          .corner-dot.red { background: #ef4444; }
          .corner-dot.blue { background: #3b82f6; }
          .corner-info { flex: 1; min-width: 0; }
          .corner-name { display: block; font-size: 16px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .corner-club { display: block; font-size: 13px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .corner-weight { font-size: 14px; font-family: 'Courier New', monospace; color: #4b5563; flex-shrink: 0; }
          .corner-won { font-size: 13px; font-weight: 800; color: #111827; flex-shrink: 0; }
          @media print {
            body { padding: 10px; }
            @page { size: A3 landscape; margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <h1>${esc(catTitle)}</h1>
        <div class="subtitle">${genLabel ? `Gen: ${esc(genLabel)} · ` : ''}Export: ${new Date().toLocaleDateString('ro-RO')}</div>
        <div class="bracket-canvas" style="width:${canvasW}px; height:${canvasH + 38}px;">
          <svg style="position:absolute; inset:0; pointer-events:none;" width="${canvasW}" height="${canvasH}">${svgLines.join('')}</svg>
          ${roundHeaders}
          ${cards}
        </div>
        <script>setTimeout(() => { window.print(); window.close(); }, 400);<\/script>
      </body>
      </html>
    `);
    win.document.close();
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
    <section className="shrink-0 overflow-hidden border border-border bg-card shadow-sm">
      <div className="border-b border-sidebar-border bg-muted px-2 py-1 text-sm font-semibold text-foreground">
        <span className="truncate">{groupLabel || '—'}</span>
      </div>
      <div className={`border-b border-sidebar-border px-2 py-1 text-sm font-semibold uppercase tracking-wide text-foreground ${GENDER_BG[category.gender] || 'bg-muted'}`}>
        <span className="truncate">{catLabel} · {GENDER_LABELS[category.gender] || category.gender}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-2 py-1.5">
          {/* Bracket type selector */}
          <select
            value={bracketType}
            onChange={(e) => setBracketType(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1.5 text-sm font-medium text-muted-foreground outline-none focus:bg-muted"
            title="Tipul de bracket"
          >
            <option value="single_elimination">Eliminare directă</option>
            <option value="consolation">Cu meci de bronz</option>
          </select>
          {matches.length > 0 && (
            <button
              onClick={handleDeleteBracket}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Șterge
            </button>
          )}
          <button
            onClick={handleGenerateEmpty}
            disabled={athleteCount < 2 || generating}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            title="Generează bracket gol și plasează sportivii manual prin drag & drop"
          >
            {generating ? 'Se generează...' : 'Bracket gol'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={athleteCount < 2 || generating}
            className="rounded border border-border bg-secondary px-2 py-1.5 text-sm font-semibold text-secondary-foreground transition hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? 'Generare...' : matches.length > 0 ? 'Regenerează' : 'Generează bracket'}
          </button>
          {matches.length > 0 && !matches.some(m => m.match_type === 'bronze') && (
            <button
              onClick={handleAddBronzeMatch}
              disabled={addingBronze}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              title="Adaugă un meci pentru locul 3, fără să regenerezi tot bracket-ul"
            >
              {addingBronze ? 'Se adaugă...' : '🥉 Adaugă meci de bronz'}
            </button>
          )}
          {/* Export buttons */}
          <button
            onClick={exportExcel}
            disabled={exportingExcel || matches.length === 0}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-green-50 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Exportă bracket în Excel (2 tab-uri: Sportivi și Bracket)"
          >
            {exportingExcel ? '⏳...' : '⬇ Excel'}
          </button>
          <button
            onClick={printBracket}
            disabled={matches.length === 0}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Printează / Salvează ca PDF"
          >
            🖨 PDF
          </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded border border-border bg-card px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── content: athlete list + bracket ── */}
      <div>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground animate-pulse">Încărcare meciuri...</p>
        ) : (
          <div className="flex min-h-[520px] flex-col lg:flex-row">
            {/* ── LEFT: Athlete List Panel ── */}
            <div className="flex shrink-0 flex-col border-b border-border bg-card lg:w-72 lg:border-b-0 lg:border-r">
                <div className="border-b border-border bg-card px-3 py-2">
                  <p className="text-sm font-bold uppercase tracking-wide text-foreground">
                    Sportivi ({athleteCount})
                  </p>
                  {unplacedCount > 0 && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {unplacedCount} neplasa{unplacedCount !== 1 ? 'ți' : 't'}
                    </p>
                  )}
                  {unplacedCount === 0 && athleteCount > 0 && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Toți sportivii sunt plasați
                    </p>
                  )}
                </div>
                <div className="max-h-[560px] overflow-y-auto p-1.5">
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
                        mb-1 flex select-none items-center gap-2 rounded border px-2 py-1.5 text-sm transition-all
                        ${ath.isDQ
                          ? 'border-border bg-red-50 text-red-300 line-through cursor-not-allowed opacity-60'
                          : ath.isPlaced
                            ? 'border-border bg-muted text-muted-foreground cursor-default'
                            : 'border-border bg-card cursor-grab hover:bg-accent hover:shadow-sm active:cursor-grabbing'
                        }
                      `}
                    >
                      {/* drag handle */}
                      {!ath.isPlaced && !ath.isDQ && (
                        <span className="shrink-0 text-sm text-muted-foreground">⠿</span>
                      )}
                      {ath.isPlaced && <span className="shrink-0 text-sm text-muted-foreground">✓</span>}
                      {ath.isDQ && <span className="shrink-0 text-sm text-red-400">✕</span>}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-bold text-foreground">
                          {ath.name}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
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
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-card p-3 sm:p-4" ref={bracketRef}>
                {matches.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded border border-dashed border-border bg-muted/40 px-6 text-center text-sm text-muted-foreground">
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
function BracketTree({ matches, eventId, onAdvance, draggedAthlete, dragOverSlot, setDragOverSlot, onDropOnSlot, onRemoveFromSlot, onMatchClick }) {
  /* layout constants */
  const CARD_W = 220;
  const CARD_H = 138;  // tallest real case: header + 2 corner rows + advance button
  const COL_GAP = 90;  // horizontal gap between rounds (for connectors)
  const BASE_GAP = 12;  // vertical gap in round 1

  const { byRound, rounds, positions, canvasW, canvasH, yShift } = computeBracketLayout(
    matches, { CARD_W, CARD_H, COL_GAP, BASE_GAP },
  );

  const matchById = {};
  for (const m of matches) matchById[m.id] = m;

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
            className="absolute border border-border bg-muted px-2 py-0.5 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
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
        const nextMatch = m.next_match ? matchById[m.next_match] : null;
        const alreadyAdvanced = !!nextMatch && (nextMatch.red_corner === m.winner || nextMatch.blue_corner === m.winner);
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
              alreadyAdvanced={alreadyAdvanced}
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
function MatchCard({ match: m, eventId, onAdvance, isDroppable, dragOverSlot, setDragOverSlot, onDropOnSlot, onRemoveFromSlot, onMatchClick, alreadyAdvanced }) {
  const ctx = useContext(CentralizatorContext);
  const hasWinner = !!m.winner;
  // hasWinner-gated so a still-open BYE slot (both m.winner and the empty
  // corner are null/undefined) doesn't false-positive as "won" on nothing.
  const redWon = hasWinner && m.winner === m.red_corner;
  const blueWon = hasWinner && m.winner === m.blue_corner;
  const redLost = hasWinner && !redWon && !!m.red_corner;
  const blueLost = hasWinner && !blueWon && !!m.blue_corner;
  const isBye = (m.red_corner && !m.blue_corner) || (!m.red_corner && m.blue_corner);
  const assignedFieldId = m.field_id || m.field || null;
  const hasAssignedField = Boolean(assignedFieldId || m.field_number || m.field_name);
  const fullscreenHref = assignedFieldId
    ? `/competitions/${eventId}/live-fullscreen?field=${assignedFieldId}&panel=match&id=${m.id}`
    : null;

  const handleMoreInfoClick = (e) => {
    e.stopPropagation();
    if (!hasAssignedField || !fullscreenHref) {
      ctx?.setConfirmModal({
        title: 'Meci neprogramat',
        message: 'Acest meci nu este programat pe niciun tatami. Vrei să mergi la Programare pentru a-l programa?',
        icon: '📅',
        color: 'orange',
        confirmLabel: 'Mergi la Programare',
        onConfirm: () => {
          ctx?.setConfirmModal(null);
          window.location.href = `/competitions/${eventId}/categories/programare`;
        },
      });
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
    <div className={`flex cursor-pointer flex-col overflow-hidden border-2 bg-card text-sm shadow-sm transition-shadow hover:shadow-md ${
      hasWinner ? 'border-border' : isBye ? 'border-border' : 'border-border'
    }`} onClick={() => onMatchClick && onMatchClick(m)}>
      {/* header - status doubles as the scheduling shortcut: click "Neprogramat"
          to jump to Programare, or "Programat" to jump to the live view. */}
      <div className="flex items-center justify-between border-b-2 border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
        <span title={`ID backend: ${m.id}`}>ID {m.id}</span>
        {hasWinner ? (
          <span className="font-bold text-green-700">Finalizat</span>
        ) : isBye ? (
          <span className="font-semibold text-muted-foreground">BYE</span>
        ) : hasAssignedField ? (
          <button
            type="button"
            onClick={handleMoreInfoClick}
            className="font-semibold text-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/70"
          >
            {m.field_number ? `Tatami ${m.field_number}` : m.field_name || 'Programat'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleMoreInfoClick}
            className="font-semibold text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800"
          >
            Neprogramat
          </button>
        )}
      </div>

      {/* red corner */}
      <div
        className={`group relative flex min-h-[38px] items-center gap-1 border-b border-border px-2 py-1 transition-colors
          ${redWon ? 'bg-green-100 font-bold' : ''}
          ${isRedOver ? 'bg-yellow-100 ring-2 ring-inset ring-black' : ''}
          ${isDroppable && !m.red_corner ? 'bg-muted' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, 'red')}
        onDragLeave={() => handleDragLeave('red')}
        onDrop={(e) => handleDrop(e, 'red')}
      >
        {redLost && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <line x1="0" y1="0" x2="100%" y2="100%" stroke="#ef4444" strokeWidth="1.5" />
          </svg>
        )}
        <div className="h-2.5 w-2.5 shrink-0 bg-red-500" />
        <div className="min-w-0 flex-1">
          {m.red_corner_full_name ? (
            <>
              <span className="block truncate font-bold text-foreground">{m.red_corner_full_name}</span>
              {m.red_corner_club_name && <span className="block truncate text-xs text-muted-foreground">{m.red_corner_club_name}</span>}
            </>
          ) : (
            <span className={`text-xs italic ${isDroppable ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
              {isDroppable ? '← Trage sportiv aici' : 'TBD'}
            </span>
          )}
        </div>
        {onRemoveFromSlot && m.red_corner && !hasWinner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(m.id, 'red'); }}
            className="ml-1 text-sm text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
            title="Scoate din slot"
          >✕</button>
        )}
      </div>

      {/* blue corner */}
      <div
        className={`group relative flex min-h-[38px] items-center gap-1 px-2 py-1 transition-colors
          ${blueWon ? 'bg-green-100 font-bold' : ''}
          ${isBlueOver ? 'bg-yellow-100 ring-2 ring-inset ring-black' : ''}
          ${isDroppable && !m.blue_corner ? 'bg-muted' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, 'blue')}
        onDragLeave={() => handleDragLeave('blue')}
        onDrop={(e) => handleDrop(e, 'blue')}
      >
        {blueLost && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <line x1="0" y1="0" x2="100%" y2="100%" stroke="#ef4444" strokeWidth="1.5" />
          </svg>
        )}
        <div className="h-2.5 w-2.5 shrink-0 bg-blue-500" />
        <div className="min-w-0 flex-1">
          {m.blue_corner_full_name ? (
            <>
              <span className="block truncate font-bold text-foreground">{m.blue_corner_full_name}</span>
              {m.blue_corner_club_name && <span className="block truncate text-xs text-muted-foreground">{m.blue_corner_club_name}</span>}
            </>
          ) : (
            <span className={`text-xs italic ${isDroppable ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
              {isDroppable ? '← Trage sportiv aici' : 'TBD'}
            </span>
          )}
        </div>
        {onRemoveFromSlot && m.blue_corner && !hasWinner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromSlot(m.id, 'blue'); }}
            className="ml-1 text-sm text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-600"
            title="Scoate din slot"
          >✕</button>
        )}
      </div>

      {/* advance button - hidden once the winner is already sitting in the next match's slot */}
      {hasWinner && m.next_match && !alreadyAdvanced && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdvance(m.id); }}
          className="border-t-2 border-border bg-secondary py-0.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/90"
        >
          Avansează câștigător ▸
        </button>
      )}
    </div>
  );
}
