import React, { useContext, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CentralizatorContext, GENDER_BG, GENDER_LABELS } from './CategoriesLayout';
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui';

function formatGroupYears(group) {
  if (!group) return '';
  if (group.birth_year_start && group.birth_year_end) return `${group.birth_year_start} - ${group.birth_year_end}`;
  if (group.birth_year_start) return `${group.birth_year_start}+`;
  if (group.birth_year_end) return `până la ${group.birth_year_end}`;
  if (group.birth_date_start && group.birth_date_end) return `${group.birth_date_start} - ${group.birth_date_end}`;
  return '';
}

function formatGroupLabel(group) {
  if (!group) return 'Grupă';
  const years = formatGroupYears(group);
  return years ? `${group.name} (${years})` : group.name;
}

const MIN_ENTRIES = { solo: 3, team: 1 };

export default function TehnicaPage() {
  const ctx = useContext(CentralizatorContext);
  const [groupFilter, setGroupFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');

  // Collect solo/team categories that have enrolled athletes, deduplicated
  const techGroups = useMemo(() => {
    const seen = new Set();
    return (ctx?.columnStructure || [])
      .map(col => ({
        group: col.group,
        cats: col.cats.filter(c => {
          if (seen.has(c.id)) return false;
          if (c.type !== 'solo' && c.type !== 'team' && c.type !== 'teams') return false;
          seen.add(c.id);
          return true;
        }),
      }))
      .filter(g => g.cats.length > 0);
  }, [ctx?.columnStructure]);

  const catNameOptions = useMemo(
    () => [...new Set(techGroups.flatMap(tg => tg.cats.map(c => c.name)))].sort(),
    [techGroups],
  );
  const genderOptions = useMemo(
    () => [...new Set(techGroups.flatMap(tg => tg.cats.map(c => c.gender)))],
    [techGroups],
  );

  const filteredTechGroups = useMemo(() => {
    return techGroups
      .filter(tg => groupFilter === 'all' || String(tg.group.id) === groupFilter)
      .map(tg => ({
        group: tg.group,
        cats: tg.cats.filter(c => (catFilter === 'all' || c.name === catFilter) && (genderFilter === 'all' || c.gender === genderFilter)),
      }))
      .filter(tg => tg.cats.length > 0);
  }, [techGroups, groupFilter, catFilter, genderFilter]);

  if (!ctx) return null;

  const { busy, handleCellClick, handleUnenroll, handleTeamUnenroll, isEditLocked } = ctx;

  if (techGroups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm italic p-4 text-center">
        <span>📋 Nu există categorii de tip Solo sau Echipă. Creează-le din tab-ul Centralizator.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-3 md:p-4">
      <div inert={isEditLocked ? '' : undefined} className={isEditLocked ? 'opacity-95' : ''}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger aria-label="Filtrează după grupă" className="h-8 w-40 text-xs">
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
            <SelectTrigger aria-label="Filtrează după categorie" className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Categorie</SelectItem>
              {catNameOptions.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger aria-label="Filtrează după gen" className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Gen</SelectItem>
              {genderOptions.map(gender => (
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
            <div key={`tech-grp-${group.id}`} className="mb-4 flex flex-col gap-3 lg:grid lg:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {cats.map(cat => {
                const isTeamCategory = cat.type === 'team' || cat.type === 'teams';
                const enrolled = isTeamCategory
                  ? (cat.enrolled_teams || []).slice().sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''))
                  : (cat.enrolled_athletes || []).slice().sort((a, b) => {
                      const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
                      const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
                      return na.localeCompare(nb);
                    });
                const belowMin = enrolled.length < (isTeamCategory ? MIN_ENTRIES.team : MIN_ENTRIES.solo);

                return (
                  <div key={cat.id} className="border border-sidebar-border bg-card lg:overflow-hidden">
                    <div className="sticky top-0 z-10 bg-card">
                      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                        <span className="truncate">{formatGroupLabel(group)}</span>
                        {group.allowed_grade_type === 'inferior' && (
                          <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-medium text-amber-800" title="Doar grade inferioare (gradele superioare nu au voie)">Grade inf.</span>
                        )}
                        {group.allowed_grade_type === 'superior' && (
                          <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-medium text-emerald-800" title="Doar grade superioare">Grade sup.</span>
                        )}
                      </div>
                      <div className={`flex items-center justify-between gap-2 border-b border-sidebar-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground ${GENDER_BG[cat.gender] || 'bg-muted'}`}>
                        <span className="truncate">{cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}</span>
                        <span className={`shrink-0 rounded px-1 font-bold ${belowMin ? 'bg-red-100 text-red-700' : ''}`} title="Nr. participanți">{enrolled.length}</span>
                      </div>
                    </div>
                    <div className="border-b border-sidebar-border p-1.5">
                      <Button
                        size="sm"
                        onClick={(e) => handleCellClick(null, cat.id, e)}
                        className="w-full text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}
                      </Button>
                    </div>
                    <div className="divide-y divide-sidebar-border">
                      {enrolled.length === 0 ? (
                        <div className="px-2 py-2 text-xs italic text-muted-foreground">{isTeamCategory ? 'Nicio echipă înscrisă.' : 'Niciun sportiv înscris.'}</div>
                      ) : enrolled.map(entry => {
                        if (isTeamCategory) {
                          const memberNames = (entry.members || []).map(m => m.name).filter(Boolean).join(' & ');
                          const teamLabel = entry.team_name || memberNames || 'Echipă';
                          return (
                            <div key={entry.id} className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-foreground">{teamLabel}</div>
                                {memberNames && memberNames !== teamLabel && (
                                  <div className="truncate text-[10px] text-muted-foreground">{memberNames}</div>
                                )}
                                {entry.club_name && <div className="truncate text-[10px] text-muted-foreground">{entry.club_name}</div>}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleTeamUnenroll(entry.id, teamLabel, cat.name, e)}
                                disabled={busy}
                                aria-label={`Dezînscrie ${teamLabel}`}
                                title="Scoate echipa din categorie"
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        }
                        const athleteDetails = entry?.athlete_details;
                        const athleteName = athleteDetails ? `${athleteDetails.last_name || ''} ${athleteDetails.first_name || ''}`.trim() : '';
                        const clubName = athleteDetails?.club?.name || '';
                        return (
                          <div key={entry.id} className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
                            <div className="min-w-0 flex-1 truncate text-foreground">
                              {athleteName}
                              {clubName && <span className="text-muted-foreground"> ({clubName})</span>}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleUnenroll(entry.id, athleteName, cat.name, e)}
                              disabled={busy}
                              aria-label={`Dezînscrie ${athleteName}`}
                              title="Scoate sportivul din categorie"
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                            >
                              <X className="h-3 w-3" />
                            </button>
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
    </div>
  );
}
