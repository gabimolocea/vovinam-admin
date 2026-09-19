import React, { useContext } from 'react';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui';

export default function TehnicaPage() {
  const ctx = useContext(CentralizatorContext);
  if (!ctx) return null;

  const {
    columnStructure, busy,
    handleCellClick, handleUnenroll, handleTeamUnenroll,
    isEditLocked,
  } = ctx;

  // Collect solo/team categories that have enrolled athletes, deduplicated
  const seenCatIds = new Set();
  const techGroups = columnStructure
    .map(col => ({
      group: col.group,
      cats: col.cats.filter(c => {
        if (seenCatIds.has(c.id)) return false;
        if (c.type !== 'solo' && c.type !== 'team') return false;
        seenCatIds.add(c.id);
        return true;
      }),
    }))
    .filter(g => g.cats.length > 0);

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
      {techGroups.map(({ group, cats }) => (
        <div key={`tech-grp-${group.id}`} className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cats.map(cat => {
            const isTeamCategory = cat.type === 'team';
            const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
              const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
              const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
              return na.localeCompare(nb);
            });
            const enrolledTeams = (cat.enrolled_teams || []).slice().sort((a, b) => {
              const na = a.team_name || '';
              const nb = b.team_name || '';
              return na.localeCompare(nb);
            });
            const totalEntries = isTeamCategory ? enrolledTeams.length : enrolled.length;

            return (
              <div key={cat.id}>
                <Table className="border-collapse">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead colSpan={3}
                        className="bg-secondary text-secondary-foreground border border-border px-2 sm:px-3 py-1.5 text-center font-bold text-sm normal-case h-auto">
                        {group.name}
                        {(group.birth_date_start || group.birth_year_start) && (
                          <span className="font-normal ml-1">
                            ( {group.birth_date_start
                              ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
                              : `${group.birth_year_start}–${group.birth_year_end}`} )
                          </span>
                        )}
                        {group.allowed_grade_type === 'inferior' && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/20 text-amber-800 text-[8px] font-medium px-1.5 py-0.5" title="Doar grade inferioare (gradele superioare nu au voie)">
                            Grade inferioare
                          </span>
                        )}
                        {group.allowed_grade_type === 'superior' && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-800 text-[8px] font-medium px-1.5 py-0.5" title="Doar grade superioare">
                            Grade superioare
                          </span>
                        )}
                      </TableHead>
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="bg-muted border border-border px-2 py-1.5 text-left font-bold text-xs text-foreground w-[40px] sm:w-[60px] h-auto">
                        PROBA
                      </TableHead>
                      <TableHead className={`border border-border px-2 py-1.5 text-left font-bold text-xs h-auto ${
                        cat.gender === 'male' ? 'bg-blue-100 text-blue-900' : cat.gender === 'female' ? 'bg-pink-100 text-pink-900' : 'bg-amber-100 text-amber-900'
                      }`}>
                        {cat.name} - {GENDER_LABELS[cat.gender] || cat.gender}
                      </TableHead>
                      <TableHead className="bg-muted border border-border px-1 py-1.5 text-center font-bold text-[10px] text-foreground/90 w-[30px] h-auto"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTeamCategory ? enrolledTeams.map((team, rowIdx) => {
                      const memberNames = (team.members || []).map(member => member.name).join(' & ');
                      const teamLabel = team.team_name || memberNames || 'Echipă';
                      const clubName = team.club_name || '';
                      return (
                        <TableRow key={team.id}>
                          <TableCell className="border border-border/60 px-1 py-0.5 text-xs w-[30px] text-center text-muted-foreground bg-muted/40">
                            {rowIdx + 1}
                          </TableCell>
                          <TableCell className="border border-border/60 px-1 py-0.5 text-sm text-foreground">
                            <span className="block font-semibold">
                              {teamLabel}
                            </span>
                            {memberNames && memberNames !== teamLabel && (
                              <span className="block text-xs text-muted-foreground">{memberNames}</span>
                            )}
                            {clubName && <span className="block text-xs text-muted-foreground">{clubName}</span>}
                          </TableCell>
                          <TableCell className="w-[44px] border border-border/60 px-0.5 py-0.5 text-center">
                            <button
                              onClick={(e) => handleTeamUnenroll(team.id, teamLabel, cat.name, e)}
                              disabled={busy}
                              className="inline-flex h-11 w-11 items-center justify-center border border-destructive/40 bg-destructive text-base font-black leading-none text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-40"
                              title="Scoate echipa din categorie"
                            >×</button>
                          </TableCell>
                        </TableRow>
                      );
                    }) : enrolled.map((ath, rowIdx) => {
                      const athleteDetails = ath?.athlete_details;
                      const athleteName = athleteDetails
                        ? `${athleteDetails.last_name || ''} ${athleteDetails.first_name || ''}`.trim()
                        : '';
                      const clubName = athleteDetails?.club?.name || '';
                      return (
                        <TableRow key={ath.id}>
                          <TableCell className="border border-border/60 px-1 py-0.5 text-xs w-[30px] text-center text-muted-foreground bg-muted/40">
                            {rowIdx + 1}
                          </TableCell>
                          <TableCell className="border border-border/60 px-1 py-0.5 text-sm text-foreground">
                            <span className="block truncate">
                                {athleteName}
                                {clubName && <span className="text-muted-foreground ml-1">({clubName})</span>}
                            </span>
                          </TableCell>
                          <TableCell className="w-[44px] border border-border/60 px-0.5 py-0.5 text-center">
                            <button
                              onClick={(e) => handleUnenroll(ath.id, athleteName, cat.name, e)}
                              disabled={busy}
                              className="inline-flex h-11 w-11 items-center justify-center border border-destructive/40 bg-destructive text-base font-black leading-none text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-40"
                              title="Scoate sportivul din categorie"
                            >×</button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* + Adaugă row */}
                    <TableRow>
                      <TableCell className="border border-border/40 px-1 py-0.5 w-[30px] bg-muted/40"></TableCell>
                      <TableCell
                        className="border border-border/40 px-2 py-1.5 cursor-pointer hover:bg-accent transition-colors"
                        onClick={(e) => handleCellClick(null, cat.id, e)}
                      >
                        <span className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/40 bg-white/15 text-sm leading-none">+</span>
                          {isTeamCategory ? 'Adaugă echipă' : 'Adaugă sportiv'}
                        </span>
                      </TableCell>
                      <TableCell className="border border-border/40 px-0.5 py-0.5 w-[30px] bg-muted/40"></TableCell>
                    </TableRow>
                    {/* Total row */}
                    <TableRow className="border-t-2 border-border">
                      <TableCell className="border border-border px-2 py-1.5 font-bold text-xs text-foreground bg-muted text-center">
                        TOTAL
                      </TableCell>
                      <TableCell className={`border border-border px-2 py-1.5 font-bold text-sm ${totalEntries < (isTeamCategory ? 1 : 3) ? 'bg-red-100 text-red-700' : 'bg-muted text-foreground'}`}>
                        {totalEntries}
                      </TableCell>
                      <TableCell className={`w-[44px] border border-border px-0.5 py-0.5 ${totalEntries < (isTeamCategory ? 1 : 3) ? 'bg-red-100' : 'bg-muted'}`}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      ))}
      </div>
    </div>
  );
}
