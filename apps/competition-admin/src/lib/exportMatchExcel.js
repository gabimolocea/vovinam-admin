import ExcelJS from 'exceljs';
import { abateriLupta, PRAGURI } from './impartialitate';
import { REAL_TIME_POINT_VALIDATION_WINDOW_MS, ARBITRI_PENTRU_FAZA } from '@shared/lib/realtimePoints';

/**
 * Renders a per-second scoring timeline as a PNG (via an offscreen canvas):
 * one row per referee slot (A1-A5), a dot per point event at the time it
 * was submitted, colored by corner. An empty row makes it immediately
 * obvious which referee never scored - that's the whole point of this
 * chart, not a general-purpose analytics view.
 */
/**
 * Fazele unui meci, din apasarile brute.
 *
 * O "faza" e o secventa de apasari pe aceeasi parte, la mai putin de
 * REAL_TIME_POINT_VALIDATION_WINDOW_MS una de alta. Faza conteaza daca au
 * vazut-o cel putin ARBITRI_PENTRU_FAZA arbitri.
 *
 * Partea care intereseaza la final de meci nu e cine a apasat, ci CINE N-A
 * APASAT: un arbitru care lipseste sistematic de la fazele unui luptator, pe
 * care ceilalti patru le vad, spune ceva ce scorul final nu spune.
 */
export function fazeleMeciului({ pointEvents = [], matchRefSlots = [] }) {
  const momentul = (e) => {
    const client = Number(e?.metadata?.client_timestamp_ms);
    if (Number.isFinite(client)) return client;
    const t = new Date(e?.timestamp || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const sortate = (pointEvents || [])
    .filter(e => e && e.event_type !== 'penalty' && e.referee)
    .sort((x, y) => momentul(x) - momentul(y));

  const faze = [];
  for (const e of sortate) {
    const t = momentul(e);
    const ultima = faze.find(f => f.side === e.side
      && f.points === Number(e.points || 0)
      && t - f.ancora < REAL_TIME_POINT_VALIDATION_WINDOW_MS
      && t >= f.ancora);
    if (ultima) {
      ultima.arbitri.add(e.referee);
      ultima.ultimul = t;
    } else {
      faze.push({
        ancora: t, ultimul: t, side: e.side, points: Number(e.points || 0),
        arbitri: new Set([e.referee]),
      });
    }
  }

  const alocati = (matchRefSlots || []).filter(r => r.id);
  return faze.map(f => ({
    ...f,
    confirmata: f.arbitri.size >= ARBITRI_PENTRU_FAZA,
    lipsa: alocati.filter(r => !f.arbitri.has(r.id)),
  }));
}

function renderScoringTimelineChart({ matchTitle, matchRefSlots, pointEvents, faze = [] }) {
  const W = 1200;
  const rowH = 46;
  const marginLeft = 170, marginRight = 30, marginTop = 56, marginBottom = 36;
  const H = marginTop + matchRefSlots.length * rowH + marginBottom;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`${matchTitle} — Cronologie punctaj (cine a punctat, când)`, 16, 24);

  const events = (pointEvents || []).filter(e => e.timestamp);
  const plotW = W - marginLeft - marginRight;

  // Row labels + baselines, drawn for every slot even with zero events -
  // an empty row is the signal that referee never scored.
  matchRefSlots.forEach((ref, ri) => {
    const y = marginTop + ri * rowH + rowH / 2;
    ctx.fillStyle = ref.id ? '#111827' : '#9ca3af';
    ctx.font = '13px sans-serif';
    ctx.fillText(`A${ref.pos}  ${ref.name || '(neasignat)'}`, 10, y + 4);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginLeft, y);
    ctx.lineTo(W - marginRight, y);
    ctx.stroke();
  });

  if (events.length === 0) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '13px sans-serif';
    ctx.fillText('Niciun eveniment de punctaj înregistrat pentru acest meci.', marginLeft, marginTop - 12);
    return canvas.toDataURL('image/png');
  }

  const times = events.map(e => new Date(e.timestamp).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = Math.max(tMax - tMin, 1000);

  // Benzile fazelor, desenate INAINTEA punctelor ca sa stea dedesubt.
  //
  // Verde = faza a fost confirmata de destui arbitri si a dat puncte; gri =
  // au apasat prea putini, deci n-a contat. Cu banda in spate se vede dintr-o
  // privire cine lipseste dintr-o faza pe care ceilalti au vazut-o: randul lui
  // e gol tocmai acolo unde banda e verde.
  const laX = (t) => marginLeft + ((t - tMin) / span) * plotW;
  faze.forEach((f) => {
    const x1 = laX(f.ancora);
    const x2 = Math.max(laX(f.ultimul), x1 + 2);
    ctx.fillStyle = f.confirmata ? 'rgba(16,185,129,0.14)' : 'rgba(156,163,175,0.16)';
    ctx.fillRect(x1 - 3, marginTop, (x2 - x1) + 6, matchRefSlots.length * rowH);
  });

  // Secundele, ca sa se poata citi "la ce moment" fara sa se ghiceasca.
  const secunde = Math.ceil(span / 1000);
  const pasSecunde = Math.max(1, Math.ceil(secunde / 20));
  ctx.strokeStyle = '#f3f4f6';
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px sans-serif';
  for (let sec = 0; sec <= secunde; sec += pasSecunde) {
    const x = laX(tMin + sec * 1000);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + matchRefSlots.length * rowH);
    ctx.stroke();
    ctx.fillText(`${sec}s`, x - 6, marginTop - 6);
  }

  matchRefSlots.forEach((ref, ri) => {
    if (!ref.id) return;
    const y = marginTop + ri * rowH + rowH / 2;
    events.filter(e => e.referee === ref.id).forEach(e => {
      const t = new Date(e.timestamp).getTime();
      const x = marginLeft + ((t - tMin) / span) * plotW;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = e.side === 'red' ? '#dc2626' : '#2563eb';
      ctx.globalAlpha = e.validation_status === 'rejected' ? 0.35 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  });

  // Time axis
  const axisY = marginTop + matchRefSlots.length * rowH + 14;
  ctx.strokeStyle = '#9ca3af';
  ctx.beginPath();
  ctx.moveTo(marginLeft, axisY);
  ctx.lineTo(W - marginRight, axisY);
  ctx.stroke();
  ctx.fillStyle = '#374151';
  ctx.font = '11px sans-serif';
  const fmt = (ms) => new Date(ms).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  ctx.fillText(fmt(tMin), marginLeft, axisY + 14);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(tMax), W - marginRight, axisY + 14);
  ctx.textAlign = 'left';

  // Legend
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(marginLeft, 40, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#374151'; ctx.fillText('Roșu', marginLeft + 10, 44);
  ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(marginLeft + 60, 40, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#374151'; ctx.fillText('Albastru', marginLeft + 70, 44);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(marginLeft + 150, 40, 4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = '#374151'; ctx.fillText('Respins de admin', marginLeft + 160, 44);
  ctx.fillStyle = 'rgba(16,185,129,0.35)'; ctx.fillRect(marginLeft + 290, 34, 12, 12);
  ctx.fillStyle = '#374151'; ctx.fillText(`Fază confirmată (${ARBITRI_PENTRU_FAZA}+ arbitri)`, marginLeft + 308, 44);
  ctx.fillStyle = 'rgba(156,163,175,0.4)'; ctx.fillRect(marginLeft + 470, 34, 12, 12);
  ctx.fillStyle = '#374151'; ctx.fillText('Fază neconfirmată', marginLeft + 488, 44);

  return canvas.toDataURL('image/png');
}

/**
 * Exports one match's scoring detail to a 4-sheet Excel workbook:
 * Scoruri Arbitri, Evenimente, Timeline Puncte, Grafic Punctaj.
 *
 * This is THE single source of truth for the per-match Excel export -
 * used both from the live scoring screen (LiveFullscreenPage) and from
 * the field-schedule match detail modal (ProgramarePage), so the two
 * never drift into two different-looking exports for the same data.
 */
export async function exportMatchExcel({ match, matchRounds, matchRefScores, matchEvents, pointEvents, matchRefSlots, competitionReferees }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRVV Admin';
  wb.created = new Date();

  const DARK_HDR  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const YELLOW_HD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
  const RED_BG    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  const BLUE_BG   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  const GRAY_BG   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  const BLACK_B   = { style: 'thin', color: { argb: 'FF000000' } };
  const GRAY_B    = { style: 'thin', color: { argb: 'FFD1D5DB' } };
  const allB      = (b = BLACK_B) => ({ top: b, left: b, bottom: b, right: b });
  const boldF     = (sz = 10, hex = '000000') => ({ name: 'Calibri', size: sz, bold: true,  color: { argb: 'FF' + hex } });
  const normF     = (sz = 10, hex = '000000') => ({ name: 'Calibri', size: sz, bold: false, color: { argb: 'FF' + hex } });
  const CC = { horizontal: 'center', vertical: 'middle' };
  const LC = { horizontal: 'left',   vertical: 'middle' };

  const matchTitle = `${match.red_corner_full_name || 'Roșu'} vs ${match.blue_corner_full_name || 'Albastru'}`;
  const safeFile = matchTitle.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const roundNumMap = {};
  (matchRounds || []).forEach(r => { roundNumMap[r.id] = r.round_number; });
  const refNameMap = {};
  (matchRefSlots || []).forEach(r => { if (r.id) refNameMap[r.id] = r.name || `A${r.pos}`; });

  // Adjustments
  const warnRed  = (matchEvents || []).filter(e => e.event_type === 'warning_red').length;
  const warnBlue = (matchEvents || []).filter(e => e.event_type === 'warning_blue').length;
  const bonusRed  = (matchEvents || []).filter(e => e.event_type === 'bonus_red').reduce((s, e) => s + (e.value || 0), 0);
  const bonusBlue = (matchEvents || []).filter(e => e.event_type === 'bonus_blue').reduce((s, e) => s + (e.value || 0), 0);
  const adjRed  = bonusRed  + warnRed  * -2;
  const adjBlue = bonusBlue + warnBlue * -2;

  // ── Sheet 1: Scoruri Arbitri ──
  const ws1 = wb.addWorksheet('Scoruri Arbitri');
  const nRounds = (matchRounds || []).length;
  const totalCols = 2 + nRounds * 2 + 3; // pos+name, rounds*2, totalRed, totalBlue, decizie

  ws1.addRow([matchTitle]);
  ws1.getRow(1).height = 32;
  ws1.getRow(1).getCell(1).font = boldF(15, 'FFFFFF');
  ws1.getRow(1).getCell(1).fill = DARK_HDR;
  ws1.getRow(1).getCell(1).alignment = LC;
  ws1.mergeCells(1, 1, 1, totalCols);

  ws1.addRow([]);
  ws1.getRow(2).height = 4;

  const roundHdrs = (matchRounds || []).flatMap(r => [`R${r.round_number} Roșu`, `R${r.round_number} Albastru`]);
  ws1.addRow(['Pos', 'Arbitru', ...roundHdrs, 'Total Roșu', 'Total Albastru', 'Decizie']);
  ws1.getRow(3).height = 30;
  ws1.getRow(3).eachCell(cell => {
    cell.font = boldF(11, 'FFFFFF');
    cell.fill = DARK_HDR;
    cell.alignment = CC;
    cell.border = allB();
  });
  ws1.getColumn(1).width = 6;
  ws1.getColumn(2).width = 30;
  (matchRounds || []).forEach((_, i) => { ws1.getColumn(3 + i * 2).width = 12; ws1.getColumn(4 + i * 2).width = 12; });
  ws1.getColumn(3 + nRounds * 2).width = 14;
  ws1.getColumn(4 + nRounds * 2).width = 14;
  ws1.getColumn(5 + nRounds * 2).width = 32;

  const refTotRed = {}; const refTotBlue = {};
  (matchRefSlots || []).forEach((ref, ri) => {
    const scores = (matchRefScores || []).filter(s => s.referee === ref.id && s.round != null);
    const decision = (matchRefScores || []).find(s => s.referee === ref.id && s.round == null && s.winner_choice)?.winner_choice;
    const roundCells = (matchRounds || []).flatMap(r => {
      const rs = scores.find(s => s.round === r.id);
      return [rs?.red_corner_score != null ? Number(rs.red_corner_score) : null, rs?.blue_corner_score != null ? Number(rs.blue_corner_score) : null];
    });
    const tRed  = scores.reduce((s, rs) => s + Number(rs.red_corner_score  || 0), 0);
    const tBlue = scores.reduce((s, rs) => s + Number(rs.blue_corner_score || 0), 0);
    refTotRed[ref.id] = tRed; refTotBlue[ref.id] = tBlue;
    const decText = decision === 'red' ? `Roșu (${match.red_corner_full_name || ''})` : decision === 'blue' ? `Albastru (${match.blue_corner_full_name || ''})` : '—';
    ws1.addRow([`A${ref.pos}`, ref.name || `Arbitru ${ref.pos}`, ...roundCells, tRed, tBlue, decText]);
    const dr = ws1.getRow(3 + 1 + ri);
    dr.height = 22;
    dr.getCell(1).font = boldF(10); dr.getCell(1).alignment = CC; dr.getCell(1).border = allB();
    dr.getCell(2).font = normF(11); dr.getCell(2).alignment = LC; dr.getCell(2).border = allB();
    roundCells.forEach((v, ci) => {
      const cell = dr.getCell(3 + ci);
      cell.value = v; cell.alignment = CC; cell.border = allB({ style: 'thin', color: { argb: 'FFD1D5DB' } });
      if (ci % 2 === 0) { cell.fill = RED_BG; } else { cell.fill = BLUE_BG; }
      cell.font = boldF(11);
    });
    const tcRed = dr.getCell(3 + nRounds * 2); tcRed.value = tRed; tcRed.font = boldF(12, 'B91C1C'); tcRed.fill = RED_BG; tcRed.alignment = CC; tcRed.border = allB();
    const tcBlue = dr.getCell(4 + nRounds * 2); tcBlue.value = tBlue; tcBlue.font = boldF(12, '1D4ED8'); tcBlue.fill = BLUE_BG; tcBlue.alignment = CC; tcBlue.border = allB();
    const tcDec = dr.getCell(5 + nRounds * 2); tcDec.value = decText; tcDec.font = normF(11); tcDec.alignment = LC; tcDec.border = allB();
  });

  const grandRed  = Object.values(refTotRed).reduce((s, v) => s + v, 0);
  const grandBlue = Object.values(refTotBlue).reduce((s, v) => s + v, 0);
  [[' ', 'TOTAL ARBITRI', ...(matchRounds || []).flatMap(() => ['', '']), grandRed, grandBlue, ''],
   [' ', 'Ajustări (bonus/avert.)', ...(matchRounds || []).flatMap(() => ['', '']), adjRed, adjBlue, ''],
   [' ', 'SCOR FINAL', ...(matchRounds || []).flatMap(() => ['', '']), grandRed + adjRed, grandBlue + adjBlue, ''],
  ].forEach((row, ri) => {
    ws1.addRow(row);
    const dr = ws1.getRow(3 + 1 + (matchRefSlots || []).length + 1 + ri);
    dr.height = 24;
    dr.eachCell(cell => { cell.font = boldF(11); cell.fill = YELLOW_HD; cell.alignment = CC; cell.border = allB(); });
    dr.getCell(2).alignment = LC;
    dr.getCell(3 + nRounds * 2).font = boldF(12, 'B91C1C');
    dr.getCell(4 + nRounds * 2).font = boldF(12, '1D4ED8');
  });

  // ── Sheet 2: Evenimente ──
  const ws2 = wb.addWorksheet('Evenimente');
  ws2.addRow([`${matchTitle} — Evenimente`]);
  ws2.getRow(1).height = 28; ws2.getRow(1).getCell(1).font = boldF(13, 'FFFFFF'); ws2.getRow(1).getCell(1).fill = DARK_HDR; ws2.getRow(1).getCell(1).alignment = LC; ws2.mergeCells(1, 1, 1, 5);
  ws2.addRow([]); ws2.getRow(2).height = 4;
  ws2.addRow(['Ora', 'Repriza', 'Tip eveniment', 'Valoare', 'Colț']);
  ws2.getRow(3).height = 26; ws2.getRow(3).eachCell(c => { c.font = boldF(11, 'FFFFFF'); c.fill = DARK_HDR; c.alignment = CC; c.border = allB(); });
  [12, 14, 32, 10, 10].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

  const typeLabels = {
    warning_red: 'Avertisment Roșu', warning_blue: 'Avertisment Albastru',
    penalty_red: 'Penalizare Roșu', penalty_blue: 'Penalizare Albastru',
    bonus_red: 'Bonus Roșu', bonus_blue: 'Bonus Albastru',
    infraction_red: 'Abatere Roșu', infraction_blue: 'Abatere Albastru',
    disqualify_red: 'DESCALIFICARE Roșu', disqualify_blue: 'DESCALIFICARE Albastru',
    pause: 'Pauză', resume: 'Reluare', time_add: 'Timp adăugat', time_remove: 'Timp scăzut',
  };
  [...(matchEvents || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)).forEach((ev, ri) => {
    const roundNum = ev.round ? roundNumMap[ev.round] : null;
    const isRed = ev.event_type.includes('red'); const isBlue = ev.event_type.includes('blue');
    const valStr = ev.value != null ? (ev.event_type.startsWith('time') ? `${ev.value > 0 ? '+' : ''}${ev.value}s` : `${ev.value > 0 ? '+' : ''}${ev.value}p`) : '—';
    ws2.addRow([fmtTime(ev.created_at), roundNum ? `Repriza ${roundNum}` : '—', typeLabels[ev.event_type] || ev.event_type, valStr, isRed ? 'Roșu' : isBlue ? 'Albastru' : '—']);
    const dr = ws2.getRow(3 + 1 + ri); dr.height = 20;
    dr.eachCell(c => { c.alignment = CC; c.border = allB(GRAY_B); c.font = normF(10); });
    if (isRed) { dr.getCell(5).fill = RED_BG; dr.getCell(5).font = boldF(10, 'B91C1C'); }
    else if (isBlue) { dr.getCell(5).fill = BLUE_BG; dr.getCell(5).font = boldF(10, '1D4ED8'); }
    if (ri % 2 === 1) dr.eachCell(c => { if (!c.fill?.fgColor) c.fill = GRAY_BG; });
  });

  // ── Sheet 3: Timeline Puncte ──
  const ws3 = wb.addWorksheet('Timeline Puncte');
  ws3.addRow([`${matchTitle} — Timeline Puncte Arbitri`]);
  ws3.getRow(1).height = 28; ws3.getRow(1).getCell(1).font = boldF(13, 'FFFFFF'); ws3.getRow(1).getCell(1).fill = DARK_HDR; ws3.getRow(1).getCell(1).alignment = LC; ws3.mergeCells(1, 1, 1, 7);
  ws3.addRow([]); ws3.getRow(2).height = 4;
  ws3.addRow(['Ora', 'Repriza', 'Arbitru', 'Colț', 'Puncte', 'Status', 'Video offset']);
  ws3.getRow(3).height = 26; ws3.getRow(3).eachCell(c => { c.font = boldF(11, 'FFFFFF'); c.fill = DARK_HDR; c.alignment = CC; c.border = allB(); });
  [12, 14, 28, 10, 8, 16, 14].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

  const statusMap = { pending: 'În așteptare', validated: 'Validat', rejected: 'Respins' };
  const sortedPts = [...(pointEvents || [])].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  sortedPts.forEach((ev, ri) => {
    const roundId = ev.metadata?.round_id || ((ev.metadata?.round != null) ? (matchRounds || []).find(r => r.round_number === ev.metadata.round)?.id : null);
    const roundNum = roundId ? roundNumMap[roundId] : null;
    const isRed = ev.side === 'red';
    ws3.addRow([fmtTime(ev.timestamp), roundNum ? `Repriza ${roundNum}` : '—', ev.referee_name || refNameMap[ev.referee] || `#${ev.referee}`, isRed ? 'Roșu' : 'Albastru', ev.points, statusMap[ev.validation_status] || ev.validation_status || '—', ev.video_offset_ms != null ? ev.video_offset_ms : '—']);
    const dr = ws3.getRow(3 + 1 + ri); dr.height = 20;
    dr.eachCell(c => { c.alignment = CC; c.border = allB(GRAY_B); c.font = normF(10); });
    dr.getCell(4).fill = isRed ? RED_BG : BLUE_BG;
    dr.getCell(4).font = boldF(10, isRed ? 'B91C1C' : '1D4ED8');
    const status = ev.validation_status;
    dr.getCell(6).font = boldF(10, status === 'validated' ? '059669' : status === 'rejected' ? 'DC2626' : '92400E');
    if (ri % 2 === 1) dr.eachCell(c => { if (!c.fill?.fgColor) c.fill = GRAY_BG; });
  });

  if (sortedPts.length > 0) {
    ws3.addRow([]);
    ws3.addRow(['— REZUMAT PER ARBITRU PER REPRIZĂ —']);
    ws3.getRow(ws3.rowCount).height = 24;
    ws3.getRow(ws3.rowCount).getCell(1).font = boldF(12, 'FFFFFF');
    ws3.getRow(ws3.rowCount).getCell(1).fill = DARK_HDR;
    ws3.mergeCells(ws3.rowCount, 1, ws3.rowCount, 7);
    ws3.addRow(['Arbitru', 'Repriza', 'Roșu trimis', 'Roșu validat', 'Albastru trimis', 'Albastru validat', 'Total puncte']);
    ws3.getRow(ws3.rowCount).height = 24;
    ws3.getRow(ws3.rowCount).eachCell(c => { c.font = boldF(10, 'FFFFFF'); c.fill = DARK_HDR; c.alignment = CC; c.border = allB(); });
    const summary = {};
    sortedPts.forEach(ev => {
      const roundId = ev.metadata?.round_id || ((ev.metadata?.round != null) ? (matchRounds || []).find(r => r.round_number === ev.metadata.round)?.id : null);
      const rNum = roundId ? roundNumMap[roundId] : 0;
      const key = `${ev.referee}_${rNum}`;
      if (!summary[key]) summary[key] = { name: ev.referee_name || refNameMap[ev.referee] || `#${ev.referee}`, round: rNum ? `Repriza ${rNum}` : '—', sRed: 0, vRed: 0, sBlue: 0, vBlue: 0 };
      const s = summary[key];
      if (ev.side === 'red') { s.sRed += ev.points; if (ev.validation_status === 'validated') s.vRed += ev.points; }
      else { s.sBlue += ev.points; if (ev.validation_status === 'validated') s.vBlue += ev.points; }
    });
    Object.values(summary).forEach((s, ri) => {
      ws3.addRow([s.name, s.round, s.sRed, s.vRed, s.sBlue, s.vBlue, s.sRed + s.sBlue]);
      const dr = ws3.getRow(ws3.rowCount); dr.height = 20;
      dr.eachCell(c => { c.alignment = CC; c.border = allB(GRAY_B); c.font = normF(10); });
      dr.getCell(1).alignment = LC; dr.getCell(1).font = boldF(10);
      if (ri % 2 === 1) dr.eachCell(c => { if (!c.fill?.fgColor) c.fill = GRAY_BG; });
    });
  }

  // ── Sheet 4: Grafic Punctaj (visual per-second scoring timeline, one
  //     row per referee - the empty rows are exactly which referees
  //     never submitted a single point) ──
  const faze = fazeleMeciului({ pointEvents, matchRefSlots: matchRefSlots || [] });

  const ws4 = wb.addWorksheet('Grafic Punctaj');
  try {
    const dataUrl = renderScoringTimelineChart({ matchTitle, matchRefSlots: matchRefSlots || [], pointEvents: pointEvents || [], faze });
    const imageId = wb.addImage({ base64: dataUrl.split(',')[1], extension: 'png' });
    ws4.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 1200, height: 56 + (matchRefSlots || []).length * 46 + 36 } });
  } catch (err) {
    // Canvas isn't available in every runtime (e.g. a headless test) -
    // fall back to a plain note rather than failing the whole export.
    ws4.addRow(['Graficul nu a putut fi generat: ' + err.message]);
  }

  // ── Faze — cine a văzut fiecare fază și cine a lipsit de la ea ──
  if (faze.length) {
    const t0 = Math.min(...faze.map(f => f.ancora));
    const ws6 = wb.addWorksheet('Faze');
    ws6.addRow(['FAZE — ' + matchTitle]);
    ws6.getRow(1).font = { bold: true, size: 14 };
    ws6.addRow([`O fază contează dacă au văzut-o cel puțin ${ARBITRI_PENTRU_FAZA} arbitri, în ${REAL_TIME_POINT_VALIDATION_WINDOW_MS / 1000}s unul de altul.`]);
    ws6.addRow(['Coloana "Nu au punctat" e cea care spune ceva: un arbitru care lipsește mereu de la fazele aceluiași luptător.']);
    ws6.getRow(2).font = { size: 10, italic: true };
    ws6.getRow(3).font = { size: 10, italic: true };
    ws6.addRow([]);
    const cap6 = ws6.addRow(['SECUNDA', 'COLȚ', 'PUNCTE', 'CÂȚI AU VĂZUT', 'A CONTAT', 'NU AU PUNCTAT']);
    cap6.font = { bold: true };
    for (const f of faze) {
      ws6.addRow([
        Number(((f.ancora - t0) / 1000).toFixed(1)),
        f.side === 'blue' ? 'Albastru' : 'Roșu',
        f.points,
        f.arbitri.size,
        f.confirmata ? 'DA' : 'nu',
        f.lipsa.map(r => `A${r.pos} ${r.name || ''}`.trim()).join(', ') || '—',
      ]);
    }
    ws6.columns = [{ width: 10 }, { width: 11 }, { width: 9 }, { width: 15 }, { width: 11 }, { width: 46 }];

    // Cat de des a lipsit fiecare de la fazele care au contat.
    ws6.addRow([]);
    const cap7 = ws6.addRow(['ARBITRU', 'FAZE CONFIRMATE', 'A VĂZUT', 'A LIPSIT', 'LIPSĂ %']);
    cap7.font = { bold: true };
    const confirmate = faze.filter(f => f.confirmata);
    for (const r of (matchRefSlots || []).filter(x => x.id)) {
      const vazute = confirmate.filter(f => f.arbitri.has(r.id)).length;
      const lipsa = confirmate.length - vazute;
      ws6.addRow([
        `A${r.pos} ${r.name || ''}`.trim(), confirmate.length, vazute, lipsa,
        confirmate.length ? Number(((lipsa / confirmate.length) * 100).toFixed(0)) : 0,
      ]);
    }
  }

  // ── Imparțialitate — cat de diferit a notat fiecare arbitru colturile ──
  //
  // Aceeasi masuratoare ca la tehnica, din acelasi modul: marja pe care
  // arbitrul o da coltului clubului sau, fata de mediana colegilor pe aceeasi
  // runda. O a doua implementare aici ar fi divergat de prima.
  const clubArbitru = new Map(
    (competitionReferees || []).filter(cr => cr.athlete && cr.club_name).map(cr => [cr.athlete, cr.club_name]),
  );
  const numeArbitru = new Map(
    (matchRefSlots || []).filter(r => r.id).map(r => [r.id, r.name || `A${r.pos}`]),
  );
  const abateri = abateriLupta({
    noteArbitri: matchRefScores || [],
    clubRosu: match?.red_corner_club_name,
    clubAlbastru: match?.blue_corner_club_name,
    clubArbitru,
    numeArbitru,
  });

  if (abateri.length) {
    const ws5 = wb.addWorksheet('Imparțialitate');
    ws5.addRow(['IMPARȚIALITATE — ' + matchTitle]);
    ws5.getRow(1).font = { bold: true, size: 14 };
    ws5.addRow(['Marja dată de fiecare arbitru colțului propriului club, față de mediana colegilor pe aceeași rundă.']);
    ws5.addRow([`Nu e o dovadă: arată unde merită să se uite un om. Sub ${PRAGURI.MINIM_SPORTIVI} runde judecate nu se marchează nimic.`]);
    ws5.getRow(2).font = { size: 10, italic: true };
    ws5.getRow(3).font = { size: 10, italic: true };
    ws5.addRow([]);
    const cap = ws5.addRow(['ARBITRU', 'CLUB', 'RUNDE CU CLUBUL', 'ABATERE', 'ALTE RUNDE', 'ABATERE', 'DIFERENȚĂ']);
    cap.font = { bold: true };
    const doua = (v) => (v == null ? '—' : Number(v.toFixed(2)));
    for (const ab of abateri) {
      const r = ws5.addRow([
        ab.arbitru, ab.club, ab.nProprii, doua(ab.medieProprii),
        ab.nAltii, doua(ab.medieAltii),
        ab.diferenta == null ? '—' : `${doua(ab.diferenta)} (${ab.semnal})`,
      ]);
      if (ab.semnal === 'de verificat') r.font = { bold: true };
    }
    ws5.columns = [{ width: 26 }, { width: 24 }, { width: 18 }, { width: 13 }, { width: 14 }, { width: 13 }, { width: 22 }];
  }

  // ── Download ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Meci_${safeFile}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
