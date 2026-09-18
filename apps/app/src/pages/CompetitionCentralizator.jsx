import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { competitionAPI } from '@shared/lib/api';
import {
  Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '../components/ui';
import { ArrowLeft, CalendarClock, Plus, Settings, Wand2, X } from 'lucide-react';
import useCoachCentralizator from '../hooks/useCoachCentralizator';
import useAdminCentralizator from '../hooks/useAdminCentralizator';
import AdminCentralizatorMatrix from '../components/AdminCentralizatorMatrix';
import AdminLuptaSheet from '../components/AdminLuptaSheet';
import { GroupFormModal, CategoryFormModal } from '../components/AdminStructureModals';
import { GENDER_LABELS, GENDER_BG, TYPE_LABELS, isTeamCategoryType } from '../lib/centralizator';
import { useFullBleedLayout } from '../components/Layout';

function formatGroupYears(group) {
  if (!group) return '';
  if (group.birth_year_start && group.birth_year_end) {
    return `${group.birth_year_start} - ${group.birth_year_end}`;
  }
  if (group.birth_year_start) {
    return `${group.birth_year_start}+`;
  }
  if (group.birth_year_end) {
    return `până la ${group.birth_year_end}`;
  }
  if (group.birth_date_start && group.birth_date_end) {
    return `${group.birth_date_start} - ${group.birth_date_end}`;
  }
  return '';
}

function formatGroupLabel(group) {
  if (!group) return 'Grupă';
  const years = formatGroupYears(group);
  return years ? `${group.name} (${years})` : group.name;
}

export default function CompetitionCentralizator() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  // Both hooks are always called (fixed order, per rules-of-hooks) - the
  // inactive one gets eventId=null so it never fetches or holds state.
  const coachCtx = useCoachCentralizator(isAdmin ? null : eventId);
  const adminCtx = useAdminCentralizator(isAdmin ? eventId : null);
  const ctx = isAdmin ? adminCtx : coachCtx;
  // The combined club×category "Centralizator" sheet is an admin-only
  // overview - a coach only ever gets the two work-focused sheets.
  const [activeSheet, setActiveSheet] = useState(isAdmin ? 'centralizator' : 'tehnica');
  const [luptaStage, setLuptaStage] = useState('etapa1');
  /* The Lupta "Etapa 1" list is a wide table that needs its own bounded 2D
   * (horizontal + vertical) scroll region with a sticky <thead> at every
   * width - see the comment on useFullBleedLayout. The club×category
   * matrix has the same problem on a phone, but unlike that flat table it
   * has a per-category-card alternative already built for Tehnica/Lupta -
   * so below `lg` the Centralizator sheet swaps to those instead of the
   * matrix (see AdminCentralizatorSheets), and like Tehnica/Lupta "Etapa
   * 2" it lets the whole page scroll rather than needing its own bounded
   * scroll region. */
  const isBoundedSheet = activeSheet === 'lupta' && luptaStage === 'etapa1';
  // The matrix is wide and data-dense - give it the full viewport and its
  // own internal scroll area instead of the app's usual centered reading
  // column. Coach gets the exact same full-bleed Centralizator/Tehnica/
  // Lupta layout as admin now, just with coach-scoped capabilities.
  useFullBleedLayout(true, isBoundedSheet);
  const [teamSelection, setTeamSelection] = useState([]);
  const [fightWeights, setFightWeights] = useState({});

  const activeEnrollCategory = ctx.categories.find((cat) => cat.id === ctx.enrollPickerCell?.catId) || null;
  const activeClubId = ctx.enrollPickerCell?.clubId;

  React.useEffect(() => {
    setTeamSelection([]);
    setFightWeights({});
  }, [ctx.enrollPickerCell?.catId, ctx.enrollPickerCell?.clubId]);

  // Only the very first load has no data to show yet - every later
  // fetchAll() (after an enroll/rename/reassign/etc.) also flips loading
  // true, and swapping the whole tree for a skeleton on every one of those
  // was unmounting page-local UI state (the active Centralizator/Tehnica/
  // Lupta sheet, in-progress edits in AdminLuptaSheet's rows) on every
  // single mutation.
  if (ctx.loading && !ctx.eventData) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ═══ TABLE ═══ */}
      <CentralizatorTable
        ctx={ctx}
        onBack={() => navigate('/competitions')}
        activeSheet={activeSheet}
        setActiveSheet={setActiveSheet}
        luptaStage={luptaStage}
        setLuptaStage={setLuptaStage}
        isBoundedSheet={isBoundedSheet}
      />

      {/* ═══ CONFIRM MODAL ═══ */}
      {ctx.confirmModal && (
        <CoachModal
          onClose={() => ctx.setConfirmModal(null)}
          title={ctx.confirmModal.title}
          description={ctx.confirmModal.message}
          footer={(
            <>
              <Button variant="outline" onClick={() => ctx.setConfirmModal(null)}>
                Anulează
              </Button>
              <Button
                onClick={ctx.confirmModal.onConfirm}
                disabled={ctx.busy}
                variant={ctx.confirmModal.color === 'orange' ? 'default' : 'destructive'}
              >
                {ctx.confirmModal.confirmLabel || 'Confirmă'}
              </Button>
            </>
          )}
        />
      )}

      {/* ═══ WEIGHT MODAL (fight categories) ═══ */}
      {ctx.weightModal && (
        <CoachModal
          onClose={() => ctx.setWeightModal(null)}
          title="Greutate sportiv"
          description={ctx.weightModal.athleteName}
          footer={(
            <>
              <Button variant="outline" onClick={() => ctx.setWeightModal(null)}>
                Anulează
              </Button>
              <Button onClick={ctx.handleWeightSubmit} disabled={ctx.busy}>
                Înscrie
              </Button>
            </>
          )}
        >
          <div className="flex items-center gap-3">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="200"
              value={ctx.weightValue}
              onChange={(e) => ctx.setWeightValue(e.target.value)}
              placeholder="ex: 65.5"
              className="flex-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') ctx.handleWeightSubmit(); }}
            />
            <span className="inline-flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-muted-foreground">kg</span>
          </div>
        </CoachModal>
      )}

      {/* ═══ ENROLLMENT MODAL ═══ */}
      {ctx.enrollPickerCell && (() => {
        const { clubId, catId } = ctx.enrollPickerCell;
        const clubName = ctx.clubs.find(c => c.id === clubId)?.name || '—';
        const cat = activeEnrollCategory;
        const catName = cat?.name || '—';
        const isTeamCategory = isTeamCategoryType(cat?.type);
        const isFightCat = cat?.type === 'fight' || cat?.category_type === 'fight';
        const allClubAthletes = ctx.clubAthleteCache[clubId] || [];
        const isLoading = !ctx.clubAthleteCache[clubId];
        const enrolledTeams = Array.isArray(cat?.enrolled_teams) ? cat.enrolled_teams : [];
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
        const selectedAthletes = athleteList.filter((ath) => teamSelection.includes(ath.id));
        const selectedSignature = [...teamSelection].sort((a, b) => a - b).join('-');
        const duplicateTeam = enrolledTeams.find((team) => {
          const memberSignature = (team.members || []).map((member) => member.id).sort((a, b) => a - b).join('-');
          return memberSignature && memberSignature === selectedSignature;
        });
        const canSaveTeam = isTeamCategory && teamSelection.length >= 2 && !duplicateTeam && !ctx.busy && !ctx.teamBuilderBusy;
        const canEnrollFightAthlete = (athleteId) => {
          const rawWeight = fightWeights[athleteId];
          if (rawWeight == null || rawWeight === '') return false;
          const parsed = Number(rawWeight);
          return Number.isFinite(parsed) && parsed > 0;
        };

        // Admin opening the picker from a per-category card (Tehnica/Lupta
        // sheets) has no club context yet - unlike a matrix cell, which is
        // already scoped to one club's row. Show a club-picker step first;
        // choosing one re-opens this same picker scoped to that club.
        if (clubId == null) {
          return (
            <CoachModal
              onClose={() => ctx.setEnrollPickerCell(null)}
              title="Alege un club"
              description="Selectează clubul din care înscrii sportivul."
              panelRef={ctx.enrollPickerRef}
              headerExtra={(
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline">{formatGroupLabel(ctx.groups.find((group) => group.id === cat?.group))}</Badge>
                  <Badge variant="outline">{catName}</Badge>
                  <Badge variant="outline">{TYPE_LABELS[cat?.type] || cat?.category_type || 'Categorie'}</Badge>
                </div>
              )}
              footer={(
                <Button variant="outline" onClick={() => ctx.setEnrollPickerCell(null)}>
                  Închide
                </Button>
              )}
            >
              <div className="divide-y divide-border rounded-md border border-border">
                {ctx.clubs.length === 0 ? (
                  <div className="p-6 text-center text-sm italic text-muted-foreground">Niciun club în baza de date.</div>
                ) : (
                  ctx.clubs.map((club) => (
                    <button
                      key={club.id}
                      type="button"
                      onClick={(e) => ctx.handleCellClick(club.id, catId, e)}
                      className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-accent"
                    >
                      {club.name}
                    </button>
                  ))
                )}
              </div>
            </CoachModal>
          );
        }

        return (
          <CoachModal
            onClose={() => ctx.setEnrollPickerCell(null)}
            title={clubName}
            description={isFightCat ? 'Selectează sportivii și completează greutatea.' : 'Selectează sportivii eligibili.'}
            panelRef={ctx.enrollPickerRef}
            headerExtra={(
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="outline">{formatGroupLabel(ctx.groups.find((group) => group.id === cat?.group))}</Badge>
                <Badge variant="outline">{catName}</Badge>
                <Badge variant="outline">{TYPE_LABELS[cat?.type] || cat?.category_type || 'Categorie'}</Badge>
                {isTeamCategory && <Badge variant="outline">Construire echipă</Badge>}
              </div>
            )}
            footer={(
              <>
                <Button variant="outline" onClick={() => ctx.setEnrollPickerCell(null)}>
                  Închide
                </Button>
                {isTeamCategory && (
                  <Button
                    type="button"
                    onClick={() => ctx.createTeamEnrollment(catId, teamSelection)}
                    disabled={!canSaveTeam}
                  >
                    {ctx.teamBuilderBusy ? 'Se înrolează...' : 'Înrolează echipa'}
                  </Button>
                )}
              </>
            )}
          >
            <div className="space-y-4">
              {hasDateRange && (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                </div>
              )}
              <div className="max-h-[52vh] overflow-y-auto rounded-md border border-border">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Se încarcă…</div>
              ) : athleteList.length === 0 ? (
                <div className="p-6 text-center text-sm italic text-muted-foreground">
                  {hasDateRange
                    ? `Niciun sportiv din ${isAdmin ? 'acest club' : 'clubul tău'} nu se încadrează în intervalul de vârstă (${outOfRangeCount} exclu${outOfRangeCount === 1 ? 's' : 'și'}).`
                    : `Niciun sportiv în ${isAdmin ? 'acest club' : 'clubul tău'}.`}
                </div>
              ) : (
                athleteList.map(ath => {
                  const isEnrolled = enrolledIds.has(ath.id);
                  const isSelected = teamSelection.includes(ath.id);
                  const dob = ath.date_of_birth;
                  const fightWeight = fightWeights[ath.id] ?? '';

                  if (isFightCat && !isTeamCategory) {
                    return (
                      <div
                        key={ath.id}
                        className={`grid gap-3 border-b border-border px-4 py-3 md:grid-cols-[minmax(0,1fr)_140px_120px] md:items-center ${isEnrolled ? 'bg-emerald-500/10' : 'hover:bg-accent'}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{ath.last_name} {ath.first_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{ath.club?.name || 'Fără club'}{dob ? ` · ${dob}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="200"
                            step="0.1"
                            value={fightWeight}
                            onChange={(e) => setFightWeights((prev) => ({ ...prev, [ath.id]: e.target.value }))}
                            placeholder="Greutate"
                            className="w-full"
                            disabled={ctx.busy || isEnrolled}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isEnrolled && canEnrollFightAthlete(ath.id)) {
                                ctx.handleToggleEnroll(ath.id, catId, fightWeight);
                              }
                            }}
                          />
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">kg</span>
                        </div>
                        <div className="flex items-center justify-end">
                          {isEnrolled ? (
                            <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                              Înscris
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => ctx.handleToggleEnroll(ath.id, catId, fightWeight)}
                              disabled={ctx.busy || !canEnrollFightAthlete(ath.id)}
                            >
                              Adaugă
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button key={ath.id}
                      onClick={() => {
                        if (isTeamCategory) {
                          setTeamSelection((prev) => prev.includes(ath.id) ? prev.filter((id) => id !== ath.id) : [...prev, ath.id]);
                          return;
                        }
                        ctx.handleToggleEnroll(ath.id, catId);
                      }}
                      disabled={ctx.busy || ctx.teamBuilderBusy}
                      className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                        isTeamCategory
                          ? isSelected ? 'bg-blue-500/10 hover:bg-blue-500/15' : 'hover:bg-accent'
                          : isEnrolled ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-accent'
                      }`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded border text-sm font-bold ${
                        isTeamCategory
                          ? isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-input text-transparent'
                          : isEnrolled ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-input text-transparent'
                      }`}>✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{ath.last_name} {ath.first_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{ath.club?.name || 'Fără club'}{dob ? ` · ${dob}` : ''}</span>
                      </span>
                    </button>
                  );
                })
              )}
              </div>
              {outOfRangeCount > 0 && (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {outOfRangeCount} sportiv{outOfRangeCount === 1 ? '' : 'i'} din club nu se încadrează în vârstă
                </div>
              )}
              {isTeamCategory && (
                <div className="rounded-md border border-border bg-blue-500/10 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Echipă selectată</div>
                  <div className="mt-1 text-sm">
                    {selectedAthletes.length > 0
                      ? selectedAthletes.map((ath) => `${ath.first_name} ${ath.last_name}`).join(' & ')
                      : 'Selectează minimum 2 sportivi.'}
                  </div>
                  {duplicateTeam && (
                    <div className="mt-2 text-xs font-semibold text-destructive">
                      Echipa este deja înscrisă în această categorie.
                    </div>
                  )}
                </div>
              )}
            </div>
          </CoachModal>
        );
      })()}
    </div>
  );
}

function CoachModal({ onClose, title, description, headerExtra = null, footer = null, panelRef = null, children = null }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent fullScreen ref={panelRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          {headerExtra}
        </DialogHeader>
        {children ? <div className="flex-1 overflow-y-auto">{children}</div> : null}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}


/* ═══════════════════════════════════════════════════════
   CENTRALIZATOR TABLE — same layout for admin and coach (the
   Centralizator/Tehnica/Lupta sheets, full-bleed, matrix-on-desktop/
   cards-on-mobile); only the capabilities differ, gated by `isAdmin`
   below and by `ctx.myClubId` inside AdminCentralizatorMatrix/
   AdminLuptaSheet (structural group/category editing, and editing
   another club's row, are admin-only).
   ═══════════════════════════════════════════════════════ */
function CentralizatorTable({ ctx, onBack, activeSheet, setActiveSheet, luptaStage, setLuptaStage, isBoundedSheet }) {
  const { isAdmin } = useAuth();

  // pt-2 only, no pb-2: the sheet tab bar at the bottom (see
  // AdminCentralizatorSheets) is meant to sit flush against the true
  // bottom edge - its own padding/safe-area handles clearance there.
  return (
    <div className={`flex flex-1 flex-col pt-2 ${isBoundedSheet ? 'h-full min-h-0 overflow-hidden' : 'lg:h-full lg:min-h-0 lg:overflow-hidden'}`}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 pb-2 lg:border-b-0 lg:pb-0">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack} aria-label="Înapoi la competiții" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold">{ctx.eventData?.name || 'Centralizator competiție'}</h1>
            <p className="truncate text-xs font-medium text-destructive">
              Termen limită de înscrieri: {ctx.coachDeadlineDateStr || ctx.eventDateStr || '—'}
              {ctx.isCoachDeadlinePassed && ' — expirat'}
            </p>
          </div>
        </div>
        {/* Structure generation and the deadline setting are competition-
            wide, admin-only actions - a coach never sees this menu. */}
        {isAdmin && <CentralizatorSettingsMenu ctx={ctx} />}
      </div>

      <div className={isBoundedSheet ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col lg:min-h-0'}>
        <AdminCentralizatorSheets
          ctx={ctx}
          activeSheet={activeSheet}
          setActiveSheet={setActiveSheet}
          luptaStage={luptaStage}
          setLuptaStage={setLuptaStage}
          isBoundedSheet={isBoundedSheet}
        />
        {isAdmin && <GroupFormModal ctx={ctx} />}
        {isAdmin && <CategoryFormModal ctx={ctx} />}
      </div>
    </div>
  );
}

const CENTRALIZATOR_SHEETS = [
  { key: 'centralizator', label: 'Centralizator' },
  { key: 'tehnica', label: 'Tehnica' },
  { key: 'lupta', label: 'Lupta' },
];

/** Shared by admin and coach: the matrix split into three "sheets" (like
 * tabs at the bottom of an Excel workbook) instead of one giant table
 * mixing solo, team and fight categories together: Centralizator
 * (everything, the full club × category matrix), Tehnica (the same
 * matrix filtered to solo/team only), and Lupta (a flat Etapa 1
 * pre-registration list of fight enrollees instead of a club grid,
 * matching competition-admin's own LuptaPage - weight-in and weight-
 * bracket category assignment don't fit a club × category matrix shape
 * the way solo/team enrollment does). Coach-vs-admin capabilities are
 * gated inside AdminCentralizatorMatrix/AdminLuptaSheet themselves. */
function AdminCentralizatorSheets({ ctx, activeSheet, setActiveSheet, luptaStage, setLuptaStage, isBoundedSheet }) {
  const { isAdmin } = useAuth();
  const wrapClass = isBoundedSheet ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col lg:min-h-0';
  // The combined club×category matrix is an admin-only overview - a coach
  // only ever gets the two work-focused sheets, both as the tab and as
  // the actual rendered content (defense in depth alongside the default
  // activeSheet state in CompetitionCentralizator).
  const sheets = isAdmin ? CENTRALIZATOR_SHEETS : CENTRALIZATOR_SHEETS.filter((s) => s.key !== 'centralizator');

  return (
    <div className={wrapClass}>
      <div className={wrapClass}>
        {isAdmin && activeSheet === 'centralizator' && (
          <>
            {/* Desktop: the full club×category matrix, with its own
                bounded 2D scroll and structural editing (rename, add/
                delete, drag-reorder groups/categories). */}
            <div className="hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <AdminCentralizatorMatrix ctx={ctx} />
            </div>
            {/* Mobile/tablet: the matrix needs horizontal scroll to be
                usable, so swap it for the same per-category cards as the
                Tehnica/Lupta sheets instead (solo/team, then fight) -
                enroll/unenroll still works there; structural group/
                category editing stays desktop-only. */}
            <div className="flex-1 bg-card p-2 lg:hidden">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Tehnica</div>
              <CoachTehnicaView ctx={ctx} canRemove canAdd compact />
              <div className="my-4 border-t-2 border-sidebar-border" />
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Luptă</div>
              <CoachLuptaView ctx={ctx} canRemove canAdd compact />
            </div>
          </>
        )}
        {activeSheet === 'tehnica' && (
          <div className="flex-1 bg-card p-2 lg:min-h-0 lg:overflow-auto">
            <CoachTehnicaView ctx={ctx} canRemove canAdd compact />
          </div>
        )}
        {activeSheet === 'lupta' && <AdminLuptaSheetGroup ctx={ctx} stage={luptaStage} setStage={setLuptaStage} />}
      </div>
      {/* `sticky bottom-0` keeps this reachable without scrolling all the
          way down on the unbounded (page-scrolls) sheets, where it's the
          replacement for Sidebar's own hidden mobile bottom nav - a no-op
          on the bounded sheets, whose own container never scrolls past it
          anyway. */}
      <div
        className="sticky bottom-0 z-20 flex shrink-0 gap-1 border-t-2 border-sidebar-border bg-sidebar px-1 pt-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {sheets.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSheet(key)}
            aria-current={activeSheet === key ? 'true' : undefined}
            className={`rounded-t-md border-2 border-b-0 border-sidebar-border px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              activeSheet === key ? 'bg-amber-300 text-sidebar' : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const LUPTA_STAGES = [
  { key: 'etapa1', label: 'Etapa 1 - Pre-înscriere' },
  { key: 'etapa2', label: 'Etapa 2 - Categorii' },
];

/** The Lupta sheet itself has two stages, matching competition-admin's own
 * LuptaPage: Etapa 1 is the flat pre-registration list (submit weight, see
 * the bracket it suggests, reassign) - AdminLuptaSheet. Etapa 2 is the
 * same per-category card grid as the Tehnica sheet, just for fight
 * categories instead of solo/team, so admin can review who ended up in
 * which weight bracket the same way they review Tehnica's probe. */
function AdminLuptaSheetGroup({ ctx, stage, setStage }) {
  const bounded = stage === 'etapa1';

  return (
    <div className={bounded ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col lg:min-h-0'}>
      <div className="flex shrink-0 items-center gap-1 border-b border-sidebar-border bg-muted px-2 py-1">
        {LUPTA_STAGES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStage(key)}
            aria-pressed={stage === key}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              stage === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {stage === 'etapa1' ? (
        <AdminLuptaSheet ctx={ctx} />
      ) : (
        <div className="flex-1 bg-card p-2 lg:min-h-0 lg:overflow-auto">
          <CoachLuptaView ctx={ctx} canRemove canAdd compact />
        </div>
      )}
    </div>
  );
}

/** Admin-only toolbar menu (gear icon, top-right of the Centralizator
 * page): structure generation and the coach registration deadline both
 * used to live in an always-visible banner above the matrix - moved here
 * so the page starts with just the matrix instead of a permanent alert. */
function CentralizatorSettingsMenu({ ctx }) {
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);

  const openDeadlineModal = () => {
    const raw = ctx.eventData?.coach_registration_deadline;
    setDeadlineValue(raw ? raw.slice(0, 10) : '');
    setDeadlineOpen(true);
  };

  const saveDeadline = async (e) => {
    e.preventDefault();
    if (!ctx.eventData?.id) return;
    setSavingDeadline(true);
    try {
      await competitionAPI.update(ctx.eventData.id, { coach_registration_deadline: deadlineValue || null });
      await ctx.fetchAll();
      setDeadlineOpen(false);
    } finally {
      setSavingDeadline(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Setări centralizator">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={ctx.handleGenerateStandardStructure} disabled={ctx.busy || ctx.generatingDefaults}>
            <Wand2 className="h-4 w-4" />
            {ctx.generatingDefaults ? 'Se generează…' : 'Generează categorii și grupe standard'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openDeadlineModal}>
            <CalendarClock className="h-4 w-4" />
            Modifică termen limită de înscrieri
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deadlineOpen} onOpenChange={setDeadlineOpen}>
        <DialogContent>
          <form onSubmit={saveDeadline}>
            <DialogHeader>
              <DialogTitle>Termen limită de înscrieri</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label htmlFor="coach-deadline-date">Data limită</Label>
              <Input
                id="coach-deadline-date"
                type="date"
                value={deadlineValue}
                onChange={(e) => setDeadlineValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Lasă gol pentru a folosi data de start a competiției.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeadlineOpen(false)}>Anulează</Button>
              <Button type="submit" disabled={savingDeadline}>{savingDeadline ? 'Se salvează…' : 'Salvează'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Shows the coach's own club (myClubId set, filtered, editable) or, for
 * an admin (myClubId null - see useCoachCentralizator), every club's
 * enrollments read-only, with the club name shown per entry so the
 * multi-club list stays legible - so an admin can eyeball the full
 * pre-competition centralizator without leaving this panel for the
 * LAN-oriented competition-admin app. */
function CoachTehnicaView({ ctx, canRemove, canAdd, compact }) {
  const { isAdmin } = useAuth();
  const { columnStructure, myClubId, handleCellClick, handleUnenroll, busy } = ctx;
  const readOnly = myClubId == null;
  // A coach can always add/remove their own club's enrollments (readOnly
  // is always false for them); admin's own per-category "sheet" wants the
  // same capability across every club too (adding opens a club-picker
  // step first, since a card has no club context of its own - see the
  // enrollment modal in CompetitionCentralizator.jsx), while the narrow-
  // width fallback (this same component, reused below md: for admin)
  // stays read-only unless the caller explicitly opts in.
  const showRemove = canRemove ?? !readOnly;
  const showAdd = canAdd ?? !readOnly;
  // The compact admin sheet packs many small card-tables edge to edge - a
  // darker border (matching the matrix/Lupta-Etapa1 tables) and a wider
  // grid gap separate them from each other more clearly than the coach
  // dashboard's own lighter, more spaced-out styling needs.
  const borderColor = compact ? 'border-sidebar-border' : 'border-border';

  const [groupFilter, setGroupFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');

  const techGroups = useMemo(() => {
    const seen = new Set();
    return columnStructure
      .map((col) => ({
        group: col.group,
        cats: col.cats.filter((cat) => {
          if (seen.has(cat.id)) return false;
          if (cat.type !== 'solo' && !isTeamCategoryType(cat.type)) return false;
          seen.add(cat.id);
          return true;
        }),
      }))
      .filter((item) => item.cats.length > 0);
  }, [columnStructure]);

  const catNameOptions = useMemo(
    () => [...new Set(techGroups.flatMap((tg) => tg.cats.map((c) => c.name)))].sort(),
    [techGroups],
  );
  const genderOptions = useMemo(
    () => [...new Set(techGroups.flatMap((tg) => tg.cats.map((c) => c.gender)))],
    [techGroups],
  );

  const filteredTechGroups = useMemo(() => {
    return techGroups
      .filter((tg) => groupFilter === 'all' || String(tg.group.id) === groupFilter)
      .map((tg) => ({
        group: tg.group,
        cats: tg.cats.filter((c) => (catFilter === 'all' || c.name === catFilter) && (genderFilter === 'all' || c.gender === genderFilter)),
      }))
      .filter((tg) => tg.cats.length > 0);
  }, [techGroups, groupFilter, catFilter, genderFilter]);

  if (techGroups.length === 0) {
    return <div className="py-16 text-center text-sm italic text-muted-foreground">Nu există categorii de tehnică.</div>;
  }

  const selectTriggerClass = compact ? 'h-7 w-36 text-xs' : 'h-9 w-44';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-6'}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger aria-label="Filtrează după grupă" className={selectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Grupă</SelectItem>
            {techGroups.map(({ group }) => (
              <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger aria-label="Filtrează după categorie" className={selectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Categorie</SelectItem>
            {catNameOptions.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger aria-label="Filtrează după gen" className={selectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Gen</SelectItem>
            {genderOptions.map((gender) => (
              <SelectItem key={gender} value={gender}>{GENDER_LABELS[gender] || gender}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(groupFilter !== 'all' || catFilter !== 'all' || genderFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setGroupFilter('all'); setCatFilter('all'); setGenderFilter('all'); }}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Resetează filtrele
          </button>
        )}
      </div>
      {filteredTechGroups.length === 0 ? (
        <div className="py-16 text-center text-sm italic text-muted-foreground">Niciun rezultat pentru filtrele alese.</div>
      ) : (
      filteredTechGroups.map(({ group, cats }) => (
        <div key={`tech-${group.id}`} className={compact ? 'flex flex-col gap-0 lg:grid lg:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'flex flex-col gap-0 lg:grid lg:gap-4 lg:grid-cols-2 xl:grid-cols-3'}>
          {cats.map((cat) => {
            const isTeamCategory = isTeamCategoryType(cat.type);
            const enrolled = isTeamCategory
              ? (cat.enrolled_teams || [])
                  .filter((item) => readOnly || (item.members || []).some((member) => (member.club?.id || member.club) === myClubId))
                  .slice()
                  .sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''))
              : (cat.enrolled_athletes || [])
                  .filter((item) => readOnly || (item.athlete_details?.club?.id || item.athlete_details?.club) === myClubId)
                  .slice()
                  .sort((a, b) => {
                    const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                    const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                    return na.localeCompare(nb);
                  });

            return (
              <div key={cat.id} className={`border ${borderColor} bg-card lg:overflow-hidden ${compact ? '' : 'lg:rounded-lg'}`}>
                <div className="sticky top-0 z-10 bg-card">
                  <div className={`border-b ${borderColor} bg-muted font-semibold ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}>
                    {formatGroupLabel(group)}
                  </div>
                  <div className={`flex items-center justify-between gap-2 border-b ${borderColor} font-semibold uppercase tracking-wide ${GENDER_BG[cat.gender] || 'bg-muted'} ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-xs'}`}>
                    <span className="truncate">{cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}</span>
                    <span className="shrink-0 font-bold" title="Nr. participanți">{enrolled.length}</span>
                  </div>
                </div>
                {showAdd && (
                  <div className={`border-b ${borderColor} ${compact ? 'p-1.5' : 'p-3'}`}>
                    <Button
                      size={compact ? 'sm' : 'default'}
                      onClick={(e) => handleCellClick(myClubId, cat.id, e)}
                      disabled={ctx.isCoachDeadlinePassed && !isAdmin}
                      className={`w-full ${compact ? 'text-xs' : ''}`}
                    >
                      <Plus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                      {isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}
                    </Button>
                  </div>
                )}
                <div className={`divide-y ${compact ? 'divide-sidebar-border' : 'divide-border'}`}>
                  {enrolled.length === 0 ? (
                    <div className={`italic text-muted-foreground ${compact ? 'px-2 py-2 text-xs' : 'px-3 py-4 text-sm'}`}>{isTeamCategory ? 'Nicio echipă înscrisă.' : 'Niciun sportiv înscris.'}</div>
                  ) : enrolled.map((entry) => {
                    const athleteName = `${entry.athlete_details?.last_name || ''} ${entry.athlete_details?.first_name || ''}`.trim();
                    const teamMembers = (entry.members || []).map((member) => member.name).filter(Boolean).join(' & ');
                    const teamLabel = entry.team_name || teamMembers || 'Echipă';
                    return (
                      <div key={entry.id} className={`flex items-center justify-between gap-2 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {isTeamCategory ? teamLabel : athleteName}
                            {readOnly && !isTeamCategory && entry.athlete_details?.club?.name && (
                              <span className="font-normal text-muted-foreground"> ({entry.athlete_details.club.name})</span>
                            )}
                          </div>
                          {isTeamCategory && teamMembers && teamMembers !== teamLabel && (
                            <div className="truncate text-xs text-muted-foreground">{teamMembers}</div>
                          )}
                          {isTeamCategory && entry.club_name && <div className="truncate text-xs text-muted-foreground">{entry.club_name}</div>}
                        </div>
                        {showRemove && (
                          <button
                            type="button"
                            onClick={(e) => handleUnenroll(entry.id, isTeamCategory ? teamLabel : athleteName, cat.name, e, { groupName: formatGroupLabel(group), ...(isTeamCategory ? { enrollmentType: 'team' } : null) })}
                            disabled={busy || (ctx.isCoachDeadlinePassed && !isAdmin)}
                            aria-label={`Dezînscrie ${isTeamCategory ? teamLabel : athleteName}`}
                            className={`inline-flex shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40 ${compact ? 'h-6 w-6' : 'h-8 w-8 text-xs'}`}
                          >
                            <X className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))
      )}
    </div>
  );
}

function CoachLuptaView({ ctx, canRemove, canAdd, compact }) {
  const { isAdmin } = useAuth();
  const { columnStructure, myClubId, handleCellClick, handleUnenroll, busy } = ctx;
  const readOnly = myClubId == null;
  const showRemove = canRemove ?? !readOnly;
  const showAdd = canAdd ?? !readOnly;
  const borderColor = compact ? 'border-sidebar-border' : 'border-border';

  const [groupFilter, setGroupFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');

  const fightGroups = useMemo(() => {
    const seen = new Set();
    return columnStructure
      .map((col) => ({
        group: col.group,
        cats: col.cats.filter((cat) => {
          if (seen.has(cat.id)) return false;
          if (cat.type !== 'fight') return false;
          seen.add(cat.id);
          return true;
        }),
      }))
      .filter((item) => item.cats.length > 0);
  }, [columnStructure]);

  const catNameOptions = useMemo(
    () => [...new Set(fightGroups.flatMap((fg) => fg.cats.map((c) => c.name)))].sort(),
    [fightGroups],
  );
  const genderOptions = useMemo(
    () => [...new Set(fightGroups.flatMap((fg) => fg.cats.map((c) => c.gender)))],
    [fightGroups],
  );

  const filteredGroups = useMemo(() => {
    return fightGroups
      .filter((fg) => groupFilter === 'all' || String(fg.group.id) === groupFilter)
      .map((fg) => ({
        group: fg.group,
        cats: fg.cats.filter((c) => (catFilter === 'all' || c.name === catFilter) && (genderFilter === 'all' || c.gender === genderFilter)),
      }))
      .filter((fg) => fg.cats.length > 0);
  }, [fightGroups, groupFilter, catFilter, genderFilter]);

  if (fightGroups.length === 0) {
    return <div className="py-16 text-center text-sm italic text-muted-foreground">Nu există categorii de luptă.</div>;
  }

  const selectTriggerClass = compact ? 'h-7 w-36 text-xs' : 'h-9 w-44';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-6'}>
      <div className="flex flex-wrap items-center gap-2">
        {/* A coach's own fight roster is small and every entry is already
            theirs - grouping/gender is now assigned automatically on add
            (see handleAddFightAthlete), so filtering by them is only
            useful for admin reviewing the full cross-club sheet. */}
        {readOnly && (
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger aria-label="Filtrează după grupă" className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Grupă</SelectItem>
              {fightGroups.map(({ group }) => (
                <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger aria-label="Filtrează după categorie" className={selectTriggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Categorie</SelectItem>
            {catNameOptions.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {readOnly && (
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger aria-label="Filtrează după gen" className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Gen</SelectItem>
              {genderOptions.map((gender) => (
                <SelectItem key={gender} value={gender}>{GENDER_LABELS[gender] || gender}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(groupFilter !== 'all' || catFilter !== 'all' || genderFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setGroupFilter('all'); setCatFilter('all'); setGenderFilter('all'); }}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Resetează filtrele
          </button>
        )}
      </div>
      {filteredGroups.length === 0 ? (
        <div className="py-16 text-center text-sm italic text-muted-foreground">Niciun rezultat pentru filtrele alese.</div>
      ) : (
      filteredGroups.map(({ group, cats }) => (
        <div key={`fight-${group.id}`} className={compact ? 'flex flex-col gap-0 lg:grid lg:gap-4 lg:grid-cols-3 xl:grid-cols-4' : 'flex flex-col gap-0 lg:grid lg:gap-4 lg:grid-cols-2'}>
          {cats.map((cat) => {
            const enrolled = (cat.enrolled_athletes || [])
              .filter((item) => readOnly || (item.athlete_details?.club?.id || item.athlete_details?.club) === myClubId)
              .slice()
              .sort((a, b) => {
                const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                return na.localeCompare(nb);
              });

            return (
              <div key={cat.id} className={`border ${borderColor} bg-card lg:overflow-hidden ${compact ? '' : 'lg:rounded-lg'}`}>
                <div className="sticky top-0 z-10 bg-card">
                  <div className={`border-b ${borderColor} bg-muted font-semibold ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}>
                    {formatGroupLabel(group)}
                  </div>
                  <div className={`flex items-center justify-between gap-2 border-b ${borderColor} font-semibold uppercase tracking-wide ${GENDER_BG[cat.gender] || 'bg-muted'} ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-xs'}`}>
                    <span className="truncate">{cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}</span>
                    <span className="shrink-0 font-bold" title="Nr. participanți">{enrolled.length}</span>
                  </div>
                </div>
                {showAdd && (
                  <div className={`border-b ${borderColor} ${compact ? 'p-1.5' : 'p-3'}`}>
                    <Button
                      size={compact ? 'sm' : 'default'}
                      onClick={(e) => handleCellClick(myClubId, cat.id, e)}
                      disabled={ctx.isCoachDeadlinePassed && !isAdmin}
                      className={`w-full ${compact ? 'text-xs' : ''}`}
                    >
                      <Plus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                      Adaugă sportiv
                    </Button>
                  </div>
                )}
                <table className={`min-w-full border-collapse ${compact ? 'text-xs' : 'text-sm'}`}>
                  <thead>
                    <tr className="bg-muted">
                      <th className={`border-b ${borderColor} text-left font-semibold text-muted-foreground ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-xs'}`}>{readOnly ? 'Sportiv · club' : 'Sportiv'}</th>
                      <th className={`border-b ${borderColor} text-center font-semibold text-muted-foreground ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-xs'}`}>Greutate</th>
                      {showRemove && <th className={`border-b ${borderColor} text-center font-semibold text-muted-foreground ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-xs'}`}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {enrolled.length === 0 ? (
                      <tr>
                        <td colSpan={showRemove ? 3 : 2} className={`italic text-muted-foreground ${compact ? 'px-2 py-2 text-xs' : 'px-3 py-4 text-sm'}`}>Niciun sportiv înscris.</td>
                      </tr>
                    ) : enrolled.map((entry) => {
                      const athleteName = `${entry.athlete_details?.last_name || ''} ${entry.athlete_details?.first_name || ''}`.trim();
                      return (
                        <tr key={entry.id} className={`border-b ${borderColor}`}>
                          <td className={`font-medium ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
                            {athleteName}
                            {readOnly && <span className="font-normal text-muted-foreground"> ({entry.athlete_details?.club?.name || '—'})</span>}
                          </td>
                          <td className={`text-center text-muted-foreground ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>{entry.weight || '—'}</td>
                          {showRemove && (
                            <td className={`text-center ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
                              <button
                                type="button"
                                onClick={(e) => handleUnenroll(entry.id, athleteName, cat.name, e, { groupName: formatGroupLabel(group), weight: entry.weight })}
                                disabled={busy || (ctx.isCoachDeadlinePassed && !isAdmin)}
                                aria-label={`Dezînscrie ${athleteName}`}
                                className={`inline-flex items-center justify-center rounded border border-destructive/30 bg-destructive/10 font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40 ${compact ? 'h-6 w-6' : 'h-8 w-8 text-xs'}`}
                              >
                                <X className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))
      )}
    </div>
  );
}
