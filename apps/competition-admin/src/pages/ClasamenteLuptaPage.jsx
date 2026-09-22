import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { diplomaTemplateAPI } from '@shared/lib/api';
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

// Reads the same persisted CategoryAthlete.place BracketPage's medal
// display already trusts (set server-side by _set_category_place on
// match advance - see backend/api/views/matches.py), instead of
// independently re-walking the match tree and re-deriving a winner from
// match.winner/referee scores. That re-derivation could silently come up
// empty (e.g. a match imported/marked completed without the referee-score
// rows that back match.winner) even though the real placement was already
// recorded and the bracket page shows it correctly - which is exactly
// what produced an empty podium here while the pyramid showed a medal.
function buildPodiumFromEnrollment(category) {
  const podium = { 1: [], 2: [], 3: [] };
  (category.enrolled_athletes || []).forEach(enrollment => {
    const place = enrollment.place;
    if (place !== 1 && place !== 2 && place !== 3) return;
    const details = enrollment.athlete_details || {};
    const label = `${details.first_name || ''} ${details.last_name || ''}`.trim() || '—';
    const club = details.club?.name || details.club_name || '';
    podium[place].push({ id: enrollment.athlete, label, club });
  });
  return podium;
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

export default function ClasamenteLuptaPage() {
  const { id: eventId } = useParams();
  const ctx = useContext(CentralizatorContext);
  const [diplomaTemplates, setDiplomaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const columnStructure = ctx?.columnStructure ?? [];
  const categories = ctx?.categories ?? [];

  useEffect(() => {
    let isMounted = true;

    const loadDiplomaTemplates = async () => {
      setLoading(true);
      try {
        const { data: diplomaData } = await diplomaTemplateAPI.list({ event: eventId }).catch(() => ({ data: [] }));
        if (isMounted) setDiplomaTemplates(normalizeListPayload(diplomaData));
      } catch (error) {
        console.error('Failed to load diploma templates:', error);
        if (isMounted) setDiplomaTemplates([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDiplomaTemplates();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const fightGroups = useMemo(() => {
    const seenCatIds = new Set();
    return columnStructure
      .map(col => ({
        group: col.group,
        cats: col.cats.filter(cat => {
          if (seenCatIds.has(cat.id)) return false;
          if (cat.type !== 'fight') return false;
          seenCatIds.add(cat.id);
          return true;
        }),
      }))
      .filter(group => group.cats.length > 0);
  }, [columnStructure]);

  const podiumByCategory = useMemo(() => {
    const podiumMap = new Map();
    categories.forEach(category => {
      if (category.type !== 'fight') return;
      podiumMap.set(category.id, buildPodiumFromEnrollment(category));
    });
    return podiumMap;
  }, [categories]);

  const handleGenerateDiploma = async ({ category, group, place, athletes }) => {
    let template = resolveDiplomaTemplate(diplomaTemplates, { place, scope: 'fight' });
    if (!template) {
      try {
        const { data } = await diplomaTemplateAPI.list({ event: eventId });
        const freshTemplates = normalizeListPayload(data);
        setDiplomaTemplates(freshTemplates);
        template = resolveDiplomaTemplate(freshTemplates, { place, scope: 'fight' });
      } catch (error) {
        console.error('Failed to refresh diploma templates:', error);
      }
    }
    if (!template) {
      window.alert('Nu există niciun șablon de diplomă disponibil pentru acest eveniment. Configurează unul în tab-ul Diplome.');
      return;
    }

    const genderLabel = GENDER_LABELS[category.gender] || category.gender || '';
  const groupLabel = formatDiplomaGroupLabel(group);

    for (const athlete of athletes) {
      const values = {
        athlete_name: athlete.label,
        athlete_with_club: formatValueWithClub(athlete.label, athlete.club),
        club_name: athlete.club || '',
        team_name: '',
        team_with_club: '',
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
          fileName: `${values.place_label}-${athlete.label || category.name}`,
          previewWindow,
        });
      } catch (error) {
        if (previewWindow && !previewWindow.closed) previewWindow.close();
        console.error('Failed to generate diploma PDF:', error);
        window.alert(error.message || 'Nu s-a putut genera diploma.');
        break;
      }
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

  if (fightGroups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-sm italic text-muted-foreground p-4 text-center">
        <span>📋 Nu există categorii de tip Luptă pentru clasamente.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-2">
      {fightGroups.map(({ group, cats }) => (
        <div key={`clas-fight-${group.id}`} className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cats.map(cat => {
            const podium = podiumByCategory.get(cat.id) || { 1: [], 2: [], 3: [] };

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
                    <TableHead>Sportiv</TableHead>
                    <TableHead className="w-[96px]">Club</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3].map(place => {
                    const athletes = podium[place] || [];
                    const label = athletes.length ? athletes.map(item => item.label).join(place === 3 && athletes.length > 1 ? ' / ' : ', ') : '—';
                    const club = athletes.length ? athletes.map(item => item.club).filter(Boolean).join(place === 3 && athletes.length > 1 ? ' / ' : ', ') : '—';

                    return (
                      <TableRow key={`${cat.id}-${place}`}>
                        <TableCell className="text-center align-top">
                          <Badge className={PODIUM_STYLES[place]}>
                            {MEDALS[place]} Locul {place}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          <div className="font-medium">{label}</div>
                          {place === 3 && athletes.length > 1 && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">Loc împărțit între semifinaliști</div>
                          )}
                          {athletes.length > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerateDiploma({ category: cat, group, place, athletes })}
                              className="mt-2 border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 hover:bg-emerald-100"
                            >
                              {athletes.length > 1 ? `Generează ${athletes.length} diplome` : 'Generează diploma'}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{club}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!podium[1]?.length && !podium[2]?.length && !podium[3]?.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-4 text-center text-sm italic text-muted-foreground">
                        Podiumul nu este încă stabilit pentru această categorie.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            );
          })}
        </div>
      ))}
    </div>
  );
}
