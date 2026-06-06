import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '@shared/components/ui';
import { diplomaTemplateAPI } from '@shared/lib/api';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';
import {
  formatDiplomaGroupLabel,
  formatDiplomaGroupWithGender,
  formatValueWithClub,
  generateCombinedDiplomaPdf,
  generateDiplomaPdf,
  getPlaceLabel,
  normalizeDiplomaScope,
  resolveDiplomaTemplate,
} from '../lib/diplomas';

function normalizeListPayload(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function buildCategorySummary(categories) {
  if (!categories.length) return '—';
  if (categories.length <= 2) return categories.join(', ');
  return `${categories.slice(0, 2).join(', ')} +${categories.length - 2}`;
}

export default function ClasamentSportiviInscrisiPage() {
  const { id: eventId } = useParams();
  const ctx = useContext(CentralizatorContext);
  const [diplomaTemplates, setDiplomaTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const { data } = await diplomaTemplateAPI.list({ event: eventId }).catch(() => ({ data: [] }));
        if (isMounted) setDiplomaTemplates(normalizeListPayload(data));
      } finally {
        if (isMounted) setLoadingTemplates(false);
      }
    };

    loadTemplates();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const groupMap = useMemo(() => {
    const map = new Map();
    (ctx?.groups || []).forEach((group) => map.set(group.id, group));
    return map;
  }, [ctx?.groups]);

  const enrolledAthletes = useMemo(() => {
    const athleteMap = new Map();

    (ctx?.categories || []).forEach((category) => {
      const normalizedType = normalizeDiplomaScope(category.type);
      const group = groupMap.get(category.group) || null;
      const genderLabel = GENDER_LABELS[category.gender] || category.gender || '';

      (category.enrolled_athletes || []).forEach((enrollment) => {
        const details = enrollment.athlete_details || {};
        const athleteId = details.id || enrollment.athlete;
        if (!athleteId) return;
        const athleteName = `${details.last_name || ''} ${details.first_name || ''}`.trim() || details.name || `Sportiv #${athleteId}`;
        const clubName = details.club?.name || details.club_name || '';
        if (!athleteMap.has(athleteId)) {
          athleteMap.set(athleteId, {
            id: athleteId,
            athleteName,
            clubName,
            enrollmentTypes: new Set(),
            categoryNames: new Set(),
            group,
            genderLabel,
          });
        }
        const athlete = athleteMap.get(athleteId);
        athlete.enrollmentTypes.add(normalizedType);
        athlete.categoryNames.add(category.name);
        athlete.group = athlete.group || group;
        athlete.genderLabel = athlete.genderLabel || genderLabel;
        athlete.clubName = athlete.clubName || clubName;
      });

      (category.enrolled_teams || []).forEach((teamEnrollment) => {
        (teamEnrollment.members || []).forEach((member) => {
          const athleteId = member.id;
          if (!athleteId) return;
          const athleteName = member.name || `${member.last_name || ''} ${member.first_name || ''}`.trim() || `Sportiv #${athleteId}`;
          const clubName = member.club?.name || teamEnrollment.club_name || '';
          if (!athleteMap.has(athleteId)) {
            athleteMap.set(athleteId, {
              id: athleteId,
              athleteName,
              clubName,
              enrollmentTypes: new Set(),
              categoryNames: new Set(),
              group,
              genderLabel,
            });
          }
          const athlete = athleteMap.get(athleteId);
          athlete.enrollmentTypes.add('team');
          athlete.categoryNames.add(category.name);
          athlete.group = athlete.group || group;
          athlete.genderLabel = athlete.genderLabel || genderLabel;
          athlete.clubName = athlete.clubName || clubName;
        });
      });
    });

    return Array.from(athleteMap.values())
      .map((athlete) => ({
        ...athlete,
        enrollmentTypes: Array.from(athlete.enrollmentTypes),
        categoryNames: Array.from(athlete.categoryNames).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => {
        const clubCompare = (a.clubName || '').localeCompare(b.clubName || '');
        if (clubCompare !== 0) return clubCompare;
        return a.athleteName.localeCompare(b.athleteName);
      });
  }, [ctx?.categories, groupMap]);

  const buildParticipationValues = (athlete) => {
    const preferredScope = athlete.enrollmentTypes.length === 1 ? athlete.enrollmentTypes[0] : 'all';
    return {
      scope: preferredScope,
      values: {
        athlete_name: athlete.athleteName,
        athlete_with_club: formatValueWithClub(athlete.athleteName, athlete.clubName),
        club_name: athlete.clubName,
        team_name: '',
        team_with_club: '',
        group_name: formatDiplomaGroupLabel(athlete.group),
        group_with_gender: formatDiplomaGroupWithGender(athlete.group, athlete.genderLabel),
        category_name: buildCategorySummary(athlete.categoryNames),
        gender: athlete.genderLabel,
        event_name: ctx?.eventData?.name || `Competiția #${eventId}`,
        place_label: getPlaceLabel(0),
      },
    };
  };

  const generateParticipationDiploma = async (athlete) => {
    const participation = buildParticipationValues(athlete);
    const template = resolveDiplomaTemplate(diplomaTemplates, { place: 0, scope: participation.scope });
    if (!template) {
      window.alert('Nu există un șablon de diplomă de participare disponibil. Configurează unul în tab-ul Diplome.');
      return;
    }

    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow?.document) {
      previewWindow.document.write('<title>Generare diplomă participare</title><p style="font-family: sans-serif; padding: 16px;">Se generează diploma de participare...</p>');
      previewWindow.document.close();
    }

    try {
      await generateDiplomaPdf({
        template,
        values: participation.values,
        fileName: `${participation.values.place_label}-${athlete.athleteName}`,
        previewWindow,
      });
    } catch (error) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      console.error('Failed to generate participation diploma:', error);
      window.alert(error.message || 'Nu s-a putut genera diploma de participare.');
    }
  };

  const handleGenerateAll = async () => {
    if (!enrolledAthletes.length) return;
    if (!window.confirm(`Generezi un singur PDF cu ${enrolledAthletes.length} diplome de participare, câte o pagină pentru fiecare sportiv?`)) {
      return;
    }
    setGeneratingAll(true);
    try {
      const previewWindow = window.open('about:blank', '_blank');
      if (previewWindow?.document) {
        previewWindow.document.write('<title>Generare diplome participare</title><p style="font-family: sans-serif; padding: 16px;">Se generează PDF-ul cu toate diplomele de participare...</p>');
        previewWindow.document.close();
      }

      const diplomaJobs = enrolledAthletes.map((athlete) => {
        const participation = buildParticipationValues(athlete);
        const template = resolveDiplomaTemplate(diplomaTemplates, { place: 0, scope: participation.scope });
        return template ? { template, values: participation.values } : null;
      }).filter(Boolean);

      if (!diplomaJobs.length) {
        if (previewWindow && !previewWindow.closed) previewWindow.close();
        window.alert('Nu există un șablon de diplomă de participare disponibil. Configurează unul în tab-ul Diplome.');
        return;
      }

      await generateCombinedDiplomaPdf(diplomaJobs, previewWindow);
    } catch (error) {
      console.error('Failed to generate combined participation diplomas:', error);
      window.alert(error.message || 'Nu s-a putut genera PDF-ul cu diplomele de participare.');
    } finally {
      setGeneratingAll(false);
    }
  };

  if (!ctx) return null;
  if (ctx.loading || loadingTemplates) {
    return <div className="flex flex-1 items-center justify-center bg-white"><Spinner /></div>;
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-3 md:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">Sportivi înscriși</h2>
          <p className="text-xs text-gray-500">Apar o singură dată sportivii înscriși la cel puțin o probă, ordonați după club.</p>
        </div>
        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={generatingAll || enrolledAthletes.length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {generatingAll ? 'Se generează...' : 'Generează toate diplomele de participare'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-xs font-bold uppercase tracking-wide text-gray-700">
              <th className="border-b border-gray-200 px-3 py-2">Nume</th>
              <th className="border-b border-gray-200 px-3 py-2">Club</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right">Acțiune</th>
            </tr>
          </thead>
          <tbody>
            {enrolledAthletes.map((athlete) => (
              <tr key={athlete.id} className="odd:bg-white even:bg-gray-50">
                <td className="border-b border-gray-100 px-3 py-2 text-gray-900">{athlete.athleteName}</td>
                <td className="border-b border-gray-100 px-3 py-2 font-medium text-gray-900">{athlete.clubName || '—'}</td>
                <td className="border-b border-gray-100 px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => generateParticipationDiploma(athlete)}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Generează diploma participare
                  </button>
                </td>
              </tr>
            ))}
            {enrolledAthletes.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm italic text-gray-400">
                  Nu există sportivi înscriși la probe pentru acest eveniment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
