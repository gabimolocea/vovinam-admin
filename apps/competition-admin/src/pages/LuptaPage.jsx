import React, { useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import { fightWeightAPI, athleteAPI } from '@shared/lib/api';
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

  /* ── enrollment picker state (local to Lupta page) ── */
  const [pickerCatId, setPickerCatId] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [allAthletes, setAllAthletes] = useState([]);
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const pickerRef = useRef(null);
  const pickerBtnRefs = useRef({});

  /* ── fetch all athletes once when picker opens ── */
  const openPicker = useCallback(async (catId, e) => {
    e.stopPropagation();
    if (pickerCatId === catId) { setPickerCatId(null); return; }
    setPickerCatId(catId);
    setPickerSearch('');
    if (allAthletes.length === 0) {
      setLoadingAthletes(true);
      try {
        const res = await athleteAPI.list();
        const athletes = Array.isArray(res.data) ? res.data : res.data.results ?? [];
        setAllAthletes(athletes);
      } catch (err) { console.error('Failed to fetch athletes', err); }
      finally { setLoadingAthletes(false); }
    }
  }, [pickerCatId, allAthletes.length]);

  /* ── close picker on outside click / Escape ── */
  useEffect(() => {
    const handleClick = (e) => {
      if (pickerCatId && pickerRef.current && !pickerRef.current.contains(e.target)) setPickerCatId(null);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setPickerCatId(null); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [pickerCatId]);

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
        {fightGroups.map(({ group, cats }) => {
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
                  <div key={`${group.id}-${gender}`} className="w-full overflow-x-auto border-2 border-black bg-white">
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
                                {row.catLabel}
                                {row.cat.birth_year_start && row.cat.birth_year_end && (
                                  <span className="block text-[8px] text-blue-400 font-normal">
                                    ({row.cat.birth_year_start}–{row.cat.birth_year_end})
                                  </span>
                                )}
                                <span className={`mt-0.5 block text-[9px] ${row.enrolledCount < 3 ? 'font-semibold text-red-600' : 'text-gray-400'}`}>
                                  {row.enrolledCount} sportiv{row.enrolledCount !== 1 ? 'i' : ''}
                                </span>
                              </td>
                            )}
                            {/* NUME PRACTICANT */}
                            <td className={`border border-black px-2 py-1 text-sm ${strongTopBorder} ${isDQ ? 'line-through text-red-400' : 'text-gray-900'}`}>
                              <span className="truncate block">
                                {name}
                                {club && name && <span className="text-gray-400 ml-1">({club})</span>}
                              </span>
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
                );
              })}
            </div>
          );
        })}
      </div>

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
