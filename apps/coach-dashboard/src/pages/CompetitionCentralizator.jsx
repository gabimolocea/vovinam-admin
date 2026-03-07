import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner } from '@shared/components/ui';
import useCoachCentralizator from '../hooks/useCoachCentralizator';

const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const GENDER_BG     = { male: 'bg-blue-100', female: 'bg-pink-100', mixt: 'bg-amber-100' };
const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', fight: 'Luptă' };

export default function CompetitionCentralizator() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const ctx = useCoachCentralizator(eventId);

  if (ctx.loading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between border-b border-gray-300 bg-white px-3 py-2 shrink-0 gap-2 min-h-[44px]">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/competitions')}
            className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition shrink-0">
            ← Înapoi
          </button>
          <div className="h-4 w-px bg-gray-300 hidden sm:block" />
          <h1 className="text-sm font-bold text-gray-900 truncate">
            {ctx.eventData?.name || `Competiția #${eventId}`}
          </h1>
          {ctx.eventDateStr && (
            <span className="hidden md:inline text-[10px] text-blue-500 bg-blue-50 rounded px-1.5 py-0.5 shrink-0">
              {ctx.eventDateStr}
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] shrink-0">
          <span className="text-gray-500">{ctx.groups.length} grupe</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">{ctx.categories.length} categorii</span>
          <span className="text-gray-300">·</span>
          <span className="font-semibold text-blue-600">{ctx.totalAthletes} sportivi</span>
        </div>
      </div>

      {/* ═══ TABLE ═══ */}
      <CentralizatorTable ctx={ctx} />

      {/* ═══ CONFIRM MODAL ═══ */}
      {ctx.confirmModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => ctx.setConfirmModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="text-4xl mb-3">{ctx.confirmModal.icon || '⚠️'}</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{ctx.confirmModal.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{ctx.confirmModal.message}</p>
            </div>
            <div className="flex border-t border-gray-200">
              <button onClick={() => ctx.setConfirmModal(null)}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition border-r border-gray-200">
                Anulează
              </button>
              <button onClick={ctx.confirmModal.onConfirm} disabled={ctx.busy}
                className={`flex-1 px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                  ctx.confirmModal.color === 'orange' ? 'text-orange-600 hover:bg-orange-50' : 'text-red-600 hover:bg-red-50'
                }`}>
                {ctx.confirmModal.confirmLabel || 'Confirmă'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WEIGHT MODAL (fight categories) ═══ */}
      {ctx.weightModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => ctx.setWeightModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Greutate sportiv</h3>
              <p className="text-xs text-gray-500 mb-3">
                Introdu greutatea pentru <strong>{ctx.weightModal.athleteName}</strong> (categorie de luptă)
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="200"
                  value={ctx.weightValue}
                  onChange={(e) => ctx.setWeightValue(e.target.value)}
                  placeholder="ex: 65.5"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') ctx.handleWeightSubmit(); }}
                />
                <span className="text-sm text-gray-500">kg</span>
              </div>
            </div>
            <div className="flex border-t border-gray-200">
              <button onClick={() => ctx.setWeightModal(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition border-r border-gray-200">
                Anulează
              </button>
              <button onClick={ctx.handleWeightSubmit} disabled={ctx.busy}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 transition disabled:opacity-50">
                Înscrie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ENROLLMENT PICKER POPOVER ═══ */}
      {ctx.enrollPickerCell && (() => {
        const { clubId, catId, rect } = ctx.enrollPickerCell;
        const clubName = ctx.clubs.find(c => c.id === clubId)?.name || '—';
        const cat = ctx.categories.find(c => c.id === catId);
        const catName = cat?.name || '—';
        const isFightCat = cat?.type === 'fight' || cat?.category_type === 'fight';
        const allClubAthletes = ctx.clubAthleteCache[clubId] || [];
        const isLoading = !ctx.clubAthleteCache[clubId];
        const enrolledIds = new Set(
          (cat?.enrolled_athletes || [])
            .filter(ea => {
              const aClub = ea.athlete_details?.club;
              return aClub?.id === clubId || aClub === clubId;
            })
            .map(ea => ea.athlete_details?.id || ea.athlete)
        );

        const group = ctx.groups.find(g => g.id === cat?.group);
        const dateStart = group?.birth_date_start || (group?.birth_year_start ? `${group.birth_year_start}-01-01` : null);
        const dateEnd = group?.birth_date_end || (group?.birth_year_end ? `${group.birth_year_end}-12-31` : null);
        const hasDateRange = dateStart && dateEnd;
        const allowYounger = group?.allow_younger || false;

        const athleteList = hasDateRange
          ? allClubAthletes.filter(ath => {
              if (!ath.date_of_birth) return false;
              if (ath.date_of_birth < dateStart) return false;
              if (!allowYounger && ath.date_of_birth > dateEnd) return false;
              return true;
            })
          : allClubAthletes;

        const outOfRangeCount = hasDateRange ? allClubAthletes.length - athleteList.length : 0;

        const top = Math.min(rect.bottom + 4, window.innerHeight - 360);
        const left = Math.min(rect.left, window.innerWidth - 280);

        return (
          <div ref={ctx.enrollPickerRef}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[100] w-72 rounded-lg border border-gray-200 bg-white shadow-2xl"
            style={{ top, left }}
          >
            <div className="p-2 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wide truncate">{clubName}</p>
              <p className="text-[9px] text-gray-400 truncate">{catName}</p>
              {isFightCat && <p className="text-[8px] text-orange-500 mt-0.5">🥊 Categorie de luptă — se va cere greutatea</p>}
              {hasDateRange && (
                <p className="text-[8px] text-blue-500 mt-0.5">
                  Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                </p>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-[10px] text-gray-400">Se încarcă…</div>
              ) : athleteList.length === 0 ? (
                <div className="p-4 text-center text-[10px] text-gray-400 italic">
                  {hasDateRange
                    ? `Niciun sportiv din clubul tău nu se încadrează în intervalul de vârstă (${outOfRangeCount} exclu${outOfRangeCount === 1 ? 's' : 'și'}).`
                    : 'Niciun sportiv în clubul tău.'}
                </div>
              ) : (
                athleteList.map(ath => {
                  const isEnrolled = enrolledIds.has(ath.id);
                  const dob = ath.date_of_birth;
                  return (
                    <button key={ath.id}
                      onClick={() => ctx.handleToggleEnroll(ath.id, catId)}
                      disabled={ctx.busy}
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
              <button onClick={() => ctx.setEnrollPickerCell(null)}
                className="text-[9px] text-gray-400 hover:text-gray-600 transition">Închide</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   CENTRALIZATOR TABLE — coach's own club only
   ═══════════════════════════════════════════════════════ */
function CentralizatorTable({ ctx }) {
  const {
    myClubId,
    columnStructure, allCols, clubRows, countPerCat, groups,
    enrollPickerCell, busy,
    handleCellClick, handleUnenroll,
  } = ctx;

  const totalColSpan = 1
    + columnStructure.reduce((sum, col) => sum + 1 + Math.max(col.cats.length, 1), 0)
    + 1;

  return (
    <div className="flex-1 overflow-auto bg-gray-100">
      <table className="border-collapse text-[11px] w-max min-w-full">

        {/* ═══ ROW 1: Group headers ═══ */}
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-40 bg-gray-800 text-white border border-gray-600 px-2 sm:px-3 py-2 text-left font-bold text-xs min-w-[100px] sm:min-w-[140px]"
              rowSpan={3}>
              CLUB
            </th>
            {columnStructure.map((col) => (
              <React.Fragment key={col.group.id}>
                <th className="border-none p-0 w-1" rowSpan={3}></th>
                <th colSpan={col.colSpan}
                  className="bg-gray-700 text-white border border-gray-500 px-2 py-1.5 text-center font-bold text-xs whitespace-nowrap">
                  <span>
                    {col.group.name}
                    {(col.group.birth_date_start || col.group.birth_year_start) && (col.group.birth_date_end || col.group.birth_year_end) && (
                      <span className="font-normal opacity-70 text-[10px] ml-1 hidden sm:inline">
                        ({col.group.birth_date_start
                          ? `${col.group.birth_date_start} – ${col.group.birth_date_end}`
                          : `${col.group.birth_year_start}–${col.group.birth_year_end}`})
                      </span>
                    )}
                  </span>
                  {col.group.allow_younger && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/30 text-amber-200 px-1.5 py-0.5 text-[8px] font-medium ml-1.5"
                      title="Acceptă sportivi mai tineri">
                      ⬆ <span className="hidden sm:inline">Tineri ✓</span>
                    </span>
                  )}
                </th>
              </React.Fragment>
            ))}
            <th className="border-none p-0 w-1" rowSpan={3}></th>
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

          {/* ═══ ROW 3: Category names ═══ */}
          <tr>
            {allCols.length === 0 && columnStructure.length > 0 ? (
              columnStructure.map(col => (
                <th key={`empty-${col.group.id}`} className="bg-gray-50 border border-gray-300 px-1 py-1 text-center text-[9px] text-gray-300 italic min-w-[80px]">—</th>
              ))
            ) : (
              allCols.map(cat => (
                <th key={cat.id}
                  className="bg-gray-50 border border-gray-300 px-1 py-1 text-center font-medium text-[10px] text-gray-700 min-w-[80px]"
                  title={`${cat.name} (${TYPE_LABELS[cat.type] || cat.type})`}
                >
                  <div className="leading-tight whitespace-normal">
                    {cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}
                  </div>
                </th>
              ))
            )}
          </tr>
        </thead>

        {/* ═══ BODY ═══ */}
        <tbody>
          {clubRows.length === 0 ? (
            <tr>
              <td colSpan={totalColSpan} className="px-4 py-12 text-center text-sm text-gray-400 italic">
                {groups.length === 0
                  ? <><span className="text-2xl block mb-2">📋</span>Nu sunt grupe definite pentru această competiție.</>
                  : allCols.length === 0
                  ? 'Nu sunt categorii definite.'
                  : 'Click pe o celulă pentru a înscrie sportivi.'}
              </td>
            </tr>
          ) : (
            clubRows.map(({ clubId, club, athletes }) => {
              const isMyClub = clubId === myClubId;
              const rowCount = Math.max(athletes.length, 1);

              return athletes.length === 0 ? (
                <tr key={`club-${clubId}`} className="border-t-2 border-gray-400 hover:bg-blue-50/40 transition-colors">
                  <td className="sticky left-0 z-10 bg-blue-50 text-blue-900 border border-gray-300 px-2 sm:px-3 py-1.5 font-bold text-xs align-middle">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{club}</span>
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
                            className={`border border-gray-200 px-1 py-1 text-center text-[10px] transition-colors cursor-pointer ${
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
                    className={`${athIdx === 0 ? 'border-t-2 border-gray-400' : ''} hover:bg-blue-50/40 transition-colors`}
                  >
                    {athIdx === 0 && (
                      <td className="sticky left-0 z-10 bg-blue-50 text-blue-900 border border-gray-300 px-2 sm:px-3 py-1.5 font-bold text-xs align-top"
                        rowSpan={rowCount}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{club}</span>
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
                              className={`border border-gray-200 px-1 py-1 text-center text-[10px] transition-colors cursor-pointer ${
                                isPickerOpen
                                  ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset'
                                  : enrollment ? 'bg-green-50 text-gray-800 hover:bg-green-100' : 'hover:bg-blue-50'
                              }`}
                            >
                              {enrollment ? (
                                <span className="font-medium leading-tight block relative group/athlete" title={ath.name}>
                                  {ath.name}
                                  {enrollment.weight && (
                                    <span className="block text-[8px] text-gray-400 font-normal">{enrollment.weight} kg</span>
                                  )}
                                  <button
                                    onClick={(e) => handleUnenroll(enrollment.id, ath.name, cat.name, e)}
                                    disabled={busy}
                                    className="absolute -top-1 -right-1 hidden group-hover/athlete:inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold leading-none hover:bg-red-600 disabled:opacity-40"
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

        {/* ═══ FOOTER ═══ */}
        {allCols.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-gray-400">
              <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-2 sm:px-3 py-2 font-bold text-xs text-gray-700">
                Număr participanți
              </td>
              {columnStructure.map(col => (
                <React.Fragment key={`f-${col.group.id}`}>
                  <td className="p-0 w-0 border-none bg-gray-100"></td>
                  {col.cats.length === 0 ? (
                    <td className="border border-gray-300 bg-gray-100"></td>
                  ) : col.cats.map(cat => (
                    <td key={cat.id} className="border border-gray-300 px-1 py-2 text-center font-bold text-xs text-gray-700">
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
  );
}
