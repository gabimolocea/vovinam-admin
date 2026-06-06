import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Spinner, formatGroupBadgeLabel } from '@shared/components/ui';
import Logo from '@shared/components/Logo';
import { enrollmentAPI, teamAPI } from '@shared/lib/api';
import useCentralizator from '../hooks/useCentralizator';
import { useDisplayPreview } from '../contexts/DisplayPreviewContext';
import EditLockButton from '../components/EditLockButton';

const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const GENDER_BG     = { male: 'bg-blue-100', female: 'bg-pink-100', mixt: 'bg-amber-100' };
const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', fight: 'Luptă' };
const formatFieldLabel = (name = '') => {
  const normalized = String(name)
    .replace(/\bfield\b/gi, 'TEREN')
    .replace(/\btatami\b/gi, 'TEREN');
  return normalized.toUpperCase();
};

/**
 * Context so child pages can access the shared centralizator state
 */
export const CentralizatorContext = React.createContext(null);

export { GENDER_LABELS, GENDER_BG, TYPE_LABELS };

export default function CategoriesLayout() {
  const ctx = useCentralizator();
  const navigate = useNavigate();
  const { id: eventId } = useParams();
  const preview = useDisplayPreview();
  const [teamSelection, setTeamSelection] = useState([]);
  const [teamBuilderBusy, setTeamBuilderBusy] = useState(false);

  // Load fields for preview toggles
  useEffect(() => {
    if (eventId) preview.loadFields(eventId);
  }, [eventId]);

  useEffect(() => {
    setTeamSelection([]);
  }, [ctx.enrollPickerCell?.catId, ctx.enrollPickerCell?.clubId]);

  if (ctx.loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Spinner /></div>;

  const createTeamEnrollment = async (catId, athleteIds) => {
    if (!catId || athleteIds.length < 2) return;
    setTeamBuilderBusy(true);
    ctx.setBusy(true);
    try {
      const { data: team } = await teamAPI.create({ name: `Team ${Date.now()}` });
      for (const athleteId of athleteIds) {
        await teamAPI.members.create({ team: team.id, athlete: athleteId });
      }
      await enrollmentAPI.categoryTeams.create({ category: catId, team: team.id });
      setTeamSelection([]);
      ctx.setEnrollPickerCell(null);
      await ctx.refreshCategoriesOnly();
    } catch (error) {
      console.error('Failed to enroll team', error);
      window.alert(error?.response?.data?.error || 'Nu s-a putut înrola echipa.');
    } finally {
      ctx.setBusy(false);
      setTeamBuilderBusy(false);
    }
  };

  const tabs = [
    { to: '',        label: 'CENTRALIZATOR', end: true },
    { to: 'tehnica',     label: 'Tehnica' },
    { to: 'lupta',       label: 'Lupta' },
    { to: 'brackets',    label: 'Piramide' },
    { to: 'programare',  label: 'Programare' },
    { to: 'arbitri',     label: 'Arbitri' },
    { to: 'live',        label: 'Live' },
    { to: 'clasament',   label: 'Clasament' },
    { to: 'diplome',     label: 'Diplome' },
    { to: 'sync',        label: 'Sync' },
  ];

  return (
    <CentralizatorContext.Provider value={ctx}>
      <div className="flex h-screen flex-col bg-white">

        {/* ═══ TOP BAR — responsive ═══ */}
        <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b-2 border-yellow-400 bg-black px-2 py-2 text-white sm:px-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => navigate('/')}
              className="shrink-0 border border-yellow-400 bg-white px-2 py-1 text-xs font-semibold text-gray-700 transition hover:bg-yellow-300 hover:text-black">
              ← <span className="hidden sm:inline">Înapoi</span>
            </button>
            <div className="hidden h-5 w-px bg-yellow-400/30 sm:block" />
            <Logo size={28} className="shrink-0 hidden sm:block" />
            <h1 className="truncate text-sm font-black uppercase tracking-wide text-yellow-200 sm:text-base">
              {ctx.eventData?.name || `Competiția #${eventId}`}
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] shrink-0">
            {/* Display Preview toggles */}
            {preview.fields.length > 0 && (
              <div className="flex items-center gap-1 mr-2">
                {preview.fields.map(f => (
                  <button
                    key={f.id}
                    onClick={() => preview.togglePreview(f.id)}
                    className={`border border-yellow-400 bg-white px-2 py-1 text-xs font-semibold transition ${
                      preview.isOpen(f.id)
                        ? 'bg-yellow-300 text-black'
                        : 'text-gray-700 hover:bg-yellow-100 hover:text-black'
                    }`}
                    title={`${preview.isOpen(f.id) ? 'Ascunde' : 'Afișează'} ecranul ${formatFieldLabel(f.name)}`}
                  >
                    {`Ecran ${formatFieldLabel(f.name)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ PAGE CONTENT — child route ═══ */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>

        {/* ═══ BOTTOM TAB BAR — responsive ═══ */}
        <div className="shrink-0 flex h-12 items-center gap-1 overflow-x-auto border-t-2 border-yellow-400 bg-black px-1.5 select-none">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `inline-flex items-center whitespace-nowrap border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all sm:px-4 sm:text-xs ${
                  isActive
                    ? 'z-10 border-yellow-400 bg-yellow-300 text-black shadow-sm'
                    : 'border-yellow-400/60 bg-white text-gray-700 hover:bg-yellow-200 hover:text-black'
                }`
              }
            >
              <span>{tab.label}</span>
            </NavLink>
          ))}
          <div className="flex-1" />
          <EditLockButton
            locked={ctx.isEditLocked}
            onToggle={ctx.toggleEditLock}
            disabled={!ctx.canUnlockEdit}
            compact
            className="shrink-0"
          />
        </div>

        {/* ═══ GROUP CREATION MODAL ═══ */}
        {ctx.groupModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => ctx.setGroupModal(null)}>
            <div className="w-full max-w-lg border-2 border-black bg-white" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b-2 border-black bg-yellow-300 px-5 py-3">
                <h2 className="text-base font-black uppercase tracking-wide text-gray-900">Grupă personalizată</h2>
                <button onClick={() => ctx.setGroupModal(null)} className="border border-black bg-white px-2 py-1 text-sm font-bold text-gray-700 hover:bg-yellow-100">✕</button>
              </div>
              <form onSubmit={ctx.handleCustomGroup} className="p-4 sm:p-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-bold text-gray-800">Nume grupă *</label>
                  <input required value={ctx.groupForm.name}
                    onChange={e => ctx.setGroupForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: U16 Special, Masters 40+"
                    className="frvv-input w-full text-base" autoFocus />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-bold text-gray-800">Data nașterii — de la</label>
                    <input type="date" value={ctx.groupForm.birth_date_start}
                      onChange={e => ctx.setGroupForm(f => ({ ...f, birth_date_start: e.target.value }))}
                      className="frvv-input w-full text-base" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-gray-800">Data nașterii — până la</label>
                    <input type="date" value={ctx.groupForm.birth_date_end}
                      onChange={e => ctx.setGroupForm(f => ({ ...f, birth_date_end: e.target.value }))}
                      className="frvv-input w-full text-base" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ctx.groupForm.allow_younger}
                    onChange={e => ctx.setGroupForm(f => ({ ...f, allow_younger: e.target.checked }))}
                    className="border border-black text-yellow-500 focus:ring-0" />
                  <span className="text-sm text-gray-700">Permite sportivi mai tineri să urce la categorie superioară</span>
                </label>
                {ctx.eventDateStr && (
                  <p className="border border-black/20 bg-yellow-50 px-3 py-2 text-xs text-gray-600">Data evenimentului: {ctx.eventDateStr} · anul de referință: {ctx.eventYear}</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => ctx.setGroupModal(null)} className="frvv-btn-secondary">Anulează</button>
                  <button type="submit" disabled={ctx.busy}
                    className="frvv-btn-primary">Creează grupă</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ CATEGORY CREATION MODAL ═══ */}
        {ctx.catModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => ctx.setCatModal(null)}>
            <div className="w-full max-w-md border-2 border-black bg-white" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b-2 border-black bg-yellow-300 px-5 py-3">
                <h2 className="text-base font-black uppercase tracking-wide text-gray-900">Categorie personalizată</h2>
                <button onClick={() => ctx.setCatModal(null)} className="border border-black bg-white px-2 py-1 text-sm font-bold text-gray-700 hover:bg-yellow-100">✕</button>
              </div>
              <form onSubmit={ctx.handleAddCustomCat} className="p-4 sm:p-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-bold text-gray-800">Nume categorie *</label>
                  <input required value={ctx.catForm.name}
                    onChange={e => ctx.setCatForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: Quyền Duo Mixt"
                    className="frvv-input w-full text-base" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-bold text-gray-800">Tip</label>
                    <select value={ctx.catForm.category_type}
                      onChange={e => ctx.setCatForm(f => ({ ...f, category_type: e.target.value }))}
                      className="frvv-input w-full text-base">
                      <option value="solo">Solo (Quyền)</option>
                      <option value="team">Echipă (Song Luyện / Đa Luyện)</option>
                      <option value="fight">Luptă (Đối Kháng)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-gray-800">Gen</label>
                    <select value={ctx.catForm.gender}
                      onChange={e => ctx.setCatForm(f => ({ ...f, gender: e.target.value }))}
                      className="frvv-input w-full text-base">
                      <option value="male">Masculin</option>
                      <option value="female">Feminin</option>
                      <option value="mixt">Mixt</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => ctx.setCatModal(null)} className="frvv-btn-secondary">Anulează</button>
                  <button type="submit" disabled={ctx.busy}
                    className="frvv-btn-primary">Creează categorie</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ CONFIRMATION MODAL ═══ */}
        {ctx.confirmModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => ctx.setConfirmModal(null)}>
            <div className="w-full max-w-md overflow-hidden border-2 border-black bg-white" onClick={e => e.stopPropagation()}>
              <div className="border-b-2 border-black bg-yellow-300 px-6 py-4 text-center">
                <h3 className="text-lg font-black uppercase tracking-wide text-gray-900">{ctx.confirmModal.title}</h3>
              </div>
              <div className="p-6 text-center">
                <p className="text-base leading-relaxed text-gray-700">{ctx.confirmModal.message}</p>
                {ctx.confirmModal.detail && (
                  <p className="mt-3 max-h-24 overflow-y-auto bg-yellow-50 px-3 py-2 text-sm text-gray-600">
                    {ctx.confirmModal.detail}
                  </p>
                )}
              </div>
              <div className="flex border-t-2 border-black">
                <button
                  onClick={() => ctx.setConfirmModal(null)}
                  className="frvv-btn-secondary flex-1 border-y-0 border-l-0"
                >Anulează</button>
                <button
                  onClick={ctx.confirmModal.onConfirm}
                  disabled={ctx.busy}
                  className={`flex-1 border-l-2 border-black px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                    ctx.confirmModal.color === 'orange'
                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >{ctx.confirmModal.confirmLabel || 'Confirmă'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ENROLLMENT PICKER MODAL ═══ */}
        {ctx.enrollPickerCell && (() => {
          const { clubId, catId } = ctx.enrollPickerCell;
          const isAllMode = clubId === null;
          const cacheKey = clubId ?? '__all__';
          const clubName = isAllMode ? 'Toate cluburile' : (ctx.clubs.find(c => c.id === clubId)?.name || '—');
          const cat = ctx.categories.find(c => c.id === catId);
          const isTeamCategory = cat?.type === 'team';
          const catName = cat?.name || '—';
          const allClubAthletes = ctx.clubAthleteCache[cacheKey] || [];
          const isLoading = !ctx.clubAthleteCache[cacheKey];
          const enrolledTeams = Array.isArray(cat?.enrolled_teams) ? cat.enrolled_teams : [];
          const enrolledIds = new Set(
            (cat?.enrolled_athletes || [])
              .filter(ea => {
                if (isAllMode) return true;
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
          const selectedAthletes = athleteList.filter(ath => teamSelection.includes(ath.id));
          const selectedSignature = [...teamSelection].sort((a, b) => a - b).join('-');
          const duplicateTeam = enrolledTeams.find(team => {
            const memberSignature = (team.members || []).map(member => member.id).sort((a, b) => a - b).join('-');
            return memberSignature && memberSignature === selectedSignature;
          });
          const canSaveTeam = isTeamCategory && teamSelection.length >= 2 && !duplicateTeam && !ctx.busy && !teamBuilderBusy;

          return (
            <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4" onClick={() => ctx.setEnrollPickerCell(null)}>
              <div
                ref={ctx.enrollPickerRef}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden border-2 border-black bg-white"
              >
                <div className="flex items-start justify-between gap-3 border-b-2 border-black bg-yellow-300 px-4 py-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-gray-900">{isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}</p>
                    <p className="mt-1 text-xs text-gray-700">{clubName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="frvv-chip">{formatGroupBadgeLabel(group) || 'Grupă'}</span>
                      <span className="frvv-chip">{catName}</span>
                    </div>
                  </div>
                  <button onClick={() => ctx.setEnrollPickerCell(null)} className="border border-black bg-white px-3 py-1 text-sm font-bold text-gray-700 hover:bg-yellow-100">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {isLoading ? (
                    <div className="p-6 text-center text-sm text-gray-500">Se încarcă…</div>
                  ) : athleteList.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500 italic">
                      {hasDateRange
                        ? `Niciun sportiv ${isAllMode ? 'din toate cluburile' : 'din acest club'} nu se încadrează în intervalul de vârstă (${outOfRangeCount} exclu${outOfRangeCount === 1 ? 's' : 'și'}).`
                        : `Niciun sportiv ${isAllMode ? 'disponibil în cluburi' : 'în acest club'}.`}
                    </div>
                  ) : (
                    athleteList.map(ath => {
                      const isEnrolled = enrolledIds.has(ath.id);
                      const isSelected = teamSelection.includes(ath.id);
                      const dob = ath.date_of_birth;
                      return (
                        <button key={ath.id}
                          onClick={() => {
                            if (isTeamCategory) {
                              setTeamSelection(prev => prev.includes(ath.id) ? prev.filter(id => id !== ath.id) : [...prev, ath.id]);
                              return;
                            }
                            ctx.handleToggleEnroll(ath.id, catId);
                          }}
                          disabled={ctx.busy || teamBuilderBusy}
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
                  <div className="border-t border-black/10 bg-yellow-50 px-3 py-2 text-xs text-gray-600">
                    {outOfRangeCount} sportiv{outOfRangeCount === 1 ? '' : 'i'} {isAllMode ? 'din toate cluburile' : 'din club'} nu se încadrează în vârstă
                  </div>
                )}
                {isTeamCategory && (
                  <div className="border-t border-black/10 bg-blue-50 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-700">Echipă selectată</div>
                    <div className="mt-1 text-sm text-gray-700">
                      {selectedAthletes.length > 0
                        ? selectedAthletes.map(ath => `${ath.first_name} ${ath.last_name}`).join(' & ')
                        : 'Selectează minimum 2 sportivi.'}
                    </div>
                    {duplicateTeam && (
                      <div className="mt-2 text-xs font-semibold text-red-600">
                        Echipa este deja înrolată în această categorie.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => createTeamEnrollment(catId, teamSelection)}
                      disabled={!canSaveTeam}
                      className="mt-3 w-full border border-black bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                    >
                      {teamBuilderBusy ? 'Se înrolează...' : 'Înrolează echipa'}
                    </button>
                  </div>
                )}
                <div className="border-t-2 border-black p-3 text-center">
                  <button onClick={() => ctx.setEnrollPickerCell(null)}
                    className="frvv-btn-secondary px-3 py-1.5 text-xs">Închide</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </CentralizatorContext.Provider>
  );
}
