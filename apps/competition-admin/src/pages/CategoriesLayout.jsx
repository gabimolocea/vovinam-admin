import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Spinner,
  formatGroupBadgeLabel,
  Button,
  Input,
  Label,
  Req,
  Checkbox,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui';
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
  const location = useLocation();
  const { id: eventId } = useParams();
  const preview = useDisplayPreview();
  const [teamSelection, setTeamSelection] = useState([]);
  const [teamBuilderBusy, setTeamBuilderBusy] = useState(false);
  const isDiplomeRoute = location.pathname.endsWith('/diplome');

  // Load fields for preview toggles
  useEffect(() => {
    if (eventId) preview.loadFields(eventId);
  }, [eventId]);

  useEffect(() => {
    setTeamSelection([]);
  }, [ctx.enrollPickerCell?.catId, ctx.enrollPickerCell?.clubId]);

  if (ctx.loading) return <div className="flex h-screen items-center justify-center bg-background"><Spinner /></div>;

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
      <div className="flex h-screen flex-col bg-background">

        {/* ═══ TOP BAR — responsive ═══ */}
        {!isDiplomeRoute && (
          <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b-2 border-sidebar-accent bg-sidebar px-2 py-2 text-sidebar-foreground sm:px-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/')}
                className="shrink-0 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
              >
                ← <span className="hidden sm:inline">Înapoi</span>
              </Button>
              <div className="hidden h-5 w-px bg-sidebar-accent/30 sm:block" />
              <Logo size={28} className="shrink-0 hidden sm:block" />
              <h1 className="truncate text-sm font-black uppercase tracking-wide text-sidebar-accent sm:text-base">
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
                      className={`border border-sidebar-border px-2 py-1 text-xs font-semibold transition ${
                        preview.isOpen(f.id)
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'bg-transparent text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground'
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
        )}

        {/* ═══ PAGE CONTENT — child route ═══ */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>

        {/* ═══ BOTTOM TAB BAR — responsive ═══ */}
        <div className="shrink-0 flex h-12 items-center gap-1 overflow-x-auto border-t-2 border-sidebar-accent bg-sidebar px-1.5 select-none">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `inline-flex items-center whitespace-nowrap border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all sm:px-4 sm:text-xs ${
                  isActive
                    ? 'z-10 border-sidebar-accent bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                    : 'border-sidebar-border bg-transparent text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground'
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
        <Dialog open={!!ctx.groupModal} onOpenChange={(open) => { if (!open) ctx.setGroupModal(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Grupă personalizată</DialogTitle>
            </DialogHeader>
            <form onSubmit={ctx.handleCustomGroup} className="space-y-4">
              <div>
                <Label className="mb-1 block">Nume grupă<Req /></Label>
                <Input required value={ctx.groupForm.name}
                  onChange={e => ctx.setGroupForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: U16 Special, Masters 40+"
                  autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Data nașterii — de la</Label>
                  <Input type="date" value={ctx.groupForm.birth_date_start}
                    onChange={e => ctx.setGroupForm(f => ({ ...f, birth_date_start: e.target.value }))} />
                </div>
                <div>
                  <Label className="mb-1 block">Data nașterii — până la</Label>
                  <Input type="date" value={ctx.groupForm.birth_date_end}
                    onChange={e => ctx.setGroupForm(f => ({ ...f, birth_date_end: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="group-allow-younger" checked={ctx.groupForm.allow_younger}
                  onCheckedChange={(checked) => ctx.setGroupForm(f => ({ ...f, allow_younger: checked === true }))} />
                <Label htmlFor="group-allow-younger" className="cursor-pointer font-normal">Permite sportivi mai tineri să urce la categorie superioară</Label>
              </div>
              {ctx.eventDateStr && (
                <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">Data evenimentului: {ctx.eventDateStr} · anul de referință: {ctx.eventYear}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => ctx.setGroupModal(null)}>Anulează</Button>
                <Button type="submit" disabled={ctx.busy}>Creează grupă</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ═══ CATEGORY CREATION MODAL ═══ */}
        <Dialog open={!!ctx.catModal} onOpenChange={(open) => { if (!open) ctx.setCatModal(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Categorie personalizată</DialogTitle>
            </DialogHeader>
            <form onSubmit={ctx.handleAddCustomCat} className="space-y-4">
              <div>
                <Label className="mb-1 block">Nume categorie<Req /></Label>
                <Input required value={ctx.catForm.name}
                  onChange={e => ctx.setCatForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Quyền Duo Mixt"
                  autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Tip</Label>
                  <Select value={ctx.catForm.category_type} onValueChange={(value) => ctx.setCatForm(f => ({ ...f, category_type: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solo">Solo (Quyền)</SelectItem>
                      <SelectItem value="team">Echipă (Song Luyện / Đa Luyện)</SelectItem>
                      <SelectItem value="fight">Luptă (Đối Kháng)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">Gen</Label>
                  <Select value={ctx.catForm.gender} onValueChange={(value) => ctx.setCatForm(f => ({ ...f, gender: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Masculin</SelectItem>
                      <SelectItem value="female">Feminin</SelectItem>
                      <SelectItem value="mixt">Mixt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => ctx.setCatModal(null)}>Anulează</Button>
                <Button type="submit" disabled={ctx.busy}>Creează categorie</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ═══ CONFIRMATION MODAL ═══ */}
        <Dialog open={!!ctx.confirmModal} onOpenChange={(open) => { if (!open) ctx.setConfirmModal(null); }}>
          <DialogContent className="max-w-md">
            {ctx.confirmModal && (
              <>
                <DialogHeader>
                  <DialogTitle>{ctx.confirmModal.title}</DialogTitle>
                </DialogHeader>
                <div>
                  <p className="text-sm leading-relaxed text-foreground">{ctx.confirmModal.message}</p>
                  {ctx.confirmModal.detail && (
                    <p className="mt-3 max-h-24 overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {ctx.confirmModal.detail}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => ctx.setConfirmModal(null)}>Anulează</Button>
                  <Button
                    onClick={ctx.confirmModal.onConfirm}
                    disabled={ctx.busy}
                    variant="destructive"
                    className={ctx.confirmModal.color === 'orange' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : ''}
                  >{ctx.confirmModal.confirmLabel || 'Confirmă'}</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ═══ ENROLLMENT PICKER MODAL ═══ */}
        <Dialog open={!!ctx.enrollPickerCell} onOpenChange={(open) => { if (!open) ctx.setEnrollPickerCell(null); }}>
          <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col p-0" ref={ctx.enrollPickerRef}>
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
            <>
              <DialogHeader className="border-b border-border px-6 py-4">
                <DialogTitle>{isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}</DialogTitle>
                <DialogDescription>{clubName}</DialogDescription>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline">{formatGroupBadgeLabel(group) || 'Grupă'}</Badge>
                  <Badge variant="outline">{catName}</Badge>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Se încarcă…</div>
                ) : athleteList.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground italic">
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
                        className={`w-full flex items-center gap-3 border-b border-border px-6 py-3 text-left transition-colors disabled:opacity-50 ${
                          isTeamCategory
                            ? isSelected
                              ? 'bg-blue-50 hover:bg-blue-100 text-foreground'
                              : 'hover:bg-accent text-foreground'
                            : isEnrolled
                              ? 'bg-green-50 hover:bg-green-100 text-foreground'
                              : 'hover:bg-accent text-foreground'
                        }`}
                      >
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-bold ${
                          isTeamCategory
                            ? isSelected
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'border-input text-transparent'
                            : isEnrolled
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-input text-transparent'
                        }`}>✓</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold">{ath.last_name} {ath.first_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{ath.club?.name || 'Fără club'}{dob ? ` · ${dob}` : ''}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {outOfRangeCount > 0 && (
                <div className="border-t border-border bg-amber-50 px-6 py-2 text-xs text-amber-800">
                  {outOfRangeCount} sportiv{outOfRangeCount === 1 ? '' : 'i'} {isAllMode ? 'din toate cluburile' : 'din club'} nu se încadrează în vârstă
                </div>
              )}
              {isTeamCategory && (
                <div className="border-t border-border bg-blue-50 px-6 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Echipă selectată</div>
                  <div className="mt-1 text-sm text-foreground">
                    {selectedAthletes.length > 0
                      ? selectedAthletes.map(ath => `${ath.first_name} ${ath.last_name}`).join(' & ')
                      : 'Selectează minimum 2 sportivi.'}
                  </div>
                  {duplicateTeam && (
                    <div className="mt-2 text-xs font-semibold text-red-600">
                      Echipa este deja înrolată în această categorie.
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={() => createTeamEnrollment(catId, teamSelection)}
                    disabled={!canSaveTeam}
                    className="mt-3 w-full"
                  >
                    {teamBuilderBusy ? 'Se înrolează...' : 'Înrolează echipa'}
                  </Button>
                </div>
              )}
              <DialogFooter className="border-t border-border px-6 py-3">
                <Button variant="outline" size="sm" onClick={() => ctx.setEnrollPickerCell(null)}>Închide</Button>
              </DialogFooter>
            </>
          );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </CentralizatorContext.Provider>
  );
}
