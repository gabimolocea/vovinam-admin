import React, { useContext } from 'react';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';

export default function TehnicaPage() {
  const ctx = useContext(CentralizatorContext);
  if (!ctx) return null;

  const {
    columnStructure, busy,
    handleCellClick, handleUnenroll,
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
      <div className="flex-1 flex items-center justify-center bg-white text-gray-400 text-sm italic p-4 text-center">
        <span>📋 Nu există categorii de tip Solo sau Echipă. Creează-le din tab-ul Centralizator.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-2">
      {techGroups.map(({ group, cats }) => (
        <div key={`tech-grp-${group.id}`} className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cats.map(cat => {
            const enrolled = (cat.enrolled_athletes || []).slice().sort((a, b) => {
              const na = `${a.athlete_details?.last_name || ''} ${a.athlete_details?.first_name || ''}`;
              const nb = `${b.athlete_details?.last_name || ''} ${b.athlete_details?.first_name || ''}`;
              return na.localeCompare(nb);
            });

            return (
              <div key={cat.id} className="overflow-x-auto">
                <table className="border-collapse text-sm w-full">
                  <thead>
                    <tr>
                      <th colSpan={2}
                        className="bg-yellow-300 border border-black px-2 sm:px-3 py-1.5 text-center font-bold text-sm text-gray-900">
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
                      </th>
                    </tr>
                    <tr>
                      <th className="bg-gray-200 border border-black px-2 py-1.5 text-left font-bold text-xs text-gray-900 uppercase tracking-wide w-[40px] sm:w-[60px]">
                        PROBA
                      </th>
                      <th className={`border border-black px-2 py-1.5 text-left font-bold text-xs uppercase tracking-wide ${
                        cat.gender === 'male' ? 'bg-blue-100 text-blue-900' : cat.gender === 'female' ? 'bg-pink-100 text-pink-900' : 'bg-amber-100 text-amber-900'
                      }`}>
                        {cat.name} - {GENDER_LABELS[cat.gender] || cat.gender}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolled.map((ath, rowIdx) => {
                      const athleteDetails = ath?.athlete_details;
                      const athleteName = athleteDetails
                        ? `${athleteDetails.last_name || ''} ${athleteDetails.first_name || ''}`.trim()
                        : '';
                      const clubName = athleteDetails?.club?.name || '';
                      return (
                        <tr key={ath.id}>
                          <td className="border border-black/30 px-1 py-0.5 text-xs w-[30px] text-center text-gray-500 bg-gray-50">
                            {rowIdx + 1}
                          </td>
                          <td className="border border-black/30 px-1 py-0.5 text-sm text-gray-900">
                            <span className="flex items-center justify-between group/ath">
                              <span className="truncate">
                                {athleteName}
                                {clubName && <span className="text-gray-400 ml-1">({clubName})</span>}
                              </span>
                              <button
                                onClick={(e) => handleUnenroll(ath.id, athleteName, cat.name, e)}
                                disabled={busy}
                                className="hidden group-hover/ath:inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none hover:bg-red-600 disabled:opacity-40 shrink-0 ml-1"
                                title="Scoate sportivul din categorie"
                              >×</button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* + Adaugă row */}
                    <tr>
                      <td className="border border-black/20 px-1 py-0.5 w-[30px] bg-gray-50"></td>
                      <td
                        className="border border-black/20 px-1 py-1 cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={(e) => handleCellClick(null, cat.id, e)}
                      >
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 text-sm font-bold hover:bg-green-500 hover:text-white transition-colors">+</span>
                      </td>
                    </tr>
                    {/* Total row */}
                    <tr className="border-t-2 border-black">
                      <td className="border border-black px-2 py-1.5 font-bold text-xs text-gray-900 bg-gray-100 text-center">
                        TOTAL
                      </td>
                      <td className="border border-black px-2 py-1.5 font-bold text-sm text-gray-900 bg-gray-100">
                        {enrolled.length}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
