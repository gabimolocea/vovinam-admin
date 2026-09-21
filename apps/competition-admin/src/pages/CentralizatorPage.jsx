import React, { useContext, useMemo, useState } from 'react';
import { ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { api } from '@shared';
import { CentralizatorContext, GENDER_BG, GENDER_LABELS, TYPE_LABELS } from './CategoriesLayout';
import { Button, Input } from '../components/ui';
import { buildFullCompetitionWorkbook, downloadWorkbook } from '../lib/fullExport';

// The shared GENDER_BG tokens are translucent (nice over a card background),
// but this table's header row is sticky - a translucent background lets
// scrolled-under body rows bleed through, so it uses its own opaque tint.
const GENDER_HEADER_BG = { male: 'bg-blue-100 dark:bg-blue-950', female: 'bg-pink-100 dark:bg-pink-950', mixt: 'bg-amber-100 dark:bg-amber-950' };

export default function CentralizatorPage() {
  const ctx = useContext(CentralizatorContext);

  // Independent, packed list per (club, category) instead of one shared row
  // axis per club across every column - an athlete enrolled in only one
  // category no longer leaves a blank row in every other column; every
  // column's entries start at row 0 regardless of what any other column
  // looks like. Also covers team enrollments, which the old shared-row
  // build (clubRows/athleteMap, athlete-only) never surfaced in the grid.
  const enrollmentsByClubAndCategory = useMemo(() => {
    const map = {};
    for (const cat of ctx?.categories || []) {
      const isTeam = cat.type === 'team' || cat.type === 'teams';
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
        map[clubId][cat.id].push({ enrollmentId: entry.id, name, isTeam });
      }
    }
    return map;
  }, [ctx?.categories]);

  const [exportingComplet, setExportingComplet] = useState(false);

  if (!ctx) return null;

  const {
    columnStructure, allCols, clubRows, countPerCat, groups, categories,
    eventId, eventData, fightWeights,
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
    handleUnenroll, handleTeamUnenroll,
    isEditLocked,
    canUnlockEdit,
    generatingDefaults,
    showStandardStructureBanner,
    handleGenerateStandardStructure,
    dismissStandardStructureBanner,
  } = ctx;

  const handleExportComplet = async () => {
    setExportingComplet(true);
    try {
      const { data } = await api.get('/matches/', { params: { event_id: eventId } });
      const matches = Array.isArray(data) ? data : (data.results || []);
      const wb = await buildFullCompetitionWorkbook({
        eventTitle: eventData?.name || eventData?.title || 'Competiție',
        groups,
        categories,
        fightWeights,
        matches,
      });
      const safeTitle = (eventData?.name || eventData?.title || 'Competitie').replace(/[\\/:*?"<>|]/g, '_').substring(0, 60);
      await downloadWorkbook(wb, `Export_complet_${safeTitle}.xlsx`);
    } catch (err) {
      console.error('Export complet failed', err);
      window.alert('Exportul complet a eșuat: ' + (err.message || 'eroare necunoscută'));
    } finally {
      setExportingComplet(false);
    }
  };

  // Total colSpan for the empty-state message
  const totalColSpan = 1
    + columnStructure.reduce((sum, col) => sum + 1 + Math.max(col.cats.length, 1), 0)
    + 1;

  const renderAddLabel = (label = 'Adaugă sportiv') => (
    <>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-primary-foreground/40 bg-primary-foreground/15 text-sm leading-none">+</span>
      <span>{label}</span>
    </>
  );

  const isTeamCategory = (type) => type === 'team' || type === 'teams';

  return (
    <div className="flex-1 overflow-auto bg-background">
      {canUnlockEdit && showStandardStructureBanner && (
        <div className="border-b-2 border-border bg-accent px-3 py-3 md:px-5 lg:px-7 xl:px-8 2xl:px-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start justify-between gap-3 md:flex-1">
              <div>
              <div className="text-sm font-black uppercase tracking-wide text-foreground">Structură standard competiție</div>
              <p className="mt-1 text-sm text-foreground/80">
                Generează doar grupele și categoriile standard care lipsesc. Elementele existente rămân neschimbate și nu se duplică.
              </p>
              </div>
              <button
                type="button"
                onClick={dismissStandardStructureBanner}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-lg font-black text-foreground/80 transition hover:bg-accent/80"
                title="Ascunde această secțiune"
                aria-label="Ascunde această secțiune"
              >
                ×
              </button>
            </div>
            <Button
              onClick={handleGenerateStandardStructure}
              disabled={busy || generatingDefaults}
              className="w-full justify-center md:w-auto"
            >
              {generatingDefaults ? 'Se generează...' : 'Generează categorii și grupe standard'}
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end border-b border-border bg-card px-3 py-2 md:px-5 lg:px-7 xl:px-8 2xl:px-10">
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportComplet}
          disabled={exportingComplet}
        >
          {exportingComplet ? 'Se exportă...' : '⬇ Export complet (Excel)'}
        </Button>
      </div>

      <div className={`space-y-4 p-3 md:hidden ${isEditLocked ? 'opacity-95' : ''}`} inert={isEditLocked ? '' : undefined}>
        {columnStructure.length === 0 ? (
          <div className="rounded-md border-2 border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground italic">
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
                <div key={cat.id} className="rounded-md border-2 border-border bg-card">
                  <div className="border-b border-border bg-accent px-3 py-2">
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-sm text-foreground">
                      <span className="font-black uppercase tracking-wide">{col.group.name}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="font-bold">{cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground ${GENDER_BG[cat.gender] || 'bg-muted'}`}>
                        {GENDER_LABELS[cat.gender] || cat.gender}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-xs font-semibold text-foreground/80">{countPerCat[cat.id] || 0} participanți</span>
                    </div>
                  </div>
                  <div className="space-y-2 p-3">
                    <Button
                      onClick={(e) => handleCellClick(null, cat.id, e)}
                      className="w-full"
                    >
                      {renderAddLabel(isTeamCategory(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv')}
                    </Button>
                    {enrolled.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic">Niciun sportiv înscris.</div>
                    ) : (
                      <div className="space-y-2">
                        {enrolled.map(enrollment => {
                          const athlete = enrollment.athlete_details;
                          const athleteName = `${athlete?.last_name || ''} ${athlete?.first_name || ''}`.trim();
                          const clubName = athlete?.club?.name || '';
                          return (
                            <div key={enrollment.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-foreground">{athleteName}</div>
                                {clubName && <div className="truncate text-xs text-muted-foreground">{clubName}</div>}
                              </div>
                              <button
                                onClick={(e) => handleUnenroll(enrollment.id, athleteName, cat.name, e)}
                                disabled={busy}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-destructive bg-destructive text-base font-black leading-none text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-40"
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

      <div className="hidden p-3 md:block lg:p-4 xl:p-5">
      <div className="overflow-auto rounded-md border-2 border-border bg-card">
      <table className={`border-collapse text-xs w-max min-w-full ${isEditLocked ? 'opacity-95' : ''}`} inert={isEditLocked ? '' : undefined}>

        {/* ═══ ROW 1: Group headers + "+" add-group column ═══ */}
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-40 min-w-[130px] border border-border bg-sidebar px-2 py-1.5 text-left text-[11px] font-black uppercase tracking-wide text-sidebar-foreground lg:min-w-[170px]"
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
                      className="opacity-0 group-hover/insert:opacity-100 inline-flex items-center gap-1 rounded-md border border-primary bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1.5 transition-all hover:bg-primary/90 whitespace-nowrap shadow-sm"
                      title="Adaugă grupă aici"
                    ><Plus className="h-3.5 w-3.5" /> Adaugă grupă</button>
                  </div>
                </th>

                {/* ── Group header ── */}
                <th colSpan={col.colSpan}
                  draggable
                  onDragStart={(e) => handleGroupDragStart(e, col.group.id)}
                  onDragOver={(e) => handleGroupDragOver(e, col.group.id)}
                  onDrop={(e) => handleGroupDrop(e, col.group.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-sidebar-accent text-sidebar-accent-foreground border border-border px-2 py-1 text-center font-bold text-xs whitespace-nowrap relative cursor-grab active:cursor-grabbing transition-all ${
                    dragType === 'group' && dragId === col.group.id ? 'opacity-40 scale-95' : ''
                  } ${dragType === 'group' && dragOverId === col.group.id ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                  <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
                    {editingGroupId === col.group.id ? (
                      <Input
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onBlur={() => handleGroupRenameSubmit(col.group)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGroupRenameSubmit(col.group); if (e.key === 'Escape') setEditingGroupId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-24 px-1.5 py-0.5 text-center text-xs font-semibold"
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
                      className={`inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium transition ${
                        col.group.allow_younger
                          ? 'bg-amber-400/40 text-amber-900 hover:bg-amber-400/55'
                          : 'bg-card/70 text-muted-foreground hover:bg-card hover:text-foreground'
                      }`}
                      title={col.group.allow_younger ? 'Acceptă vârste mai mici (activ) — click pentru a dezactiva' : 'Permite sportivi mai tineri să urce la categorie superioară'}
                    >
                      <ArrowUp className="h-3 w-3" />
                      <span className="hidden sm:inline">{col.group.allow_younger ? 'Tineri ✓' : 'Tineri'}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCatModal({ groupId: col.group.id }); setCatForm({ name: '', category_type: 'solo', gender: 'male' }); }}
                      className="inline-flex h-5 items-center gap-1 rounded-md border border-border bg-card/80 px-1.5 text-[10px] font-semibold text-foreground transition hover:bg-card"
                      title="Adaugă categorie"
                    ><Plus className="h-3 w-3" /><span className="hidden sm:inline">Categorie</span></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(col.group.id); }}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
                      title="Șterge grupa"
                    ><X className="h-3.5 w-3.5" /></button>
                  </div>
                </th>
              </React.Fragment>
            ))}

            {/* ═══ Trailing insert zone (after last group) ═══ */}
            <th className="border-none p-0 w-0 relative group/insert" rowSpan={3}>
              <div className="absolute inset-y-0 -left-2 right-0 z-30 flex items-center justify-center" style={{ minWidth: '24px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setGroupModal({ atIndex: columnStructure.length }); setGroupForm({ name: '', birth_date_start: '', birth_date_end: '', allow_younger: false }); }}
                  className="opacity-0 group-hover/insert:opacity-100 inline-flex items-center gap-1 rounded-md border border-primary bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1.5 transition-all hover:bg-primary/90 whitespace-nowrap shadow-sm"
                  title="Adaugă grupă"
                ><Plus className="h-3.5 w-3.5" /> Adaugă grupă</button>
              </div>
            </th>
          </tr>

          {/* ═══ ROW 2: Gender sub-headers ═══ */}
          <tr>
            {columnStructure.map(col =>
              col.genderSections.length === 0
                ? <th key={`g-empty-${col.group.id}`} className="bg-muted border border-border px-1 py-0.5 text-center text-[10px] text-muted-foreground italic">
                    Fără categorii
                  </th>
                : col.genderSections.map(gs => (
                    <th key={`${col.group.id}-${gs.gender}`} colSpan={gs.colSpan}
                      className={`${GENDER_HEADER_BG[gs.gender] || 'bg-muted'} border border-border px-1.5 py-1 text-center font-bold text-[11px] uppercase tracking-wide text-foreground`}>
                      {GENDER_LABELS[gs.gender] || gs.gender}
                    </th>
                  ))
            )}
          </tr>

          {/* ═══ ROW 3: Individual category names with delete ═══ */}
          <tr>
            {allCols.length === 0 && columnStructure.length > 0 ? (
              columnStructure.map(col => (
                <th key={`empty-${col.group.id}`} className="bg-muted border border-border px-1 py-0.5 text-center text-[10px] text-muted-foreground italic min-w-[70px]">
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
                  className={`bg-muted border border-border px-1.5 py-1 text-center font-semibold text-[11px] text-foreground min-w-[110px] group/cat cursor-grab active:cursor-grabbing transition-all ${
                    dragType === 'category' && dragId === cat.id ? 'opacity-40 scale-95' : ''
                  } ${dragType === 'category' && dragOverId === cat.id ? 'ring-2 ring-blue-400 ring-inset bg-blue-50' : ''}`}
                  title={`${cat.name} (${TYPE_LABELS[cat.type] || cat.type}) — trage pentru a reordona`}
                >
                  <div className="leading-tight whitespace-normal relative">
                    {editingCatId === cat.id ? (
                      <Input
                        value={editingCatName}
                        onChange={(e) => setEditingCatName(e.target.value)}
                        onBlur={() => handleCatRenameSubmit(cat)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCatRenameSubmit(cat); if (e.key === 'Escape') setEditingCatId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-full px-1 py-0.5 text-center text-[10px] font-medium"
                        autoFocus
                      />
                    ) : (
                      <span onDoubleClick={(e) => { e.stopPropagation(); handleCatRenameStart(cat); }}
                        className="cursor-text" title="Dublu-click pentru a redenumi">
                        {cat.name.replace(/ - (Masculin|Feminin|Mixt)/i, '')}
                      </span>
                    )}
                    <button onClick={() => handleDeleteCat(cat.id)} disabled={busy}
                      className="absolute -top-1.5 -right-1.5 hidden group-hover/cat:inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground transition hover:bg-destructive/90"
                      title="Șterge categoria"><X className="h-2.5 w-2.5" /></button>
                  </div>
                </th>
              ))
            )}
          </tr>
        </thead>

        {/* ═══ BODY: one pinned "add" row per club, then packed enrollment
             rows per category — no more blank rows chasing gaps between
             an athlete's own row and other columns' entries ═══ */}
        <tbody>
          {clubRows.length === 0 ? (
            <tr>
              <td colSpan={totalColSpan} className="px-4 py-10 text-center text-xs text-muted-foreground italic">
                {groups.length === 0
                  ? <><span className="text-2xl block mb-2">📋</span>Treci cu mouse-ul între coloane pentru a adăuga prima grupă de vârstă.</>
                  : allCols.length === 0
                  ? 'Apasă + pe header-ul fiecărei grupe pentru a adăuga categorii.'
                  : 'Niciun club în baza de date.'}
              </td>
            </tr>
          ) : (
            clubRows.map(({ clubId, club }) => {
              const perCat = enrollmentsByClubAndCategory[clubId] || {};
              const maxCount = allCols.reduce((max, cat) => Math.max(max, (perCat[cat.id] || []).length), 0);
              const isDraggedClub = dragType === 'club' && dragId === clubId;
              const isDragOverClub = dragType === 'club' && dragOverId === clubId;

              return (
                <React.Fragment key={`club-${clubId}`}>
                  <tr className={`border-t-2 border-border hover:bg-accent/40 transition-colors ${isDraggedClub ? 'opacity-40' : ''} ${isDragOverClub ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                    <td className="sticky left-0 z-10 bg-card border border-border px-2 py-1 align-top font-bold text-xs text-foreground cursor-grab active:cursor-grabbing select-none"
                      rowSpan={maxCount + 1}
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
                    {columnStructure.map(col => (
                      <React.Fragment key={`grp-${col.group.id}`}>
                        <td className="p-0 w-0 border-none"></td>
                        {col.cats.length === 0 ? (
                          <td className="border border-border/60 text-muted-foreground/40"></td>
                        ) : col.cats.map(cat => {
                          const isPickerOpen = enrollPickerCell?.clubId === clubId && enrollPickerCell?.catId === cat.id;
                          return (
                            <td key={cat.id}
                              className={`border border-border/60 p-0.5 text-center transition-colors ${isPickerOpen ? 'bg-green-50 ring-2 ring-green-400 ring-inset' : ''}`}
                            >
                              <button
                                type="button"
                                onClick={(e) => handleCellClick(clubId, cat.id, e)}
                                className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-1.5 py-1 text-[11px] font-medium leading-tight text-primary-foreground transition-colors hover:bg-primary/90"
                              >
                                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="hidden lg:inline truncate">{isTeamCategory(cat.type) ? 'Adaugă echipă' : 'Adaugă sportiv'}</span>
                                <span className="lg:hidden">Adaugă</span>
                              </button>
                            </td>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    <td className="border border-border/40"></td>
                  </tr>

                  {Array.from({ length: maxCount }).map((_, rowIdx) => (
                    <tr key={rowIdx} className={`hover:bg-accent/40 transition-colors ${isDraggedClub ? 'opacity-40' : ''}`}>
                      {columnStructure.map(col => (
                        <React.Fragment key={`grp-${col.group.id}`}>
                          <td className="p-0 w-0 border-none"></td>
                          {col.cats.length === 0 ? (
                            <td className="border border-border/60 text-muted-foreground/40"></td>
                          ) : col.cats.map(cat => {
                            const entry = (perCat[cat.id] || [])[rowIdx];
                            if (!entry) return <td key={cat.id} className="border border-border/60"></td>;
                            return (
                              <td key={cat.id} title={entry.name} className="border border-border/60 bg-green-50 px-1.5 py-1 text-center text-foreground">
                                <span className="flex items-center justify-between gap-1">
                                  <span className="min-w-0 truncate text-left font-medium leading-tight">{entry.name}</span>
                                  <button
                                    onClick={(e) => entry.isTeam
                                      ? handleTeamUnenroll(entry.enrollmentId, entry.name, cat.name, e)
                                      : handleUnenroll(entry.enrollmentId, entry.name, cat.name, e)}
                                    disabled={busy}
                                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-destructive bg-destructive text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-40"
                                    title={entry.isTeam ? 'Scoate echipa din categorie' : 'Scoate sportivul din categorie'}
                                  ><X className="h-3 w-3" /></button>
                                </span>
                              </td>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      <td className="border border-border/40"></td>
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
            <tr className="bg-muted border-t-2 border-border">
              <td className="sticky left-0 z-10 bg-muted border border-border px-2 py-1.5 font-bold text-xs text-foreground">
                Nr. participanți
              </td>
              {columnStructure.map(col => (
                <React.Fragment key={`f-${col.group.id}`}>
                  <td className="p-0 w-0 border-none bg-muted"></td>
                  {col.cats.length === 0 ? (
                    <td className="border border-border bg-muted"></td>
                  ) : col.cats.map(cat => (
                    <td key={cat.id} className="border border-border px-1.5 py-1.5 text-center font-bold text-xs text-foreground">
                      {countPerCat[cat.id] || 0}
                    </td>
                  ))}
                </React.Fragment>
              ))}
              <td className="border border-border/40 bg-muted"></td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>
      </div>
    </div>
  );
}
