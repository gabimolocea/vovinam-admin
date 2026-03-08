import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@shared/components/ui';
import Logo from '@shared/components/Logo';
import useCentralizator from '../hooks/useCentralizator';
import { useDisplayPreview } from '../contexts/DisplayPreviewContext';

const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
const GENDER_BG     = { male: 'bg-blue-100', female: 'bg-pink-100', mixt: 'bg-amber-100' };
const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', fight: 'Luptă' };

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

  // Load fields for preview toggles
  useEffect(() => {
    if (eventId) preview.loadFields(eventId);
  }, [eventId]);

  if (ctx.loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Spinner /></div>;

  const tabs = [
    { to: '',        label: 'CENTRALIZATOR', icon: '📊', end: true },
    { to: 'tehnica',     label: 'Tehnica',     icon: '🥋' },
    { to: 'lupta',       label: 'Lupta',       icon: '🥊' },
    { to: 'brackets',    label: 'Piramide',    icon: '🏆' },
    { to: 'programare',  label: 'Programare',  icon: '📅' },
    { to: 'arbitri',     label: 'Arbitri',     icon: '⚖️' },
    { to: 'live',        label: 'Live',        icon: '📺' },
  ];

  return (
    <CentralizatorContext.Provider value={ctx}>
      <div className="flex h-screen flex-col bg-white">

        {/* ═══ TOP BAR — responsive ═══ */}
        <div className="flex items-center justify-between border-b border-gray-300 bg-white px-2 sm:px-3 py-1.5 shrink-0 gap-2 min-h-[44px]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => navigate('/')}
              className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition shrink-0">
              ← <span className="hidden sm:inline">Înapoi</span>
            </button>
            <div className="hidden sm:block h-4 w-px bg-gray-300" />
            <Logo size={28} className="shrink-0 hidden sm:block" />
            <h1 className="text-xs sm:text-sm font-bold text-gray-900 truncate">
              {ctx.eventData?.name || `Competiția #${eventId}`}
            </h1>
            {ctx.eventDateStr && (
              <span className="hidden md:inline text-[10px] text-blue-500 bg-blue-50 rounded px-1.5 py-0.5 shrink-0">
                📅 {ctx.eventDateStr}
              </span>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] shrink-0">
            {/* Display Preview toggles */}
            {preview.fields.length > 0 && (
              <div className="flex items-center gap-1 mr-2">
                {preview.fields.map(f => (
                  <button
                    key={f.id}
                    onClick={() => preview.togglePreview(f.id)}
                    className={`text-[10px] font-bold px-2 py-1 rounded transition ${
                      preview.isOpen(f.id)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                    }`}
                    title={`${preview.isOpen(f.id) ? 'Ascunde' : 'Afișează'} preview ${f.name}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            <span className="text-gray-500">{ctx.groups.length} grupe</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">{ctx.categories.length} categorii</span>
            <span className="text-gray-300">·</span>
            <span className="font-semibold text-blue-600">{ctx.totalAthletes} sportivi</span>
          </div>
        </div>

        {/* ═══ PAGE CONTENT — child route ═══ */}
        <Outlet />

        {/* ═══ BOTTOM TAB BAR — responsive ═══ */}
        <div className="shrink-0 flex items-center border-t border-gray-300 bg-gray-200 px-1 h-9 gap-0.5 select-none overflow-x-auto">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-t-md text-[10px] sm:text-xs font-semibold transition-all border border-b-0 whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-gray-900 border-gray-300 shadow-sm -mb-px z-10'
                    : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-700'
                }`
              }
            >
              <span className="text-xs sm:text-sm">{tab.icon}</span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
          <div className="flex-1" />
          <span className="hidden sm:inline text-[10px] text-gray-400 pr-2 shrink-0">
            {ctx.groups.length} grupe · {ctx.categories.length} categorii · {ctx.totalAthletes} sportivi
          </span>
        </div>

        {/* ═══ GROUP CREATION MODAL ═══ */}
        {ctx.groupModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => ctx.setGroupModal(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-bold text-gray-900">Grupă personalizată</h2>
                <button onClick={() => ctx.setGroupModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <form onSubmit={ctx.handleCustomGroup} className="p-4 sm:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nume grupă *</label>
                  <input required value={ctx.groupForm.name}
                    onChange={e => ctx.setGroupForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: U16 Special, Masters 40+"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" autoFocus />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Data nașterii — de la</label>
                    <input type="date" value={ctx.groupForm.birth_date_start}
                      onChange={e => ctx.setGroupForm(f => ({ ...f, birth_date_start: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Data nașterii — până la</label>
                    <input type="date" value={ctx.groupForm.birth_date_end}
                      onChange={e => ctx.setGroupForm(f => ({ ...f, birth_date_end: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ctx.groupForm.allow_younger}
                    onChange={e => ctx.setGroupForm(f => ({ ...f, allow_younger: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-gray-700">Permite sportivi mai tineri să urce la categorie superioară</span>
                </label>
                {ctx.eventDateStr && (
                  <p className="text-[10px] text-gray-400">📅 Data evenimentului: {ctx.eventDateStr} (anul de referință: {ctx.eventYear})</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => ctx.setGroupModal(null)}
                    className="rounded-lg px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 transition">Anulează</button>
                  <button type="submit" disabled={ctx.busy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">Creează grupă</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ CATEGORY CREATION MODAL ═══ */}
        {ctx.catModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => ctx.setCatModal(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-bold text-gray-900">Categorie personalizată</h2>
                <button onClick={() => ctx.setCatModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <form onSubmit={ctx.handleAddCustomCat} className="p-4 sm:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nume categorie *</label>
                  <input required value={ctx.catForm.name}
                    onChange={e => ctx.setCatForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: Quyền Duo Mixt"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Tip</label>
                    <select value={ctx.catForm.category_type}
                      onChange={e => ctx.setCatForm(f => ({ ...f, category_type: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                      <option value="solo">Solo (Quyền)</option>
                      <option value="team">Echipă (Song Luyện / Đa Luyện)</option>
                      <option value="fight">Luptă (Đối Kháng)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Gen</label>
                    <select value={ctx.catForm.gender}
                      onChange={e => ctx.setCatForm(f => ({ ...f, gender: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                      <option value="male">Masculin</option>
                      <option value="female">Feminin</option>
                      <option value="mixt">Mixt</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => ctx.setCatModal(null)}
                    className="rounded-lg px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 transition">Anulează</button>
                  <button type="submit" disabled={ctx.busy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">Creează categorie</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ CONFIRMATION MODAL ═══ */}
        {ctx.confirmModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => ctx.setConfirmModal(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-6 text-center">
                <div className="text-4xl mb-3">{ctx.confirmModal.icon || '⚠️'}</div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{ctx.confirmModal.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{ctx.confirmModal.message}</p>
                {ctx.confirmModal.detail && (
                  <p className="mt-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 max-h-20 overflow-y-auto">
                    {ctx.confirmModal.detail}
                  </p>
                )}
              </div>
              <div className="flex border-t border-gray-200">
                <button
                  onClick={() => ctx.setConfirmModal(null)}
                  className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition border-r border-gray-200"
                >Anulează</button>
                <button
                  onClick={ctx.confirmModal.onConfirm}
                  disabled={ctx.busy}
                  className={`flex-1 px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                    ctx.confirmModal.color === 'orange'
                      ? 'text-orange-600 hover:bg-orange-50'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >{ctx.confirmModal.confirmLabel || 'Confirmă'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ENROLLMENT PICKER POPOVER ═══ */}
        {ctx.enrollPickerCell && (() => {
          const { clubId, catId, rect } = ctx.enrollPickerCell;
          const isAllMode = clubId === null;
          const cacheKey = clubId ?? '__all__';
          const clubName = isAllMode ? 'Toți sportivii' : (ctx.clubs.find(c => c.id === clubId)?.name || '—');
          const cat = ctx.categories.find(c => c.id === catId);
          const catName = cat?.name || '—';
          const allClubAthletes = ctx.clubAthleteCache[cacheKey] || [];
          const isLoading = !ctx.clubAthleteCache[cacheKey];
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

          const top = Math.min(rect.bottom + 4, window.innerHeight - 360);
          const left = Math.min(rect.left, window.innerWidth - 280);

          return (
            <div ref={ctx.enrollPickerRef}
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[100] w-72 rounded-lg border border-gray-200 bg-white shadow-2xl"
              style={{ top, left }}
            >
              <div className="p-2 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wide truncate">{isAllMode ? '👥' : '🏛'} {clubName}</p>
                <p className="text-[9px] text-gray-400 truncate">{catName}</p>
                {hasDateRange && (
                  <p className="text-[8px] text-blue-500 mt-0.5">
                    📅 Născuți {dateStart} – {allowYounger ? '∞ (tineri acceptați)' : dateEnd}
                    {ctx.eventDateStr && <span className="text-gray-400 ml-1">· Eveniment: {ctx.eventDateStr}</span>}
                  </p>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-[10px] text-gray-400">Se încarcă…</div>
                ) : athleteList.length === 0 ? (
                  <div className="p-4 text-center text-[10px] text-gray-400 italic">
                    {hasDateRange
                      ? `Niciun sportiv din acest club nu se încadrează în intervalul de vârstă (${outOfRangeCount} exclu${outOfRangeCount === 1 ? 's' : 'și'}).`
                      : 'Niciun sportiv în acest club.'}
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
    </CentralizatorContext.Provider>
  );
}
