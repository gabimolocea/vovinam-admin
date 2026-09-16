import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Skeleton, Tabs, TabsList, TabsTrigger } from '../components/ui';
import { ArrowLeft, Plus, X } from 'lucide-react';
import useCoachCentralizator from '../hooks/useCoachCentralizator';

const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const GENDER_BG     = { male: 'bg-blue-500/10', female: 'bg-pink-500/10', mixt: 'bg-amber-500/10' };
const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', teams: 'Echipă', fight: 'Luptă' };
const isTeamCategoryType = (type) => type === 'team' || type === 'teams';

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
  const ctx = useCoachCentralizator(eventId);
  const [teamSelection, setTeamSelection] = useState([]);
  const [fightWeights, setFightWeights] = useState({});

  const activeEnrollCategory = ctx.categories.find((cat) => cat.id === ctx.enrollPickerCell?.catId) || null;
  const activeClubId = ctx.enrollPickerCell?.clubId;

  React.useEffect(() => {
    setTeamSelection([]);
    setFightWeights({});
  }, [ctx.enrollPickerCell?.catId, ctx.enrollPickerCell?.clubId]);

  if (ctx.loading) {
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
      <CentralizatorTable ctx={ctx} onBack={() => navigate('/competitions')} />

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
                    ? `Niciun sportiv din clubul tău nu se încadrează în intervalul de vârstă (${outOfRangeCount} exclu${outOfRangeCount === 1 ? 's' : 'și'}).`
                    : 'Niciun sportiv în clubul tău.'}
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
   CENTRALIZATOR TABLE — coach's own club only
   ═══════════════════════════════════════════════════════ */
function CentralizatorTable({ ctx, onBack }) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('tehnica');

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mb-4 flex flex-col gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Înapoi la competiții
        </Button>
        <h1 className="font-display text-2xl font-bold">{isAdmin ? 'Centralizator competiție' : 'Centralizator club'}</h1>
      </div>

      <div className={`mb-4 w-full rounded-md border px-4 py-3 text-center text-sm font-medium ${ctx.isCoachDeadlinePassed ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
        {ctx.isCoachDeadlinePassed
          ? <>Termen limită de înscrieri: {ctx.coachDeadlineDateStr || ctx.eventDateStr || '—'} — Termenul a expirat. Înscrierile nu mai pot fi modificate.</>
          : <>Termen limită de înscrieri: {ctx.coachDeadlineDateStr || ctx.eventDateStr || '—'}</>
        }
      </div>

      <div className="mb-4 flex justify-center">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="tehnica">Tehnica</TabsTrigger>
            <TabsTrigger value="lupta">Lupta</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'tehnica' ? <CoachTehnicaView ctx={ctx} /> : <CoachLuptaView ctx={ctx} />}
    </div>
  );
}

/** Shows the coach's own club (myClubId set, filtered, editable) or, for
 * an admin (myClubId null - see useCoachCentralizator), every club's
 * enrollments read-only, with the club name shown per entry so the
 * multi-club list stays legible - so an admin can eyeball the full
 * pre-competition centralizator without leaving this panel for the
 * LAN-oriented competition-admin app. */
function CoachTehnicaView({ ctx }) {
  const { columnStructure, myClubId, handleCellClick, handleUnenroll, busy } = ctx;
  const readOnly = myClubId == null;

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

  if (techGroups.length === 0) {
    return <div className="py-16 text-center text-sm italic text-muted-foreground">Nu există categorii de tehnică.</div>;
  }

  return (
    <div className="space-y-6">
      {techGroups.map(({ group, cats }) => (
        <div key={`tech-${group.id}`} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              <div key={cat.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border bg-muted px-3 py-2 text-sm font-semibold">
                  {formatGroupLabel(group)}
                </div>
                <div className={`border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${GENDER_BG[cat.gender] || 'bg-muted'}`}>
                  {cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}
                </div>
                <div className="divide-y divide-border">
                  {enrolled.length === 0 ? (
                    <div className="px-3 py-4 text-sm italic text-muted-foreground">{isTeamCategory ? 'Nicio echipă înscrisă.' : 'Niciun sportiv înscris.'}</div>
                  ) : enrolled.map((entry) => {
                    const athleteName = `${entry.athlete_details?.last_name || ''} ${entry.athlete_details?.first_name || ''}`.trim();
                    const teamMembers = (entry.members || []).map((member) => member.name).filter(Boolean).join(' & ');
                    const teamLabel = entry.team_name || teamMembers || 'Echipă';
                    return (
                      <div key={entry.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{isTeamCategory ? teamLabel : athleteName}</div>
                          {isTeamCategory && teamMembers && teamMembers !== teamLabel && (
                            <div className="truncate text-xs text-muted-foreground">{teamMembers}</div>
                          )}
                          {isTeamCategory && entry.club_name && <div className="truncate text-xs text-muted-foreground">{entry.club_name}</div>}
                          {readOnly && !isTeamCategory && entry.athlete_details?.club?.name && (
                            <div className="truncate text-xs text-muted-foreground">{entry.athlete_details.club.name}</div>
                          )}
                        </div>
                        {!readOnly && (
                          <button
                            onClick={(e) => handleUnenroll(entry.id, isTeamCategory ? teamLabel : athleteName, cat.name, e, isTeamCategory ? { enrollmentType: 'team' } : undefined)}
                            disabled={busy || ctx.isCoachDeadlinePassed}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!readOnly && (
                  <div className="border-t border-border p-3">
                    <Button onClick={(e) => handleCellClick(myClubId, cat.id, e)} disabled={ctx.isCoachDeadlinePassed} className="w-full">
                      <Plus className="h-4 w-4" />
                      {isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CoachLuptaView({ ctx }) {
  const { columnStructure, myClubId, handleCellClick, handleUnenroll, busy } = ctx;
  const readOnly = myClubId == null;

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

  if (fightGroups.length === 0) {
    return <div className="py-16 text-center text-sm italic text-muted-foreground">Nu există categorii de luptă.</div>;
  }

  return (
    <div className="space-y-6">
      {fightGroups.map(({ group, cats }) => (
        <div key={`fight-${group.id}`} className="grid gap-4 md:grid-cols-2">
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
              <div key={cat.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border bg-muted px-3 py-2 text-sm font-semibold">
                  {formatGroupLabel(group)}
                </div>
                <div className={`border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${GENDER_BG[cat.gender] || 'bg-muted'}`}>
                  {cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}
                </div>
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Sportiv</th>
                      {readOnly && <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Club</th>}
                      <th className="border-b border-border px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Greutate</th>
                      {!readOnly && <th className="border-b border-border px-3 py-2 text-center text-xs font-semibold text-muted-foreground"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {enrolled.length === 0 ? (
                      <tr>
                        <td colSpan={readOnly ? 3 : 3} className="px-3 py-4 text-sm italic text-muted-foreground">Niciun sportiv înscris.</td>
                      </tr>
                    ) : enrolled.map((entry) => {
                      const athleteName = `${entry.athlete_details?.last_name || ''} ${entry.athlete_details?.first_name || ''}`.trim();
                      return (
                        <tr key={entry.id} className="border-b border-border">
                          <td className="px-3 py-2 font-medium">{athleteName}</td>
                          {readOnly && <td className="px-3 py-2 text-muted-foreground">{entry.athlete_details?.club?.name || '—'}</td>}
                          <td className="px-3 py-2 text-center text-muted-foreground">{entry.weight || '—'}</td>
                          {!readOnly && (
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={(e) => handleUnenroll(entry.id, athleteName, cat.name, e)}
                                disabled={busy || ctx.isCoachDeadlinePassed}
                                className="inline-flex h-5 w-5 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!readOnly && (
                  <div className="border-t border-border p-3">
                    <Button onClick={(e) => handleCellClick(myClubId, cat.id, e)} disabled={ctx.isCoachDeadlinePassed} className="w-full">
                      <Plus className="h-4 w-4" />
                      Adaugă sportiv
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
