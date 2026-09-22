import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { diplomaTemplateAPI, fieldAPI, scoreAPI } from '@shared/lib/api';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import {
  formatValueWithClub,
  formatDiplomaGroupLabel,
  formatDiplomaGroupWithGender,
  generateDiplomaPdf,
  getPlaceLabel,
  resolveDiplomaTemplate,
} from '../lib/diplomas';
import { Badge, Button, Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';

const PODIUM_STYLES = {
  1: 'border-transparent bg-yellow-100 text-yellow-900',
  2: 'border-transparent bg-gray-100 text-gray-800',
  3: 'border-transparent bg-amber-100 text-amber-900',
};

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function normalizeListPayload(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function getNumericScore(result) {
  const raw = getDisplayTotal(result);
  const value = raw == null ? Number.NEGATIVE_INFINITY : Number(raw);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function getDisplayTotal(result) {
  const refereeScores = Array.isArray(result?.referee_scores) ? result.referee_scores : [];
  const numericScores = refereeScores
    .map(score => Number(score?.score))
    .filter(value => Number.isFinite(value));

  if (numericScores.length >= 3) {
    const sorted = [...numericScores].sort((a, b) => a - b);
    return sorted.slice(1, -1).reduce((sum, value) => sum + value, 0);
  }

  if (numericScores.length > 0) {
    return numericScores.reduce((sum, value) => sum + value, 0);
  }

  return null;
}

function getParticipantLabel(result) {
  if (!result) return '—';
  if (result.team_name) return result.team_name;
  if (result.athlete?.name) return result.athlete.name;
  if (Array.isArray(result.team_members) && result.team_members.length > 0) {
    return result.team_members.map(member => member.name).join(' & ');
  }
  return '—';
}

function getParticipantDetail(result) {
  if (!result) return '';
  if (Array.isArray(result.team_members) && result.team_members.length > 0) {
    return result.team_members.map(member => member.name).join(' & ');
  }
  return result.type === 'teams' ? 'Rezultat de echipă' : 'Rezultat individual';
}

function getResultClubLabel(result, athleteClubMap) {
  if (!result) return '—';

  if (Array.isArray(result.team_members) && result.team_members.length > 0) {
    const clubs = result.team_members
      .map(member => athleteClubMap.get(member.id)?.name)
      .filter(Boolean);
    const uniqueClubs = [...new Set(clubs)];
    return uniqueClubs.length ? uniqueClubs.join(' / ') : '—';
  }

  const athleteId = result.athlete?.id ?? result.athlete;
  return athleteClubMap.get(athleteId)?.name || '—';
}

function GroupHeader({ group }) {
  return (
    <>
      {group.name}
      {(group.birth_date_start || group.birth_year_start) && (
        <span className="font-normal ml-1">
          ( {group.birth_date_start
            ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
            : `${group.birth_year_start}–${group.birth_year_end}`} )
        </span>
      )}
      {group.allowed_grade_type === 'inferior' && (
        <Badge className="ml-1.5 border-transparent bg-amber-500/20 text-[8px] text-amber-800">
          Grade inferioare
        </Badge>
      )}
      {group.allowed_grade_type === 'superior' && (
        <Badge className="ml-1.5 border-transparent bg-emerald-500/20 text-[8px] text-emerald-800">
          Grade superioare
        </Badge>
      )}
    </>
  );
}

export default function ClasamenteTehnicaPage() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const ctx = useContext(CentralizatorContext);
  const [scores, setScores] = useState([]);
  const [fieldAssignments, setFieldAssignments] = useState([]);
  const [diplomaTemplates, setDiplomaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const columnStructure = ctx?.columnStructure ?? [];
  const categories = ctx?.categories ?? [];

  useEffect(() => {
    let isMounted = true;

    const loadScores = async () => {
      setLoading(true);
      try {
        const [{ data: scoreData }, { data: assignmentData }, { data: diplomaData }] = await Promise.all([
          scoreAPI.list({ event_id: eventId }),
          fieldAPI.assignments.list({ event_id: eventId }).catch(() => ({ data: [] })),
          diplomaTemplateAPI.list({ event: eventId }).catch(() => ({ data: [] })),
        ]);
        if (isMounted) {
          setScores(normalizeListPayload(scoreData));
          setFieldAssignments(normalizeListPayload(assignmentData));
          setDiplomaTemplates(normalizeListPayload(diplomaData));
        }
      } catch (error) {
        console.error('Failed to load technique rankings:', error);
        if (isMounted) {
          setScores([]);
          setFieldAssignments([]);
          setDiplomaTemplates([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadScores();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const techniqueGroups = useMemo(() => {
    const seenCatIds = new Set();
    return columnStructure
      .map(col => ({
        group: col.group,
        cats: col.cats.filter(cat => {
          if (seenCatIds.has(cat.id)) return false;
          if (cat.type !== 'solo' && cat.type !== 'team') return false;
          seenCatIds.add(cat.id);
          return true;
        }),
      }))
      .filter(group => group.cats.length > 0);
  }, [columnStructure]);

  const rankingsByCategory = useMemo(() => {
    const grouped = new Map();

    scores
      .filter(result => result?.status !== 'rejected' && getDisplayTotal(result) != null)
      .forEach(result => {
        if (!grouped.has(result.category)) grouped.set(result.category, []);
        grouped.get(result.category).push(result);
      });

    grouped.forEach(results => {
      results.sort((a, b) => getNumericScore(b) - getNumericScore(a));
    });

    return grouped;
  }, [scores]);

  const athleteClubMap = useMemo(() => {
    const map = new Map();
    categories.forEach(category => {
      (category.enrolled_athletes || []).forEach(enrollment => {
        const athleteId = enrollment.athlete;
        const details = enrollment.athlete_details || {};
        const club = details.club || null;
        const clubName = club?.name || details.club_name || '';
        if (athleteId && clubName) {
          map.set(athleteId, { id: club?.id ?? clubName, name: clubName });
        }
      });
    });
    return map;
  }, [categories]);

  const fieldByCategory = useMemo(() => {
    const map = new Map();
    fieldAssignments.forEach(assignment => {
      if (assignment.category && assignment.field && !map.has(assignment.category)) {
        map.set(assignment.category, assignment.field);
      }
    });
    return map;
  }, [fieldAssignments]);

  const handleGenerateDiploma = async ({ category, group, place, result }) => {
    let template = resolveDiplomaTemplate(diplomaTemplates, { place, scope: category.type });
    if (!template) {
      try {
        const { data } = await diplomaTemplateAPI.list({ event: eventId });
        const freshTemplates = normalizeListPayload(data);
        setDiplomaTemplates(freshTemplates);
        template = resolveDiplomaTemplate(freshTemplates, { place, scope: category.type });
      } catch (error) {
        console.error('Failed to refresh diploma templates:', error);
      }
    }
    if (!template) {
      window.alert('Nu există niciun șablon de diplomă disponibil pentru acest eveniment. Configurează unul în tab-ul Diplome.');
      return;
    }

    const participantLabel = getParticipantLabel(result);
    const clubLabel = getResultClubLabel(result, athleteClubMap);
    const genderLabel = GENDER_LABELS[category.gender] || category.gender || '';
    const groupLabel = formatDiplomaGroupLabel(group);
    const isTeamCategory = category.type === 'team';
    const values = {
      athlete_name: isTeamCategory ? '' : participantLabel,
      athlete_with_club: isTeamCategory ? '' : formatValueWithClub(participantLabel, clubLabel),
      club_name: clubLabel,
      team_name: isTeamCategory ? participantLabel : '',
      team_with_club: isTeamCategory ? formatValueWithClub(participantLabel, clubLabel) : '',
      group_name: groupLabel,
      group_with_gender: formatDiplomaGroupWithGender(group, genderLabel),
      category_name: category.name,
      gender: genderLabel,
      event_name: ctx?.eventData?.name || `Competiția #${eventId}`,
      place_label: getPlaceLabel(place),
    };

    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow && previewWindow.document) {
      previewWindow.document.write('<title>Generare diplomă</title><p style="font-family: sans-serif; padding: 16px;">Se generează diploma...</p>');
      previewWindow.document.close();
    }
    try {
      await generateDiplomaPdf({
        template,
        values,
        fileName: `${values.place_label}-${participantLabel || category.name}`,
        previewWindow,
      });
    } catch (error) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      console.error('Failed to generate diploma PDF:', error);
      window.alert(error.message || 'Nu s-a putut genera diploma.');
    }
  };

  if (!ctx) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  if (techniqueGroups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-sm italic text-muted-foreground p-4 text-center">
        <span>📋 Nu există categorii de tip Solo sau Echipă pentru clasamente.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-2">
      {techniqueGroups.map(({ group, cats }) => (
        <div key={`clas-tech-${group.id}`} className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cats.map(cat => {
            const results = (rankingsByCategory.get(cat.id) || []).slice(0, 3);

            return (
              <Table key={cat.id}>
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={3} className="bg-muted text-center text-sm text-foreground">
                      <GroupHeader group={group} />
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead
                      colSpan={3}
                      className={
                        cat.gender === 'male'
                          ? 'bg-blue-100 text-blue-900'
                          : cat.gender === 'female'
                            ? 'bg-pink-100 text-pink-900'
                            : 'bg-amber-100 text-amber-900'
                      }
                    >
                      Clasament · {cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[72px] text-center">Loc</TableHead>
                    <TableHead>Sportiv / Echipă</TableHead>
                    <TableHead className="w-[120px]">Club</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3].map(place => {
                    const result = results[place - 1];
                    return (
                      <TableRow key={`${cat.id}-${place}`}>
                        <TableCell className="text-center">
                          <Badge className={PODIUM_STYLES[place]}>
                            {MEDALS[place]} Locul {place}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          <div className="font-medium">{getParticipantLabel(result)}</div>
                          {result && (
                            <>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{getParticipantDetail(result)}</div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleGenerateDiploma({ category: cat, group, place, result })}
                                className="mt-2 border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 hover:bg-emerald-100"
                              >
                                Generează diploma
                              </Button>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getResultClubLabel(result, athleteClubMap)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!results.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-4 text-center text-sm italic text-muted-foreground">
                        Rezultatele nu sunt încă disponibile pentru această probă.
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const fieldId = fieldByCategory.get(cat.id);
                          if (!fieldId) return;
                          navigate(`/competitions/${eventId}/live-fullscreen?field=${fieldId}&panel=category&id=${cat.id}`);
                        }}
                        disabled={!fieldByCategory.get(cat.id)}
                        className="w-full border-blue-200 bg-blue-50 text-xs text-blue-700 hover:bg-blue-100 disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {fieldByCategory.get(cat.id) ? 'Vezi informații' : 'Vezi informații indisponibil'}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            );
          })}
        </div>
      ))}
    </div>
  );
}
