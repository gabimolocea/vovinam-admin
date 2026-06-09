import * as XLSX from 'xlsx';

/**
 * Exports match data to a multi-sheet Excel file.
 * Sheets: Scoruri Arbitri, Evenimente, Timeline Puncte
 */
export function exportMatchExcel({ match, matchRounds, matchRefScores, matchEvents, pointEvents, matchRefSlots }) {
  const wb = XLSX.utils.book_new();
  const matchName = `${match.red_corner_full_name || 'Rosu'} vs ${match.blue_corner_full_name || 'Albastru'}`;
  const safeFileName = matchName.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);

  // ── HELPERS ──────────────────────────────────────────────────────────────
  const fmt = (v) => v != null ? v : '—';
  const fmtScore = (v) => v != null ? Number(v) : '—';
  const fmtTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Map referee id → name
  const refNameMap = {};
  (matchRefSlots || []).forEach(r => { if (r.id) refNameMap[r.id] = r.name || `A${r.pos}`; });

  // Map round id → round_number
  const roundNumMap = {};
  (matchRounds || []).forEach(r => { roundNumMap[r.id] = r.round_number; });

  // Warnings/penalties for totals
  const warningsRed = (matchEvents || []).filter(e => e.event_type === 'warning_red').length;
  const warningsBlue = (matchEvents || []).filter(e => e.event_type === 'warning_blue').length;
  const totalBonusRed = (matchEvents || []).filter(e => e.event_type === 'bonus_red').reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusBlue = (matchEvents || []).filter(e => e.event_type === 'bonus_blue').reduce((s, e) => s + (e.value || 0), 0);
  const warningPenaltyRed = warningsRed * -2;
  const warningPenaltyBlue = warningsBlue * -2;

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET 1: Scoruri Arbitri
  // ─────────────────────────────────────────────────────────────────────────
  const refRows = [];

  // Header row 1: match info
  refRows.push([`Meci: ${matchName}`, '', '', '', '', '', '']);
  refRows.push(['Data export:', new Date().toLocaleString('ro-RO'), '', '', '', '', '']);
  refRows.push([]);

  // Column headers
  const roundHeaders = (matchRounds || []).flatMap(r => [`R${r.round_number} Roșu`, `R${r.round_number} Albastru`]);
  refRows.push(['Arbitru', 'Pos', ...roundHeaders, 'TOTAL Roșu', 'TOTAL Albastru', 'Decizie']);

  const refTotalsRed = {};
  const refTotalsBlue = {};

  (matchRefSlots || []).forEach(ref => {
    const refScores = (matchRefScores || []).filter(s => s.referee === ref.id);
    const roundScores = refScores.filter(s => s.round != null);
    const decision = refScores.find(s => s.winner_choice && s.round == null)?.winner_choice;

    const roundCells = (matchRounds || []).flatMap(r => {
      const rs = roundScores.find(s => s.round === r.id);
      return [fmtScore(rs?.red_corner_score), fmtScore(rs?.blue_corner_score)];
    });

    const totalRed = roundScores.reduce((s, rs) => s + Number(rs.red_corner_score || 0), 0);
    const totalBlue = roundScores.reduce((s, rs) => s + Number(rs.blue_corner_score || 0), 0);
    refTotalsRed[ref.id] = totalRed;
    refTotalsBlue[ref.id] = totalBlue;

    refRows.push([
      ref.name || `Arbitru ${ref.pos}`,
      `A${ref.pos}`,
      ...roundCells,
      totalRed,
      totalBlue,
      decision === 'red' ? `Roșu (${match.red_corner_full_name || ''})` : decision === 'blue' ? `Albastru (${match.blue_corner_full_name || ''})` : '—',
    ]);
  });

  // Totals row
  const grandTotalRed = Object.values(refTotalsRed).reduce((s, v) => s + v, 0);
  const grandTotalBlue = Object.values(refTotalsBlue).reduce((s, v) => s + v, 0);
  const adjustRed = totalBonusRed + warningPenaltyRed;
  const adjustBlue = totalBonusBlue + warningPenaltyBlue;
  refRows.push([]);
  refRows.push(['TOTAL ARBITRI', '', ...((matchRounds || []).flatMap(() => ['', ''])), grandTotalRed, grandTotalBlue, '']);
  refRows.push(['Ajustări (bonus/avert.)', '', ...((matchRounds || []).flatMap(() => ['', ''])), adjustRed, adjustBlue, '']);
  refRows.push(['SCOR FINAL', '', ...((matchRounds || []).flatMap(() => ['', ''])), grandTotalRed + adjustRed, grandTotalBlue + adjustBlue, '']);

  const ws1 = XLSX.utils.aoa_to_sheet(refRows);
  ws1['!cols'] = [{ wch: 28 }, { wch: 6 }, ...((matchRounds || []).flatMap(() => [{ wch: 10 }, { wch: 10 }])), { wch: 14 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Scoruri Arbitri');

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET 2: Evenimente
  // ─────────────────────────────────────────────────────────────────────────
  const typeLabels = {
    warning_red: 'Avertisment Roșu', warning_blue: 'Avertisment Albastru',
    penalty_red: 'Penalizare Roșu', penalty_blue: 'Penalizare Albastru',
    bonus_red: 'Bonus Roșu', bonus_blue: 'Bonus Albastru',
    infraction_red: 'Abatere Roșu', infraction_blue: 'Abatere Albastru',
    disqualify_red: 'DESCALIFICARE Roșu', disqualify_blue: 'DESCALIFICARE Albastru',
    pause: 'Pauză', resume: 'Reluare', time_add: 'Timp adăugat', time_remove: 'Timp scăzut',
  };

  const evRows = [
    [`Meci: ${matchName}`],
    [],
    ['Ora', 'Repriza', 'Tip eveniment', 'Valoare', 'Colț'],
  ];

  const sortedEvents = [...(matchEvents || [])]
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  sortedEvents.forEach(ev => {
    const roundNum = ev.round ? roundNumMap[ev.round] : null;
    const isRed = ev.event_type.includes('red');
    const isBlue = ev.event_type.includes('blue');
    const valueStr = ev.value != null ? (ev.event_type.startsWith('time') ? `${ev.value > 0 ? '+' : ''}${ev.value}s` : `${ev.value > 0 ? '+' : ''}${ev.value}p`) : '—';
    evRows.push([
      fmtTime(ev.created_at),
      roundNum ? `Repriza ${roundNum}` : '—',
      typeLabels[ev.event_type] || ev.event_type,
      valueStr,
      isRed ? 'Roșu' : isBlue ? 'Albastru' : '—',
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(evRows);
  ws2['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Evenimente');

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET 3: Timeline Puncte Arbitri
  // ─────────────────────────────────────────────────────────────────────────
  const tlRows = [
    [`Meci: ${matchName} — Timeline Puncte Arbitri`],
    [],
    ['Ora', 'Repriza', 'Arbitru', 'Colț', 'Puncte', 'Status', 'Video offset (ms)'],
  ];

  const sortedPoints = [...(pointEvents || [])]
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  sortedPoints.forEach(ev => {
    const roundId = ev.metadata?.round_id || (ev.metadata?.round ? (matchRounds || []).find(r => r.round_number === ev.metadata.round)?.id : null);
    const roundNum = roundId ? roundNumMap[roundId] : null;
    const statusMap = { pending: 'În așteptare', validated: 'Validat', rejected: 'Respins' };
    tlRows.push([
      fmtTime(ev.timestamp),
      roundNum ? `Repriza ${roundNum}` : '—',
      ev.referee_name || refNameMap[ev.referee] || `#${ev.referee}`,
      ev.side === 'red' ? 'Roșu' : 'Albastru',
      ev.points,
      statusMap[ev.validation_status] || ev.validation_status || '—',
      fmt(ev.video_offset_ms),
    ]);
  });

  // Summary per referee per round
  if (sortedPoints.length > 0) {
    tlRows.push([]);
    tlRows.push(['— REZUMAT PER ARBITRU —']);
    tlRows.push(['Arbitru', 'Repriza', 'Roșu trimis', 'Roșu validat', 'Albastru trimis', 'Albastru validat', 'Total puncte date']);

    const summary = {};
    sortedPoints.forEach(ev => {
      const roundId = ev.metadata?.round_id || (ev.metadata?.round ? (matchRounds || []).find(r => r.round_number === ev.metadata.round)?.id : null);
      const roundNum = roundId ? roundNumMap[roundId] : 0;
      const refKey = `${ev.referee}_${roundNum}`;
      if (!summary[refKey]) {
        summary[refKey] = {
          refName: ev.referee_name || refNameMap[ev.referee] || `#${ev.referee}`,
          round: roundNum ? `Repriza ${roundNum}` : '—',
          sentRed: 0, validRed: 0, sentBlue: 0, validBlue: 0,
        };
      }
      const s = summary[refKey];
      if (ev.side === 'red') { s.sentRed += ev.points; if (ev.validation_status === 'validated') s.validRed += ev.points; }
      else { s.sentBlue += ev.points; if (ev.validation_status === 'validated') s.validBlue += ev.points; }
    });

    Object.values(summary).forEach(s => {
      tlRows.push([s.refName, s.round, s.sentRed, s.validRed, s.sentBlue, s.validBlue, s.sentRed + s.sentBlue]);
    });
  }

  const ws3 = XLSX.utils.aoa_to_sheet(tlRows);
  ws3['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Timeline Puncte');

  // ── WRITE FILE ────────────────────────────────────────────────────────────
  XLSX.writeFile(wb, `Meci_${safeFileName}.xlsx`);
}
