import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner } from '@shared/components/ui';
import useCoachCentralizator from '../hooks/useCoachCentralizator';

const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const GENDER_BG     = { male: 'bg-blue-100', female: 'bg-pink-100', mixt: 'bg-amber-100' };
const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', teams: 'Echipă', fight: 'Luptă' };
const isTeamCategoryType = (type) => type === 'team' || type === 'teams';
const MODAL_SECONDARY_BUTTON = 'border border-black bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-yellow-100 hover:text-black disabled:opacity-40';
const MODAL_PRIMARY_BUTTON = 'border border-black bg-yellow-300 px-4 py-2.5 text-sm font-black text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500';
const MODAL_DANGER_BUTTON = 'border border-black bg-red-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40';

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
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ═══ TABLE ═══ */}
      <CentralizatorTable ctx={ctx} onBack={() => navigate('/competitions')} />

      {/* ═══ CONFIRM MODAL ═══ */}
      {ctx.confirmModal && (
        <CoachModal
          onClose={() => ctx.setConfirmModal(null)}
          title={ctx.confirmModal.title}
          description={ctx.confirmModal.message}
          maxWidth="max-w-md"
          footer={(
            <>
              <button onClick={() => ctx.setConfirmModal(null)} className={MODAL_SECONDARY_BUTTON}>
                Anulează
              </button>
              <button
                onClick={ctx.confirmModal.onConfirm}
                disabled={ctx.busy}
                className={ctx.confirmModal.color === 'orange' ? MODAL_PRIMARY_BUTTON : MODAL_DANGER_BUTTON}
              >
                {ctx.confirmModal.confirmLabel || 'Confirmă'}
              </button>
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
          maxWidth="max-w-sm"
          footer={(
            <>
              <button onClick={() => ctx.setWeightModal(null)} className={MODAL_SECONDARY_BUTTON}>
                Anulează
              </button>
              <button onClick={ctx.handleWeightSubmit} disabled={ctx.busy} className={MODAL_PRIMARY_BUTTON}>
                Înscrie
              </button>
            </>
          )}
        >
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.1"
              min="0"
              max="200"
              value={ctx.weightValue}
              onChange={(e) => ctx.setWeightValue(e.target.value)}
              placeholder="ex: 65.5"
              className="frvv-input flex-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') ctx.handleWeightSubmit(); }}
            />
            <span className="inline-flex h-11 items-center border border-black bg-gray-100 px-3 text-sm font-bold text-gray-700">kg</span>
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
            maxWidth="max-w-3xl"
            panelRef={ctx.enrollPickerRef}
            headerExtra={(
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="frvv-chip">{formatGroupLabel(ctx.groups.find((group) => group.id === cat?.group))}</span>
                <span className="frvv-chip">{catName}</span>
                <span className="frvv-chip">{TYPE_LABELS[cat?.type] || cat?.category_type || 'Categorie'}</span>
                {isTeamCategory && <span className="frvv-chip">Construire echipă</span>}
              </div>
            )}
            footer={(
              <>
                <button onClick={() => ctx.setEnrollPickerCell(null)} className={MODAL_SECONDARY_BUTTON}>
                  Închide
                </button>
                {isTeamCategory && (
                  <button
                    type="button"
                    onClick={() => ctx.createTeamEnrollment(catId, teamSelection)}
                    disabled={!canSaveTeam}
                    className={MODAL_PRIMARY_BUTTON}
                  >
                    {ctx.teamBuilderBusy ? 'Se înrolează...' : 'Înrolează echipa'}
                  </button>
                )}
              </>
            )}
          >
            <div className="space-y-4">
              {hasDateRange && (
                <div className="border border-black/10 bg-yellow-50 px-3 py-2 text-xs text-gray-700">
                  Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                </div>
              )}
              <div className="max-h-[52vh] overflow-y-auto border-2 border-black/10 bg-white">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-gray-500">Se încarcă…</div>
              ) : athleteList.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500 italic">
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
                        className={`grid gap-3 border-b border-black/10 px-4 py-3 md:grid-cols-[minmax(0,1fr)_140px_120px] md:items-center ${isEnrolled ? 'bg-green-50' : 'hover:bg-yellow-50'}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-gray-900">{ath.last_name} {ath.first_name}</div>
                          <div className="truncate text-xs text-gray-500">{ath.club?.name || 'Fără club'}{dob ? ` · ${dob}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="200"
                            step="0.1"
                            value={fightWeight}
                            onChange={(e) => setFightWeights((prev) => ({ ...prev, [ath.id]: e.target.value }))}
                            placeholder="Greutate"
                            className="frvv-input w-full"
                            disabled={ctx.busy || isEnrolled}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isEnrolled && canEnrollFightAthlete(ath.id)) {
                                ctx.handleToggleEnroll(ath.id, catId, fightWeight);
                              }
                            }}
                          />
                          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">kg</span>
                        </div>
                        <div className="flex items-center justify-end">
                          {isEnrolled ? (
                            <span className="inline-flex items-center border border-green-600 bg-green-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-green-700">
                              Înscris
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => ctx.handleToggleEnroll(ath.id, catId, fightWeight)}
                              disabled={ctx.busy || !canEnrollFightAthlete(ath.id)}
                              className={MODAL_PRIMARY_BUTTON}
                            >
                              Adaugă
                            </button>
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
                      className={`w-full flex items-center gap-3 border-b border-black/10 px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                        isTeamCategory
                          ? isSelected
                            ? 'bg-blue-50 hover:bg-blue-100 text-gray-800'
                            : 'hover:bg-yellow-50 text-gray-700'
                          : isEnrolled
                            ? 'bg-green-50 hover:bg-green-100 text-gray-800'
                            : 'hover:bg-yellow-50 text-gray-700'
                      }`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center border text-sm font-bold ${
                        isTeamCategory
                          ? isSelected
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-gray-300 text-transparent'
                          : isEnrolled
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 text-transparent'
                      }`}>✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">{ath.last_name} {ath.first_name}</span>
                        <span className="block truncate text-xs text-gray-500">{ath.club?.name || 'Fără club'}{dob ? ` · ${dob}` : ''}</span>
                      </span>
                    </button>
                  );
                })
              )}
              </div>
              {outOfRangeCount > 0 && (
                <div className="border border-black/10 bg-yellow-50 px-3 py-2 text-xs text-gray-600">
                  {outOfRangeCount} sportiv{outOfRangeCount === 1 ? '' : 'i'} din club nu se încadrează în vârstă
                </div>
              )}
              {isTeamCategory && (
                <div className="border border-black/10 bg-blue-50 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-700">Echipă selectată</div>
                  <div className="mt-1 text-sm text-gray-700">
                    {selectedAthletes.length > 0
                      ? selectedAthletes.map((ath) => `${ath.first_name} ${ath.last_name}`).join(' & ')
                      : 'Selectează minimum 2 sportivi.'}
                  </div>
                  {duplicateTeam && (
                    <div className="mt-2 text-xs font-semibold text-red-600">
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

function CoachModal({ onClose, title, description, maxWidth = 'max-w-md', headerExtra = null, footer = null, panelRef = null, children = null }) {
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full ${maxWidth} flex-col overflow-hidden border-2 border-black bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-black bg-yellow-300 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-black text-gray-900">{title}</h3>
            {description ? <p className="mt-1 text-sm text-gray-700">{description}</p> : null}
            {headerExtra}
          </div>
          <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center border-2 border-black bg-white text-lg font-black text-gray-700 transition hover:bg-yellow-100 hover:text-black">
            ×
          </button>
        </div>
        {children ? <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t-2 border-black bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   CENTRALIZATOR TABLE — coach's own club only
   ═══════════════════════════════════════════════════════ */
function CentralizatorTable({ ctx, onBack }) {
  const [activeTab, setActiveTab] = useState('tehnica');

  return (
    <div className="flex-1 overflow-auto bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-2 border border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-700 transition hover:bg-yellow-100 hover:text-black"
          >
            <span aria-hidden="true">←</span>
            Înapoi la competiții
          </button>
          <div className="text-sm font-black uppercase tracking-wide text-gray-900">Centralizator club</div>
          <div className="mt-1 text-xs text-gray-500">
            {ctx.eventData?.name || 'Competiție'}{ctx.eventDateStr ? ` · ${ctx.eventDateStr}` : ''} · {ctx.groups.length} grupe · {ctx.categories.length} categorii · {ctx.totalAthletes} sportivi
          </div>
          <div className={`mt-2 inline-flex items-center border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ctx.isCoachDeadlinePassed ? 'border-red-300 bg-red-50 text-red-700' : 'border-black bg-yellow-100 text-black'}`}>
            Deadline antrenori: {ctx.coachDeadlineDateStr || ctx.eventDateStr || '—'}
          </div>
        </div>
        <div className="inline-flex w-full sm:w-auto overflow-hidden border-2 border-black bg-white">
          <button
            onClick={() => setActiveTab('tehnica')}
            className={`flex-1 px-4 py-2 text-xs font-black uppercase tracking-wide transition sm:flex-none ${activeTab === 'tehnica' ? 'bg-yellow-300 text-black' : 'bg-white text-gray-700 hover:bg-yellow-100'}`}
          >
            Tehnica
          </button>
          <button
            onClick={() => setActiveTab('lupta')}
            className={`border-l-2 border-black flex-1 px-4 py-2 text-xs font-black uppercase tracking-wide transition sm:flex-none ${activeTab === 'lupta' ? 'bg-yellow-300 text-black' : 'bg-white text-gray-700 hover:bg-yellow-100'}`}
          >
            Lupta
          </button>
        </div>
      </div>

      {ctx.isCoachDeadlinePassed && (
        <div className="mb-4 border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Deadline-ul pentru completarea centralizatorului de către antrenori a expirat. Înscrierile nu mai pot fi modificate.
        </div>
      )}

      {activeTab === 'tehnica' ? <CoachTehnicaView ctx={ctx} /> : <CoachLuptaView ctx={ctx} />}
    </div>
  );
}

function CoachTehnicaView({ ctx }) {
  const { columnStructure, myClubId, handleCellClick, handleUnenroll, busy } = ctx;

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
    return <div className="py-16 text-center text-sm italic text-gray-400">Nu există categorii de tehnică.</div>;
  }

  return (
    <div className="space-y-6">
      {techGroups.map(({ group, cats }) => (
        <div key={`tech-${group.id}`} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cats.map((cat) => {
            const isTeamCategory = isTeamCategoryType(cat.type);
            const enrolled = isTeamCategory
              ? (cat.enrolled_teams || [])
                  .filter((item) => (item.members || []).some((member) => (member.club?.id || member.club) === myClubId))
                  .slice()
                  .sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''))
              : (cat.enrolled_athletes || [])
                  .filter((item) => (item.athlete_details?.club?.id || item.athlete_details?.club) === myClubId)
                  .slice()
                  .sort((a, b) => {
                    const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                    const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                    return na.localeCompare(nb);
                  });

            return (
              <div key={cat.id} className="overflow-hidden border-2 border-black bg-white">
                <div className="border-b border-black bg-yellow-300 px-3 py-2 text-sm font-black text-gray-900">
                  {formatGroupLabel(group)}
                </div>
                <div className={`border-b border-black px-3 py-2 text-xs font-bold uppercase tracking-wide ${GENDER_BG[cat.gender] || 'bg-gray-100'} text-gray-900`}>
                  {cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}
                </div>
                <div className="divide-y divide-gray-200">
                  {enrolled.length === 0 ? (
                    <div className="px-3 py-4 text-sm italic text-gray-400">{isTeamCategory ? 'Nicio echipă înscrisă.' : 'Niciun sportiv înscris.'}</div>
                  ) : enrolled.map((entry) => {
                    const athleteName = `${entry.athlete_details?.last_name || ''} ${entry.athlete_details?.first_name || ''}`.trim();
                    const teamMembers = (entry.members || []).map((member) => member.name).filter(Boolean).join(' & ');
                    const teamLabel = entry.team_name || teamMembers || 'Echipă';
                    return (
                      <div key={entry.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-gray-900">{isTeamCategory ? teamLabel : athleteName}</div>
                          {isTeamCategory && teamMembers && teamMembers !== teamLabel && (
                            <div className="truncate text-xs text-gray-500">{teamMembers}</div>
                          )}
                          {isTeamCategory && entry.club_name && <div className="truncate text-xs text-gray-400">{entry.club_name}</div>}
                        </div>
                        <button
                          onClick={(e) => handleUnenroll(entry.id, isTeamCategory ? teamLabel : athleteName, cat.name, e, isTeamCategory ? { enrollmentType: 'team' } : undefined)}
                          disabled={busy || ctx.isCoachDeadlinePassed}
                          className="inline-flex h-5 w-5 items-center justify-center border border-red-300 bg-red-50 text-xs font-bold text-red-600 hover:bg-red-500 hover:text-white disabled:opacity-40"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t-2 border-black p-3">
                  <button onClick={(e) => handleCellClick(myClubId, cat.id, e)} disabled={ctx.isCoachDeadlinePassed} className="frvv-btn-add w-full disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 disabled:border-gray-400">
                    <span className="frvv-btn-add-icon">+</span>
                    {isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}
                  </button>
                </div>
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
    return <div className="py-16 text-center text-sm italic text-gray-400">Nu există categorii de luptă.</div>;
  }

  return (
    <div className="space-y-6">
      {fightGroups.map(({ group, cats }) => (
        <div key={`fight-${group.id}`} className="grid gap-4 md:grid-cols-2">
          {cats.map((cat) => {
            const enrolled = (cat.enrolled_athletes || [])
              .filter((item) => (item.athlete_details?.club?.id || item.athlete_details?.club) === myClubId)
              .slice()
              .sort((a, b) => {
                const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                return na.localeCompare(nb);
              });

            return (
              <div key={cat.id} className="overflow-hidden border-2 border-black bg-white">
                <div className="border-b border-black bg-yellow-300 px-3 py-2 text-sm font-black text-gray-900">
                  {formatGroupLabel(group)}
                </div>
                <div className={`border-b border-black px-3 py-2 text-xs font-bold uppercase tracking-wide ${GENDER_BG[cat.gender] || 'bg-gray-100'} text-gray-900`}>
                  {cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}
                </div>
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border-b border-black px-3 py-2 text-left text-xs font-bold text-gray-700">Sportiv</th>
                      <th className="border-b border-black px-3 py-2 text-center text-xs font-bold text-gray-700">Greutate</th>
                      <th className="border-b border-black px-3 py-2 text-center text-xs font-bold text-gray-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolled.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm italic text-gray-400">Niciun sportiv înscris.</td>
                      </tr>
                    ) : enrolled.map((entry) => {
                      const athleteName = `${entry.athlete_details?.last_name || ''} ${entry.athlete_details?.first_name || ''}`.trim();
                      return (
                        <tr key={entry.id} className="border-b border-gray-200">
                          <td className="px-3 py-2 font-medium text-gray-900">{athleteName}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{entry.weight || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={(e) => handleUnenroll(entry.id, athleteName, cat.name, e)}
                              disabled={busy || ctx.isCoachDeadlinePassed}
                              className="inline-flex h-5 w-5 items-center justify-center border border-red-300 bg-red-50 text-xs font-bold text-red-600 hover:bg-red-500 hover:text-white disabled:opacity-40"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="border-t-2 border-black p-3">
                  <button onClick={(e) => handleCellClick(myClubId, cat.id, e)} disabled={ctx.isCoachDeadlinePassed} className="frvv-btn-add w-full disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 disabled:border-gray-400">
                    <span className="frvv-btn-add-icon">+</span>
                    Adaugă sportiv
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
