import React, { useContext } from 'react';
import { CentralizatorContext, GENDER_BG, GENDER_LABELS, TYPE_LABELS } from './CategoriesLayout';

export default function CentralizatorPage() {
  const ctx = useContext(CentralizatorContext);
  if (!ctx) return null;

  const {
    columnStructure, allCols, clubRows, countPerCat, groups,
    dragType, dragId, dragOverId,
    editingGroupId, editingGroupName, setEditingGroupId, setEditingGroupName,
    editingCatId, editingCatName, setEditingCatId, setEditingCatName,
    enrollPickerCell, busy,
    setGroupModal, setGroupForm, setCatModal, setCatForm,
    handleGroupRenameStart, handleGroupRenameSubmit, handleToggleAllowYounger,
    handleCatRenameStart, handleCatRenameSubmit,
    handleGroupDragStart, handleGroupDragOver, handleGroupDrop,
    handleCatDragStart, handleCatDragOver, handleCatDrop, handleDragEnd,
    handleClubDragStart, handleClubDragOver, handleClubDrop,
    handleCellClick, handleDeleteGroup, handleDeleteCat,
    handleUnenroll,
    isEditLocked,
    canUnlockEdit,
    generatingDefaults,
    showStandardStructureBanner,
    handleGenerateStandardStructure,
    dismissStandardStructureBanner,
  } = ctx;

  // Total colSpan for the empty-state message
  const totalColSpan = 1
    + columnStructure.reduce((sum, col) => sum + 1 + Math.max(col.cats.length, 1), 0)
    + 1;

  const renderAddLabel = (label = 'Adaugă sportiv') => (
    <>
      <span className="frvv-btn-add-icon">+</span>
      <span>{label}</span>
    </>
  );

  const isTeamCategory = (type) => type === 'team' || type === 'teams';

  return (
    <div className="flex-1 overflow-auto bg-white">
      {canUnlockEdit && showStandardStructureBanner && (
        <div className="border-b-2 border-black bg-yellow-50 px-3 py-3 md:px-5 lg:px-7 xl:px-8 2xl:px-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start justify-between gap-3 md:flex-1">
              <div>
              <div className="text-sm font-black uppercase tracking-wide text-gray-900">Structură standard competiție</div>
              <p className="mt-1 text-sm text-gray-700">
                Generează doar grupele și categoriile standard care lipsesc. Elementele existente rămân neschimbate și nu se duplică.
              </p>
              </div>
              <button
                type="button"
                onClick={dismissStandardStructureBanner}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-black bg-white text-lg font-black text-gray-700 transition hover:bg-yellow-100"
                title="Ascunde această secțiune"
                aria-label="Ascunde această secțiune"
              >
                ×
              </button>
            </div>
            <button
              onClick={handleGenerateStandardStructure}
              disabled={busy || generatingDefaults}
              className="frvv-btn-primary w-full justify-center md:w-auto"
            >
              {generatingDefaults ? 'Se generează...' : 'Generează categorii și grupe standard'}
            </button>
          </div>
        </div>
      )}
      <div className={`space-y-4 p-3 md:hidden ${isEditLocked ? 'opacity-95' : ''}`} inert={isEditLocked ? '' : undefined}>
        {columnStructure.length === 0 ? (
          <div className="border-2 border-black bg-white px-4 py-10 text-center text-sm text-gray-400 italic">
            Nu există încă grupe sau categorii.
          </div>
        ) : (
          columnStructure.flatMap(col =>
            (col.cats || []).map(cat => {
              const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
                const an = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                const bn = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                return an.localeCompare(bn);
              });
              return (
                <div key={cat.id} className="border-2 border-black bg-white">
                  <div className="border-b border-black bg-yellow-100 px-3 py-2">
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-sm text-gray-900">
                      <span className="font-black uppercase tracking-wide">{col.group.name}</span>
                      <span className="text-gray-400">•</span>
                      <span className="font-bold">{cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}</span>
                      <span className="text-gray-400">•</span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-900 ${GENDER_BG[cat.gender] || 'bg-gray-100'}`}>
                        {GENDER_LABELS[cat.gender] || cat.gender}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-xs font-semibold text-gray-700">{countPerCat[cat.id] || 0} participanți</span>
                    </div>
                  </div>
                  <div className="space-y-2 p-3">
                    <button
                      onClick={(e) => handleCellClick(null, cat.id, e)}
                      className="frvv-btn-add w-full"
                    >
                      {renderAddLabel(isTeamCategory(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv')}
                    </button>
                    {enrolled.length === 0 ? (
                      <div className="text-sm text-gray-400 italic">Niciun sportiv înscris.</div>
                    ) : (
                      <div className="space-y-2">
                        {enrolled.map(enrollment => {
                          const athlete = enrollment.athlete_details;
                          const athleteName = `${athlete?.last_name || ''} ${athlete?.first_name || ''}`.trim();
                          const clubName = athlete?.club?.name || '';
                          return (
                            <div key={enrollment.id} className="flex items-center justify-between gap-2 border border-black/20 bg-white px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-gray-900">{athleteName}</div>
                                {clubName && <div className="truncate text-xs text-gray-500">{clubName}</div>}
                              </div>
                              <button
                                onClick={(e) => handleUnenroll(enrollment.id, athleteName, cat.name, e)}
                                disabled={busy}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-red-700 bg-red-500 text-base font-black leading-none text-white transition hover:bg-red-600 disabled:opacity-40"
                                title="Scoate sportivul din categorie"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      <div className="hidden p-5 md:block lg:p-7 xl:p-8 2xl:p-10">
      <div className="overflow-auto border-2 border-black bg-white">
      <table className={`border-collapse text-sm w-max min-w-full ${isEditLocked ? 'opacity-95' : ''}`} inert={isEditLocked ? '' : undefined}>

        {/* ═══ ROW 1: Group headers + "+" add-group column ═══ */}
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-40 bg-black text-white border border-black px-4 py-4 text-left font-black text-sm uppercase tracking-wide min-w-[170px] lg:min-w-[220px]"
              rowSpan={3}>
              CLUB
            </th>
            {columnStructure.map((col, ci) => (
              <React.Fragment key={col.group.id}>
                {/* ── Between-group insert zone ── */}
                <th className="border-none p-0 w-0 relative group/insert" rowSpan={3}>
                  <div className="absolute inset-y-0 -left-2 -right-2 z-30 flex items-center justify-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); setGroupModal({ atIndex: ci }); setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false }); }}
                      className="opacity-0 group-hover/insert:opacity-100 inline-flex items-center gap-1 border border-green-700 bg-green-600 text-white text-[10px] font-bold px-2.5 py-1 transition-all hover:bg-green-700 whitespace-nowrap"
                      title="Adaugă grupă aici"
                    ><span className="frvv-btn-add-icon !h-4 !w-4">+</span> Adaugă grupă</button>
                  </div>
                </th>

                {/* ── Group header ── */}
                <th colSpan={col.colSpan}
                  draggable
                  onDragStart={(e) => handleGroupDragStart(e, col.group.id)}
                  onDragOver={(e) => handleGroupDragOver(e, col.group.id)}
                  onDrop={(e) => handleGroupDrop(e, col.group.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-yellow-300 text-gray-900 border border-black px-4 py-3 text-center font-black text-sm whitespace-nowrap relative cursor-grab active:cursor-grabbing transition-all ${
                    dragType === 'group' && dragId === col.group.id ? 'opacity-40 scale-95' : ''
                  } ${dragType === 'group' && dragOverId === col.group.id ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                  <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap">
                    <span className="opacity-40 text-[10px] select-none">⠿</span>
                    {editingGroupId === col.group.id ? (
                      <input
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onBlur={() => handleGroupRenameSubmit(col.group)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGroupRenameSubmit(col.group); if (e.key === 'Escape') setEditingGroupId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white border border-black/30 rounded px-1 py-0.5 text-gray-900 text-xs font-bold text-center w-28 outline-none focus:bg-yellow-50"
                        autoFocus
                      />
                    ) : (
                      <span onDoubleClick={(e) => { e.stopPropagation(); handleGroupRenameStart(col.group); }}
                        className="cursor-text" title="Dublu-click pentru a redenumi">
                        {col.group.name}
                        {(col.group.birth_date_start || col.group.birth_year_start) && (col.group.birth_date_end || col.group.birth_year_end) && (
                          <span className="font-normal opacity-70 text-[10px] ml-1 hidden sm:inline">
                            ({col.group.birth_date_start
                              ? `${col.group.birth_date_start} – ${col.group.birth_date_end}`
                              : `${col.group.birth_year_start}–${col.group.birth_year_end}`})
                          </span>
                        )}
                        {col.group.allowed_grade_type === 'inferior' && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-amber-400/30 text-amber-200 text-[8px] font-medium px-1.5 py-0.5" title="Doar grade inferioare (gradele superioare nu au voie)">
                            Grade inferioare
                          </span>
                        )}
                        {col.group.allowed_grade_type === 'superior' && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-emerald-400/30 text-emerald-200 text-[8px] font-medium px-1.5 py-0.5" title="Doar grade superioare">
                            Grade superioare
                          </span>
                        )}
                      </span>
                    )}
                    {/* Allow younger toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleAllowYounger(col.group); }}
                      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-medium transition ${
                        col.group.allow_younger
                          ? 'bg-amber-400/40 text-amber-900 hover:bg-amber-400/55'
                          : 'bg-white/70 text-gray-500 hover:bg-white hover:text-gray-800'
                      }`}
                      title={col.group.allow_younger ? 'Acceptă vârste mai mici (activ) — click pentru a dezactiva' : 'Permite sportivi mai tineri să urce la categorie superioară'}
                    >
                      <span>⬆</span>
                      <span className="hidden sm:inline">{col.group.allow_younger ? 'Tineri ✓' : 'Tineri'}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCatModal({ groupId: col.group.id }); setCatForm({ name: '', category_type: 'solo', gender: 'male' }); }}
                      className="inline-flex items-center gap-1 border border-black/30 bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold text-gray-800 transition hover:bg-white"
                      title="Adaugă categorie"
                    ><span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-black/20 bg-yellow-100 text-[10px] leading-none">+</span><span className="hidden sm:inline">Categorie</span></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(col.group.id); }}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/80 hover:bg-red-500/80 text-gray-600 hover:text-white text-xs font-bold transition"
                      title="Șterge grupa"
                    >×</button>
                  </div>
                </th>
              </React.Fragment>
            ))}

            {/* ═══ Trailing insert zone (after last group) ═══ */}
            <th className="border-none p-0 w-0 relative group/insert" rowSpan={3}>
              <div className="absolute inset-y-0 -left-2 right-0 z-30 flex items-center justify-center" style={{ minWidth: '24px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setGroupModal({ atIndex: columnStructure.length }); setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false }); }}
                  className="opacity-0 group-hover/insert:opacity-100 inline-flex items-center gap-1 border border-green-700 bg-green-600 text-white text-[10px] font-bold px-2.5 py-1 transition-all hover:bg-green-700 whitespace-nowrap"
                  title="Adaugă grupă"
                ><span className="frvv-btn-add-icon !h-4 !w-4">+</span> Adaugă grupă</button>
              </div>
            </th>
          </tr>

          {/* ═══ ROW 2: Gender sub-headers ═══ */}
          <tr>
            {columnStructure.map(col =>
              col.genderSections.length === 0
                ? <th key={`g-empty-${col.group.id}`} className="bg-gray-100 border border-black/30 px-1 py-1 text-center text-xs text-gray-500 italic">
                    Fără categorii
                  </th>
                : col.genderSections.map(gs => (
                    <th key={`${col.group.id}-${gs.gender}`} colSpan={gs.colSpan}
                      className={`${GENDER_BG[gs.gender] || 'bg-gray-100'} border border-black/30 px-2 py-2 text-center font-bold text-sm uppercase tracking-wide text-gray-900`}>
                      {GENDER_LABELS[gs.gender] || gs.gender}
                    </th>
                  ))
            )}
          </tr>

          {/* ═══ ROW 3: Individual category names with delete ═══ */}
          <tr>
            {allCols.length === 0 && columnStructure.length > 0 ? (
              columnStructure.map(col => (
                <th key={`empty-${col.group.id}`} className="bg-gray-50 border border-black/30 px-1 py-1 text-center text-xs text-gray-400 italic min-w-[80px]">
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
                  className={`bg-gray-50 border border-black/30 px-3 py-3 text-center font-bold text-sm text-gray-900 min-w-[150px] group/cat cursor-grab active:cursor-grabbing transition-all ${
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
                      className="absolute -top-2 -right-2 hidden group-hover/cat:inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold leading-none hover:bg-red-600"
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
              const firstAvailableAthleteRowByCategory = new Map();
              allCols.forEach((cat) => {
                const firstIndex = athletes.findIndex((ath) => !ath.enrollments?.[cat.id]);
                firstAvailableAthleteRowByCategory.set(cat.id, firstIndex);
              });
              return athletes.length === 0 ? (
                /* Club with no enrolled athletes — single empty row */
                <tr key={`club-${clubId}`}
                  className={`border-t-2 border-black/40 hover:bg-yellow-50/40 transition-colors ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                >
                  <td className="sticky left-0 z-10 bg-white border border-black/30 px-4 py-3 font-bold text-sm text-gray-900 align-middle cursor-grab active:cursor-grabbing select-none"
                    draggable
                    onDragStart={(e) => handleClubDragStart(e, clubId)}
                    onDragOver={(e) => handleClubDragOver(e, clubId)}
                    onDrop={(e) => handleClubDrop(e, clubId)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-40 text-[10px]">⠿</span>
                      <span className="truncate">{club}</span>
                    </div>
                  </td>
                  {columnStructure.map(col => (
                    <React.Fragment key={`grp-${col.group.id}`}>
                      <td className="p-0 w-0 border-none"></td>
                      {col.cats.length === 0 ? (
                        <td className="border border-black/20 text-gray-200"></td>
                      ) : col.cats.map(cat => {
                        const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                        return (
                          <td key={cat.id}
                            onClick={(e) => handleCellClick(clubId, cat.id, e)}
                            className={`border border-black/20 px-2 py-2 text-center cursor-pointer transition-colors group/cell ${
                              isPickerOpen ? 'bg-green-50 ring-2 ring-green-400 ring-inset' : 'hover:bg-green-50'
                            }`}
                          >
                            <span className="frvv-btn-add mx-auto flex max-w-full items-center justify-center px-2 py-1 text-[10px] leading-tight">
                              <span className="frvv-btn-add-icon !h-4 !w-4">+</span>
                              <span className="hidden lg:inline">{isTeamCategory(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv'}</span>
                              <span className="lg:hidden">Adaugă</span>
                            </span>
                          </td>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  <td className="border border-gray-100"></td>
                </tr>
              ) : (
                <React.Fragment key={`club-${clubId}`}>
                {athletes.map((ath, athIdx) => (
                  <tr key={ath.id}
                    className={`${athIdx === 0 ? 'border-t-2 border-black/40' : ''} hover:bg-yellow-50/40 transition-colors ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub && athIdx === 0 ? 'ring-t-2 ring-blue-400' : ''}`}
                  >
                    {athIdx === 0 && (
                      <td className="sticky left-0 z-10 bg-white border border-black/30 px-4 py-4 font-bold text-sm text-gray-900 align-top cursor-grab active:cursor-grabbing select-none"
                        rowSpan={rowCount}
                        draggable
                        onDragStart={(e) => handleClubDragStart(e, clubId)}
                        onDragOver={(e) => handleClubDragOver(e, clubId)}
                        onDrop={(e) => handleClubDrop(e, clubId)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="opacity-40 text-[10px]">⠿</span>
                          <span className="truncate">{club}</span>
                        </div>
                      </td>
                    )}
                    {columnStructure.map(col => (
                      <React.Fragment key={`grp-${col.group.id}`}>
                        <td className="p-0 w-0 border-none"></td>
                        {col.cats.length === 0 ? (
                          <td className="border border-black/20 text-gray-200"></td>
                        ) : col.cats.map(cat => {
                          const enrollment = ath.enrollments[cat.id];
                          const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                          const firstAvailableRowIndex = firstAvailableAthleteRowByCategory.get(cat.id);
                          const showAddButton = !enrollment && firstAvailableRowIndex === athIdx;
                          return (
                            <td key={cat.id}
                              onClick={(e) => handleCellClick(clubId, cat.id, e)}
                              className={`border border-black/20 px-2 py-2 text-center cursor-pointer transition-colors group/cell ${
                                isPickerOpen
                                  ? 'bg-green-50 ring-2 ring-green-400 ring-inset'
                                  : enrollment ? 'bg-green-50 text-gray-800 hover:bg-green-100' : 'hover:bg-green-50'
                              }`}
                            >
                              {enrollment ? (
                                  <span className="block relative" title={ath.name}>
                                    <span className="flex items-center justify-between gap-2">
                                      <span className="min-w-0 truncate font-medium leading-tight">{ath.name}</span>
                                      <button
                                        onClick={(e) => handleUnenroll(enrollment.id, ath.name, cat.name, e)}
                                        disabled={busy}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-red-700 bg-red-500 text-base font-black leading-none text-white transition hover:bg-red-600 disabled:opacity-40"
                                        title="Scoate sportivul din categorie"
                                      >×</button>
                                    </span>
                                </span>
                              ) : (
                                showAddButton ? (
                                  <span className="frvv-btn-add mx-auto flex max-w-full items-center justify-center px-2 py-1 text-[10px] leading-tight">
                                    <span className="frvv-btn-add-icon !h-4 !w-4">+</span>
                                    <span className="hidden xl:inline">{isTeamCategory(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv'}</span>
                                    <span className="xl:hidden">Adaugă</span>
                                  </span>
                                ) : null
                              )}
                            </td>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    <td className="border border-gray-100"></td>
                  </tr>
                ))}
                </React.Fragment>
              );
            })
          )}
        </tbody>

        {/* ═══ FOOTER: participant count per category ═══ */}
        {allCols.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-black/40">
              <td className="sticky left-0 z-10 bg-gray-100 border border-black/30 px-4 py-3 font-bold text-sm text-gray-900">
                Număr participanți
              </td>
              {columnStructure.map(col => (
                <React.Fragment key={`f-${col.group.id}`}>
                  <td className="p-0 w-0 border-none bg-gray-100"></td>
                  {col.cats.length === 0 ? (
                    <td className="border border-black/30 bg-gray-100"></td>
                  ) : col.cats.map(cat => (
                    <td key={cat.id} className="border border-black/30 px-2 py-3 text-center font-bold text-base text-gray-900">
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
      </div>
    </div>
  );
}
