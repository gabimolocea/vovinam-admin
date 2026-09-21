import React, { useMemo } from 'react';
import { ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { Input } from './ui';
import { GENDER_LABELS, TYPE_LABELS, isTeamCategoryType } from '../lib/centralizator';

/**
 * Desktop matrix (club × category) for the Centralizator - ported from
 * apps/competition-admin's CentralizatorPage.jsx, restyled with apps/app's
 * real component library instead of the .frvv-* brutalist skin. Rendered
 * only at lg:+ width; below that, the caller falls back to the per-category
 * card grid (CoachTehnicaView/CoachLuptaView).
 *
 * Shared between admin and coach (same ctx shape - a coach's own hook is a
 * subset of admin's, see useCoachCentralizator/useAdminCentralizator):
 * - Structure CRUD (rename/add/delete/drag-reorder groups & categories) is
 *   admin-only - `isAdminUser` (true when ctx.myClubId is null, since only
 *   admin has no club of their own) gates all of it off for a coach.
 * - A coach can only enroll/unenroll in their own club's row; every other
 *   club's cells render read-only for them.
 * - Before the coach registration deadline passes, a coach sees only their
 *   own club's row at all (and no participant-count footer) - other clubs'
 *   entries and totals stay hidden until the deadline closes, so clubs
 *   can't see each other's provisional rosters while registration is still
 *   open. Admin always sees everything.
 */
// ctx.countPerCat always counts enrolled_athletes.length regardless of
// category type (harmless in the coach hook, which never shows team
// categories' counts) - compute the real count here instead of reusing it.
const participantCount = (cat) => (isTeamCategoryType(cat.type) ? (cat.enrolled_teams?.length ?? 0) : (cat.enrolled_athletes?.length ?? 0));

// The shared GENDER_BG tokens are translucent (nice over a card background
// in the read-only coach grid), but these header rows are sticky - a
// translucent background lets scrolled-under body rows bleed through, so
// this table uses its own fully opaque tint instead.
const GENDER_HEADER_BG = { male: 'bg-blue-100 dark:bg-blue-950', female: 'bg-pink-100 dark:bg-pink-950', mixt: 'bg-amber-100 dark:bg-amber-950' };

export default function AdminCentralizatorMatrix({ ctx }) {
  const {
    columnStructure, allCols, clubs, categories, groups,
    myClubId, isCoachDeadlinePassed,
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
  } = ctx;

  const isAdminUser = myClubId == null;
  const canSeeAllClubs = isAdminUser || isCoachDeadlinePassed;
  const visibleClubs = canSeeAllClubs ? clubs : clubs.filter((c) => c.id === myClubId);

  const totalColSpan = 1 + columnStructure.reduce((sum, col) => sum + 1 + Math.max(col.cats.length, 1), 0) + 1;

  // A club's rows are otherwise a single axis shared across every category
  // column (one row per athlete), so an athlete enrolled in only one
  // category still occupies - and leaves blank - a row in every other
  // column too, scattering each column's filled cells at whatever row its
  // particular athletes landed on. Building an independent, packed list
  // per (club, category) instead means every column's entries start at
  // row 1 regardless of what any other column looks like.
  const enrollmentsByClubAndCategory = useMemo(() => {
    const map = {};
    for (const cat of categories) {
      const isTeam = isTeamCategoryType(cat.type);
      const entries = isTeam ? (cat.enrolled_teams || []) : (cat.enrolled_athletes || []);
      for (const entry of entries) {
        let clubId, name;
        if (isTeam) {
          const firstMember = entry.members?.[0];
          clubId = firstMember?.club?.id ?? 0;
          name = entry.team_name || (entry.members || []).map((m) => m.name).filter(Boolean).join(' & ') || 'Echipă';
        } else {
          const a = entry.athlete_details;
          clubId = a?.club?.id ?? 0;
          name = `${a?.last_name || ''} ${a?.first_name || ''}`.trim();
        }
        if (!map[clubId]) map[clubId] = {};
        if (!map[clubId][cat.id]) map[clubId][cat.id] = [];
        map[clubId][cat.id].push({ enrollmentId: entry.id, name, isTeam, weight: isTeam ? null : entry.weight });
      }
    }
    return map;
  }, [categories]);

  const openGroupModal = (atIndex) => {
    setGroupModal({ atIndex });
    setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false });
  };
  const openCatModal = (groupId) => {
    setCatModal({ groupId });
    setCatForm({ name: '', category_type: 'solo', gender: 'male' });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-card">
      <table className="w-max min-w-full border-collapse text-xs">
        {/* ═══ ROW 1: Group headers + "+" add-group column ═══ */}
        <thead className="sticky top-0 z-20">
            <tr>
              <th
                className="sticky left-0 z-40 min-w-[130px] border border-sidebar-border bg-sidebar px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-sidebar-foreground lg:min-w-[170px]"
                rowSpan={3}
              >
                Club
              </th>
              {columnStructure.map((col, ci) => (
                <React.Fragment key={col.group.id}>
                  {isAdminUser && (
                    <th className="group/insert relative w-0 border-none p-0" rowSpan={3}>
                      <div className="absolute inset-y-0 -left-2 -right-2 z-30 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openGroupModal(ci); }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[10px] font-bold text-primary-foreground opacity-0 shadow-sm transition-all hover:bg-primary/90 group-hover/insert:opacity-100"
                          aria-label="Adaugă grupă aici"
                        >
                          <Plus className="h-3.5 w-3.5" /> Grupă
                        </button>
                      </div>
                    </th>
                  )}

                  <th
                    colSpan={col.colSpan}
                    draggable={isAdminUser}
                    onDragStart={(e) => isAdminUser && handleGroupDragStart(e, col.group.id)}
                    onDragOver={(e) => isAdminUser && handleGroupDragOver(e, col.group.id)}
                    onDrop={(e) => isAdminUser && handleGroupDrop(e, col.group.id)}
                    onDragEnd={handleDragEnd}
                    className={`relative whitespace-nowrap border border-sidebar-border bg-sidebar-accent px-2 py-1 text-center text-xs font-bold text-sidebar-accent-foreground transition-all ${isAdminUser ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      dragType === 'group' && dragId === col.group.id ? 'scale-95 opacity-40' : ''
                    } ${dragType === 'group' && dragOverId === col.group.id ? 'ring-2 ring-primary ring-inset' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                      {isAdminUser && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />}
                      {isAdminUser && editingGroupId === col.group.id ? (
                        <Input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onBlur={() => handleGroupRenameSubmit(col.group)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleGroupRenameSubmit(col.group); if (e.key === 'Escape') setEditingGroupId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Nume grupă"
                          className="h-6 w-24 px-1.5 py-0.5 text-center text-xs font-semibold"
                          autoFocus
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { if (!isAdminUser) return; e.stopPropagation(); handleGroupRenameStart(col.group); }}
                          className={isAdminUser ? 'cursor-text' : ''}
                          title={isAdminUser ? 'Dublu-click pentru a redenumi' : undefined}
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
                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleAllowYounger(col.group); }}
                          aria-pressed={!!col.group.allow_younger}
                          aria-label={col.group.allow_younger ? 'Acceptă sportivi mai tineri (activ) - dezactivează' : 'Permite sportivi mai tineri să urce la categorie superioară'}
                          title={col.group.allow_younger ? 'Acceptă sportivi mai tineri (activ)' : 'Permite sportivi mai tineri'}
                          className={`inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium transition ${
                            col.group.allow_younger ? 'bg-amber-400/40 text-amber-900 hover:bg-amber-400/55 dark:text-amber-200' : 'bg-card/70 text-muted-foreground hover:bg-card'
                          }`}
                        >
                          <ArrowUp className="h-3 w-3" />
                          <span className="hidden sm:inline">{col.group.allow_younger ? 'Tineri ✓' : 'Tineri'}</span>
                        </button>
                      )}
                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openCatModal(col.group.id); }}
                          aria-label={`Adaugă categorie în ${col.group.name}`}
                          title="Adaugă categorie"
                          className="inline-flex h-5 items-center gap-1 rounded-md border border-sidebar-border bg-card/80 px-1.5 text-[10px] font-semibold transition hover:bg-card"
                        >
                          <Plus className="h-3 w-3" /><span className="hidden sm:inline">Categorie</span>
                        </button>
                      )}
                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(col.group.id); }}
                          aria-label={`Șterge grupa ${col.group.name}`}
                          title="Șterge grupa"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                </React.Fragment>
              ))}

              {isAdminUser && (
              <th className="group/insert relative w-0 border-none p-0" rowSpan={3}>
                <div className="absolute inset-y-0 -left-2 right-0 z-30 flex items-center justify-center" style={{ minWidth: '24px' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openGroupModal(columnStructure.length); }}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[10px] font-bold text-primary-foreground opacity-0 shadow-sm transition-all hover:bg-primary/90 group-hover/insert:opacity-100"
                    aria-label="Adaugă grupă"
                  >
                    <Plus className="h-3.5 w-3.5" /> Grupă
                  </button>
                </div>
              </th>
              )}
            </tr>

            {/* ═══ ROW 2: Gender sub-headers ═══ */}
            <tr>
              {columnStructure.map((col) =>
                col.genderSections.length === 0 ? (
                  <th key={`g-empty-${col.group.id}`} className="border border-sidebar-border bg-muted px-1 py-0.5 text-center text-[10px] italic text-muted-foreground">
                    Fără categorii
                  </th>
                ) : (
                  col.genderSections.map((gs) => (
                    <th
                      key={`${col.group.id}-${gs.gender}`}
                      colSpan={gs.colSpan}
                      className={`${GENDER_HEADER_BG[gs.gender] || 'bg-muted'} border border-sidebar-border px-1.5 py-1 text-center text-[11px] font-bold uppercase tracking-wide`}
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
                  <th key={`empty-${col.group.id}`} className="min-w-[70px] border border-sidebar-border bg-muted px-1 py-0.5 text-center text-[10px] italic text-muted-foreground">
                    click + sus
                  </th>
                ))
              ) : (
                allCols.map((cat) => (
                  <th
                    key={cat.id}
                    draggable={isAdminUser}
                    onDragStart={(e) => isAdminUser && handleCatDragStart(e, cat.id)}
                    onDragOver={(e) => isAdminUser && handleCatDragOver(e, cat.id)}
                    onDrop={(e) => isAdminUser && handleCatDrop(e, cat.id)}
                    onDragEnd={handleDragEnd}
                    className={`group/cat min-w-[130px] border border-sidebar-border bg-muted px-1.5 py-1 text-center text-[11px] font-semibold transition-all ${isAdminUser ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      dragType === 'category' && dragId === cat.id ? 'scale-95 opacity-40' : ''
                    } ${dragType === 'category' && dragOverId === cat.id ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}`}
                    title={isAdminUser ? `${cat.name} (${TYPE_LABELS[cat.type] || cat.type}) — trage pentru a reordona` : cat.name}
                  >
                    <div className="relative whitespace-normal leading-tight">
                      {isAdminUser && editingCatId === cat.id ? (
                        <Input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onBlur={() => handleCatRenameSubmit(cat)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCatRenameSubmit(cat); if (e.key === 'Escape') setEditingCatId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Nume categorie"
                          className="h-6 w-full px-1 py-0.5 text-center text-[10px] font-medium"
                          autoFocus
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { if (!isAdminUser) return; e.stopPropagation(); handleCatRenameStart(cat); }}
                          className={isAdminUser ? 'cursor-text' : ''}
                          title={isAdminUser ? 'Dublu-click pentru a redenumi' : undefined}
                        >
                          {cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}
                        </span>
                      )}
                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCat(cat.id)}
                          disabled={busy}
                          aria-label={`Șterge categoria ${cat.name}`}
                          title="Șterge categoria"
                          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition hover:bg-destructive/90 group-hover/cat:inline-flex"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          {/* ═══ BODY: one row per athlete, grouped by club ═══ */}
          <tbody>
            {visibleClubs.length === 0 ? (
              <tr>
                <td colSpan={totalColSpan} className="px-4 py-12 text-center text-xs italic text-muted-foreground">
                  {groups.length === 0
                    ? 'Treci cu mouse-ul între coloane pentru a adăuga prima grupă de vârstă.'
                    : allCols.length === 0
                      ? 'Apasă + pe header-ul fiecărei grupe pentru a adăuga categorii.'
                      : !canSeeAllClubs
                        ? 'Clubul tău nu a fost găsit.'
                        : 'Niciun club în baza de date.'}
                </td>
              </tr>
            ) : (
              visibleClubs.map((club) => {
                const clubId = club.id;
                // A coach may only enroll/unenroll in their own club's row -
                // every other club's cells render read-only for them (and,
                // before the deadline, other clubs aren't even in
                // visibleClubs at all - see canSeeAllClubs above).
                const canEditClub = isAdminUser || clubId === myClubId;
                const editDisabled = !isAdminUser && isCoachDeadlinePassed;
                const perCat = enrollmentsByClubAndCategory[clubId] || {};
                const maxCount = allCols.reduce((max, cat) => Math.max(max, perCat[cat.id]?.length || 0), 0);
                const isDraggedClub = dragType === 'club' && dragId === clubId;
                const isDragOverClub = dragType === 'club' && dragOverId === clubId;
                // Row 0 of every club is a pinned "add" row - one visible
                // button per category, always in the same place, instead
                // of an add affordance chasing the first empty slot down
                // an athlete's own row (which moved every time enrollment
                // counts changed and left gaps scattered through the block).
                const totalRows = maxCount + 1;

                const clubHandleCell = (
                  <td
                    className={`sticky left-0 z-10 select-none border border-sidebar-border bg-card px-2 py-1 align-top text-xs font-semibold ${isAdminUser ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    rowSpan={totalRows}
                    draggable={isAdminUser}
                    onDragStart={(e) => isAdminUser && handleClubDragStart(e, clubId)}
                    onDragOver={(e) => isAdminUser && handleClubDragOver(e, clubId)}
                    onDrop={(e) => isAdminUser && handleClubDrop(e, clubId)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      {isAdminUser && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />}
                      <span className="truncate">{club.name}</span>
                    </div>
                  </td>
                );

                return (
                  <React.Fragment key={`club-${clubId}`}>
                    <tr
                      className={`border-t-2 border-sidebar-border bg-muted/40 transition-colors hover:bg-accent/40 ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub ? 'ring-2 ring-primary ring-inset' : ''}`}
                    >
                      {clubHandleCell}
                      {columnStructure.map((col) => (
                        <React.Fragment key={`grp-${col.group.id}`}>
                          <td className="w-0 border-none p-0" />
                          {col.cats.length === 0 ? (
                            <td className="border border-sidebar-border" />
                          ) : (
                            col.cats.map((cat) => {
                              if (!canEditClub) return <td key={cat.id} className="border border-sidebar-border" />;
                              const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                              const label = isTeamCategoryType(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv';
                              return (
                                <td
                                  key={cat.id}
                                  className={`border border-sidebar-border p-0.5 text-center ${isPickerOpen ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}`}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => handleCellClick(clubId, cat.id, e)}
                                    disabled={editDisabled}
                                    title={label}
                                    className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-1.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                                  >
                                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{label}</span>
                                  </button>
                                </td>
                              );
                            })
                          )}
                        </React.Fragment>
                      ))}
                      <td className="border border-sidebar-border/40" />
                    </tr>

                    {Array.from({ length: maxCount }).map((_, rowIdx) => (
                      <tr key={rowIdx} className={`transition-colors hover:bg-accent/40 ${isDraggedClub ? 'opacity-40' : ''}`}>
                        {columnStructure.map((col) => (
                          <React.Fragment key={`grp-${col.group.id}`}>
                            <td className="w-0 border-none p-0" />
                            {col.cats.length === 0 ? (
                              <td className="border border-sidebar-border" />
                            ) : (
                              col.cats.map((cat) => {
                                const entry = (perCat[cat.id] || [])[rowIdx];
                                if (!entry) return <td key={cat.id} className="border border-sidebar-border" />;
                                return (
                                  <td key={cat.id} title={entry.name} className="border border-sidebar-border bg-emerald-500/10 px-1 py-0.5 text-center">
                                    <span className="flex items-center justify-between gap-1">
                                      <span className="min-w-0 truncate text-left font-medium leading-tight">{entry.name}</span>
                                      {canEditClub && (
                                        <button
                                          type="button"
                                          onClick={(e) => handleUnenroll(entry.enrollmentId, entry.name, cat.name, e, { groupName: col.group.name, weight: entry.weight, ...(entry.isTeam ? { enrollmentType: 'team' } : null) })}
                                          disabled={busy || editDisabled}
                                          aria-label={`Dezînscrie ${entry.name}`}
                                          title="Scoate din categorie"
                                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      )}
                                    </span>
                                  </td>
                                );
                              })
                            )}
                          </React.Fragment>
                        ))}
                        <td className="border border-sidebar-border/40" />
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {/* ═══ FOOTER: participant count per category - hidden from a
              coach until the deadline passes, so per-category totals
              (which reveal other clubs' registration activity even
              without names) stay hidden while registration is open. ═══ */}
          {allCols.length > 0 && canSeeAllClubs && (
            <tfoot>
              <tr className="border-t-2 border-sidebar-border bg-muted">
                <td className="sticky left-0 z-10 border border-sidebar-border bg-muted px-2 py-1 text-xs font-semibold">
                  Nr. participanți
                </td>
                {columnStructure.map((col) => (
                  <React.Fragment key={`f-${col.group.id}`}>
                    <td className="w-0 border-none bg-muted p-0" />
                    {col.cats.length === 0 ? (
                      <td className="border border-sidebar-border bg-muted" />
                    ) : (
                      col.cats.map((cat) => (
                        <td key={cat.id} className="border border-sidebar-border px-1 py-1 text-center text-xs font-bold">
                          {participantCount(cat)}
                        </td>
                      ))
                    )}
                  </React.Fragment>
                ))}
                <td className="border border-sidebar-border/40 bg-muted" />
              </tr>
            </tfoot>
          )}
      </table>
    </div>
  );
}
