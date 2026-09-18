import React from 'react';
import { ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { Alert, Button, Input } from './ui';
import { GENDER_BG, GENDER_LABELS, TYPE_LABELS, isTeamCategoryType } from '../lib/centralizator';

/**
 * Admin-only desktop matrix (club × category) for the Centralizator: full
 * structure CRUD, drag-reorder, and enrollment - ported from
 * apps/competition-admin's CentralizatorPage.jsx, restyled with apps/app's
 * real component library instead of the .frvv-* brutalist skin. Rendered
 * only at md:+ width; below that, the caller falls back to the existing
 * read-only card-grid (CoachTehnicaView/CoachLuptaView).
 */
// ctx.countPerCat always counts enrolled_athletes.length regardless of
// category type (harmless in the coach hook, which never shows team
// categories' counts) - compute the real count here instead of reusing it.
const participantCount = (cat) => (isTeamCategoryType(cat.type) ? (cat.enrolled_teams?.length ?? 0) : (cat.enrolled_athletes?.length ?? 0));

export default function AdminCentralizatorMatrix({ ctx }) {
  const {
    columnStructure, allCols, clubRows, groups,
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
    generatingDefaults,
    showStandardStructureBanner,
    handleGenerateStandardStructure,
    dismissStandardStructureBanner,
  } = ctx;

  const totalColSpan = 1 + columnStructure.reduce((sum, col) => sum + 1 + Math.max(col.cats.length, 1), 0) + 1;

  const openGroupModal = (atIndex) => {
    setGroupModal({ atIndex });
    setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false });
  };
  const openCatModal = (groupId) => {
    setCatModal({ groupId });
    setCatForm({ name: '', category_type: 'solo', gender: 'male' });
  };

  return (
    <div>
      {showStandardStructureBanner && (
        <Alert className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start justify-between gap-3 md:flex-1">
            <div>
              <div className="text-sm font-semibold">Structură standard competiție</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Generează doar grupele și categoriile standard care lipsesc. Elementele existente rămân neschimbate și nu se duplică.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissStandardStructureBanner}
              aria-label="Ascunde această secțiune"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={handleGenerateStandardStructure} disabled={busy || generatingDefaults} className="w-full md:w-auto">
            {generatingDefaults ? 'Se generează…' : 'Generează categorii și grupe standard'}
          </Button>
        </Alert>
      )}

      <div className="overflow-auto rounded-lg border border-border bg-card">
        <table className="w-max min-w-full border-collapse text-sm">
          {/* ═══ ROW 1: Group headers + "+" add-group column ═══ */}
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                className="sticky left-0 z-40 min-w-[170px] border border-border bg-muted px-4 py-4 text-left text-sm font-bold uppercase tracking-wide lg:min-w-[220px]"
                rowSpan={3}
              >
                Club
              </th>
              {columnStructure.map((col, ci) => (
                <React.Fragment key={col.group.id}>
                  <th className="group/insert relative w-0 border-none p-0" rowSpan={3}>
                    <div className="absolute inset-y-0 -left-2 -right-2 z-30 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openGroupModal(ci); }}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold opacity-0 shadow-sm transition-all hover:bg-accent group-hover/insert:opacity-100"
                        aria-label="Adaugă grupă aici"
                      >
                        <Plus className="h-3.5 w-3.5" /> Grupă
                      </button>
                    </div>
                  </th>

                  <th
                    colSpan={col.colSpan}
                    draggable
                    onDragStart={(e) => handleGroupDragStart(e, col.group.id)}
                    onDragOver={(e) => handleGroupDragOver(e, col.group.id)}
                    onDrop={(e) => handleGroupDrop(e, col.group.id)}
                    onDragEnd={handleDragEnd}
                    className={`relative cursor-grab whitespace-nowrap border border-border bg-amber-500/15 px-4 py-3 text-center text-sm font-bold transition-all active:cursor-grabbing ${
                      dragType === 'group' && dragId === col.group.id ? 'scale-95 opacity-40' : ''
                    } ${dragType === 'group' && dragOverId === col.group.id ? 'ring-2 ring-primary ring-inset' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                      <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
                      {editingGroupId === col.group.id ? (
                        <Input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onBlur={() => handleGroupRenameSubmit(col.group)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleGroupRenameSubmit(col.group); if (e.key === 'Escape') setEditingGroupId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Nume grupă"
                          className="h-7 w-28 px-1.5 py-0.5 text-center text-xs font-semibold"
                          autoFocus
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); handleGroupRenameStart(col.group); }}
                          className="cursor-text"
                          title="Dublu-click pentru a redenumi"
                        >
                          {col.group.name}
                          {(col.group.birth_date_start || col.group.birth_year_start) && (col.group.birth_date_end || col.group.birth_year_end) && (
                            <span className="ml-1 hidden text-[10px] font-normal opacity-70 sm:inline">
                              ({col.group.birth_date_start
                                ? `${col.group.birth_date_start} – ${col.group.birth_date_end}`
                                : `${col.group.birth_year_start}–${col.group.birth_year_end}`})
                            </span>
                          )}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleAllowYounger(col.group); }}
                        aria-pressed={!!col.group.allow_younger}
                        aria-label={col.group.allow_younger ? 'Acceptă sportivi mai tineri (activ) - dezactivează' : 'Permite sportivi mai tineri să urce la categorie superioară'}
                        title={col.group.allow_younger ? 'Acceptă sportivi mai tineri (activ)' : 'Permite sportivi mai tineri'}
                        className={`inline-flex h-6 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium transition ${
                          col.group.allow_younger ? 'bg-amber-400/40 text-amber-900 hover:bg-amber-400/55 dark:text-amber-200' : 'bg-card/70 text-muted-foreground hover:bg-card'
                        }`}
                      >
                        <ArrowUp className="h-3 w-3" />
                        <span className="hidden sm:inline">{col.group.allow_younger ? 'Tineri ✓' : 'Tineri'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openCatModal(col.group.id); }}
                        aria-label={`Adaugă categorie în ${col.group.name}`}
                        title="Adaugă categorie"
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card/80 px-1.5 text-[10px] font-semibold transition hover:bg-card"
                      >
                        <Plus className="h-3 w-3" /><span className="hidden sm:inline">Categorie</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(col.group.id); }}
                        aria-label={`Șterge grupa ${col.group.name}`}
                        title="Șterge grupa"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                </React.Fragment>
              ))}

              <th className="group/insert relative w-0 border-none p-0" rowSpan={3}>
                <div className="absolute inset-y-0 -left-2 right-0 z-30 flex items-center justify-center" style={{ minWidth: '24px' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openGroupModal(columnStructure.length); }}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold opacity-0 shadow-sm transition-all hover:bg-accent group-hover/insert:opacity-100"
                    aria-label="Adaugă grupă"
                  >
                    <Plus className="h-3.5 w-3.5" /> Grupă
                  </button>
                </div>
              </th>
            </tr>

            {/* ═══ ROW 2: Gender sub-headers ═══ */}
            <tr>
              {columnStructure.map((col) =>
                col.genderSections.length === 0 ? (
                  <th key={`g-empty-${col.group.id}`} className="border border-border bg-muted px-1 py-1 text-center text-xs italic text-muted-foreground">
                    Fără categorii
                  </th>
                ) : (
                  col.genderSections.map((gs) => (
                    <th
                      key={`${col.group.id}-${gs.gender}`}
                      colSpan={gs.colSpan}
                      className={`${GENDER_BG[gs.gender] || 'bg-muted'} border border-border px-2 py-2 text-center text-sm font-bold uppercase tracking-wide`}
                    >
                      {GENDER_LABELS[gs.gender] || gs.gender}
                    </th>
                  ))
                ),
              )}
            </tr>

            {/* ═══ ROW 3: Individual category names with delete ═══ */}
            <tr>
              {allCols.length === 0 && columnStructure.length > 0 ? (
                columnStructure.map((col) => (
                  <th key={`empty-${col.group.id}`} className="min-w-[80px] border border-border bg-muted px-1 py-1 text-center text-xs italic text-muted-foreground">
                    click + sus
                  </th>
                ))
              ) : (
                allCols.map((cat) => (
                  <th
                    key={cat.id}
                    draggable
                    onDragStart={(e) => handleCatDragStart(e, cat.id)}
                    onDragOver={(e) => handleCatDragOver(e, cat.id)}
                    onDrop={(e) => handleCatDrop(e, cat.id)}
                    onDragEnd={handleDragEnd}
                    className={`group/cat min-w-[150px] cursor-grab border border-border bg-muted px-3 py-3 text-center text-sm font-semibold transition-all active:cursor-grabbing ${
                      dragType === 'category' && dragId === cat.id ? 'scale-95 opacity-40' : ''
                    } ${dragType === 'category' && dragOverId === cat.id ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}`}
                    title={`${cat.name} (${TYPE_LABELS[cat.type] || cat.type}) — trage pentru a reordona`}
                  >
                    <div className="relative whitespace-normal leading-tight">
                      {editingCatId === cat.id ? (
                        <Input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onBlur={() => handleCatRenameSubmit(cat)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCatRenameSubmit(cat); if (e.key === 'Escape') setEditingCatId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Nume categorie"
                          className="h-7 w-full px-1 py-0.5 text-center text-[11px] font-medium"
                          autoFocus
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); handleCatRenameStart(cat); }}
                          className="cursor-text"
                          title="Dublu-click pentru a redenumi"
                        >
                          {cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteCat(cat.id)}
                        disabled={busy}
                        aria-label={`Șterge categoria ${cat.name}`}
                        title="Șterge categoria"
                        className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition hover:bg-destructive/90 group-hover/cat:inline-flex"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          {/* ═══ BODY: one row per athlete, grouped by club ═══ */}
          <tbody>
            {clubRows.length === 0 ? (
              <tr>
                <td colSpan={totalColSpan} className="px-4 py-12 text-center text-sm italic text-muted-foreground">
                  {groups.length === 0
                    ? 'Treci cu mouse-ul între coloane pentru a adăuga prima grupă de vârstă.'
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

                const clubHandleCell = (rowSpan) => (
                  <td
                    className="sticky left-0 z-10 cursor-grab select-none border border-border bg-card px-4 py-3 align-top text-sm font-semibold active:cursor-grabbing"
                    rowSpan={rowSpan}
                    draggable
                    onDragStart={(e) => handleClubDragStart(e, clubId)}
                    onDragOver={(e) => handleClubDragOver(e, clubId)}
                    onDrop={(e) => handleClubDrop(e, clubId)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
                      <span className="truncate">{club}</span>
                    </div>
                  </td>
                );

                return athletes.length === 0 ? (
                  <tr
                    key={`club-${clubId}`}
                    className={`border-t-2 border-border transition-colors hover:bg-accent/40 ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub ? 'ring-2 ring-primary ring-inset' : ''}`}
                  >
                    {clubHandleCell(1)}
                    {columnStructure.map((col) => (
                      <React.Fragment key={`grp-${col.group.id}`}>
                        <td className="w-0 border-none p-0" />
                        {col.cats.length === 0 ? (
                          <td className="border border-border" />
                        ) : (
                          col.cats.map((cat) => (
                            <td
                              key={cat.id}
                              onClick={(e) => handleCellClick(clubId, cat.id, e)}
                              className={`cursor-pointer border border-border px-2 py-2 text-center transition-colors ${
                                enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id ? 'bg-primary/10 ring-2 ring-primary ring-inset' : 'hover:bg-accent/50'
                              }`}
                            >
                              <span className="mx-auto inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                                <Plus className="h-3 w-3" />
                                <span className="hidden lg:inline">{isTeamCategoryType(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv'}</span>
                                <span className="lg:hidden">Adaugă</span>
                              </span>
                            </td>
                          ))
                        )}
                      </React.Fragment>
                    ))}
                    <td className="border border-border/40" />
                  </tr>
                ) : (
                  <React.Fragment key={`club-${clubId}`}>
                    {athletes.map((ath, athIdx) => (
                      <tr
                        key={ath.id}
                        className={`${athIdx === 0 ? 'border-t-2 border-border' : ''} transition-colors hover:bg-accent/40 ${isDraggedClub ? 'opacity-40' : ''}`}
                      >
                        {athIdx === 0 && clubHandleCell(rowCount)}
                        {columnStructure.map((col) => (
                          <React.Fragment key={`grp-${col.group.id}`}>
                            <td className="w-0 border-none p-0" />
                            {col.cats.length === 0 ? (
                              <td className="border border-border" />
                            ) : (
                              col.cats.map((cat) => {
                                const enrollment = ath.enrollments[cat.id];
                                const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                                const firstAvailableRowIndex = firstAvailableAthleteRowByCategory.get(cat.id);
                                const showAddButton = !enrollment && firstAvailableRowIndex === athIdx;
                                return (
                                  <td
                                    key={cat.id}
                                    onClick={(e) => handleCellClick(clubId, cat.id, e)}
                                    className={`cursor-pointer border border-border px-2 py-2 text-center transition-colors ${
                                      isPickerOpen
                                        ? 'bg-primary/10 ring-2 ring-primary ring-inset'
                                        : enrollment ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-accent/50'
                                    }`}
                                  >
                                    {enrollment ? (
                                      <span className="flex items-center justify-between gap-2" title={ath.name}>
                                        <span className="min-w-0 truncate text-left font-medium leading-tight">{ath.name}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => handleUnenroll(enrollment.id, ath.name, cat.name, e)}
                                          disabled={busy}
                                          aria-label={`Dezînscrie ${ath.name}`}
                                          title="Scoate sportivul din categorie"
                                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </span>
                                    ) : showAddButton ? (
                                      <span className="mx-auto inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                                        <Plus className="h-3 w-3" />
                                        <span className="hidden xl:inline">{isTeamCategoryType(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv'}</span>
                                        <span className="xl:hidden">Adaugă</span>
                                      </span>
                                    ) : null}
                                  </td>
                                );
                              })
                            )}
                          </React.Fragment>
                        ))}
                        <td className="border border-border/40" />
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
              <tr className="border-t-2 border-border bg-muted">
                <td className="sticky left-0 z-10 border border-border bg-muted px-4 py-3 text-sm font-semibold">
                  Număr participanți
                </td>
                {columnStructure.map((col) => (
                  <React.Fragment key={`f-${col.group.id}`}>
                    <td className="w-0 border-none bg-muted p-0" />
                    {col.cats.length === 0 ? (
                      <td className="border border-border bg-muted" />
                    ) : (
                      col.cats.map((cat) => (
                        <td key={cat.id} className="border border-border px-2 py-3 text-center text-base font-bold">
                          {participantCount(cat)}
                        </td>
                      ))
                    )}
                  </React.Fragment>
                ))}
                <td className="border border-border/40 bg-muted" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
