import ExcelJS from 'exceljs';

/* ═══════════════════════════════════════════════════════════════════
   FULL COMPETITION EXPORT
   One workbook, four cross-linked sheets: Centralizator (overview),
   Tehnica (solo/team enrollments), Lupta (fight enrollments + weights),
   Piramide (fight brackets). Every category row on Centralizator links
   to its section on Tehnica/Lupta and, if a bracket exists, on Piramide -
   and each of those sections links back to its Centralizator row.
   ═══════════════════════════════════════════════════════════════════ */

const GENDER_LABELS = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };
const TYPE_LABELS = { solo: 'Solo', team: 'Echipă', teams: 'Echipă', fight: 'Luptă' };
const ROUND_LABELS = {
  qualifications: 'Calificări',
  'quarter-finals': 'Sferturi',
  'semi-finals': 'Semifinale',
  finals: 'Finală',
  bronze: 'Meci Bronz',
};

function buildStyleKit() {
  const DARK_HDR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const AMBER_HDR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
  const RED_BG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  const BLUE_BG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  const GREEN_BG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  const GRAY_BG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  const BLACK_B = { style: 'thin', color: { argb: 'FF000000' } };
  const GRAY_B = { style: 'thin', color: { argb: 'FFD1D5DB' } };
  const allB = (b = BLACK_B) => ({ top: b, left: b, bottom: b, right: b });
  const boldF = (sz = 14, hex = '000000') => ({ name: 'Calibri', size: sz, bold: true, color: { argb: 'FF' + hex } });
  const normF = (sz = 13, hex = '000000') => ({ name: 'Calibri', size: sz, bold: false, color: { argb: 'FF' + hex } });
  const CC = { horizontal: 'center', vertical: 'middle' };
  const LC = { horizontal: 'left', vertical: 'middle' };
  return { DARK_HDR, AMBER_HDR, RED_BG, BLUE_BG, GREEN_BG, GRAY_BG, BLACK_B, GRAY_B, allB, boldF, normF, CC, LC };
}

function sortByOrder(list) {
  return [...list].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name), 'ro'));
}

function athleteName(a) {
  return a ? `${a.last_name || ''} ${a.first_name || ''}`.trim() : '';
}

function sheetTitleRow(ws, text, span, S) {
  ws.addRow([text]);
  const row = ws.lastRow;
  row.height = 36;
  row.getCell(1).font = S.boldF(18, 'FFFFFF');
  row.getCell(1).fill = S.DARK_HDR;
  row.getCell(1).alignment = S.LC;
  ws.mergeCells(row.number, 1, row.number, span);
  return row.number;
}

/* ── Draws one fight category's bracket tree into ws, starting at startRow.
   Returns the row right after the section (including its spacer), plus a
   map of athleteId -> the cell address of their first (Round 1) appearance,
   so the Lupta sheet can link straight to it. Mirrors BracketPage.jsx's
   per-category exportExcel, but relative to an arbitrary startRow so many
   brackets can stack in one shared sheet. ── */
function drawBracketSection(ws, matches, title, startRow, S) {
  const byRound = {};
  for (const m of matches) {
    const rnd = m.round_number || 1;
    (byRound[rnd] ||= []).push(m);
  }
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  const H = 2; // rows per match
  const GAP = 2; // gap rows between R1 matches
  const UNIT = H + GAP;
  const COL_W = 36;
  const CON_W = 4;
  const COLS_PER_ROUND = 2;

  const titleRow = startRow;
  ws.getCell(titleRow, 1).value = title;
  ws.getCell(titleRow, 1).font = S.boldF(16, 'FFFFFF');
  ws.getCell(titleRow, 1).fill = S.DARK_HDR;
  ws.getCell(titleRow, 1).alignment = S.LC;
  ws.getRow(titleRow).height = 30;
  const nRounds = rounds.length;
  const totalCols = Math.max(nRounds * COLS_PER_ROUND + 1, 6);
  try { ws.mergeCells(titleRow, 1, titleRow, totalCols); } catch { /* already merged from a previous section */ }

  if (nRounds === 0) {
    ws.getCell(titleRow + 2, 1).value = 'Nu există meciuri generate.';
    return { nextRow: titleRow + 4, athleteFirstCell: {} };
  }

  const headerRow = titleRow + 2;
  const roundStart = titleRow + 3;

  const getMatchCol = (ri) => 1 + ri * COLS_PER_ROUND;
  const getConnCol = (ri) => 2 + ri * COLS_PER_ROUND;
  const getTopRow = (roundIdx, pos) => {
    const spacing = UNIT * Math.pow(2, roundIdx);
    const offset = (spacing - UNIT) / 2;
    return roundStart + Math.round(offset) + pos * spacing;
  };

  const thin = { style: 'thin', color: { argb: 'FF374151' } };
  const thick = { style: 'medium', color: { argb: 'FF111827' } };
  const none = { style: 'none' };
  const winnerBorder = { style: 'medium', color: { argb: 'FF059669' } };

  rounds.forEach((rnd, ri) => {
    const matchCol = getMatchCol(ri);
    const label = ROUND_LABELS[byRound[rnd][0]?.match_type] || `Runda ${rnd}`;
    const cell = ws.getCell(headerRow, matchCol);
    cell.value = label;
    cell.font = S.boldF(13, 'FFFFFF');
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    cell.alignment = S.CC;
    cell.border = S.allB();
    ws.getRow(headerRow).height = 24;
    if (ri < nRounds - 1) {
      try { ws.mergeCells(headerRow, matchCol, headerRow, matchCol + 1); } catch { /* no-op */ }
    }
  });

  const athleteFirstCell = {};
  let maxRowUsed = roundStart;

  rounds.forEach((rnd, ri) => {
    const matchCol = getMatchCol(ri);
    const connCol = getConnCol(ri);
    const rndMatches = byRound[rnd].sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0));

    rndMatches.forEach((m, mi) => {
      const topRow = getTopRow(ri, mi);
      const botRow = topRow + 1;
      maxRowUsed = Math.max(maxRowUsed, botRow);
      const redWon = m.winner && m.winner === m.red_corner;
      const blueWon = m.winner && m.winner === m.blue_corner;
      const redName = m.red_corner_full_name || 'TBD';
      const blueName = m.blue_corner_full_name || 'TBD';

      const topCell = ws.getCell(topRow, matchCol);
      topCell.value = redName;
      topCell.font = S.boldF(13, redWon ? '059669' : m.red_corner ? '111827' : '9CA3AF');
      topCell.fill = redWon ? S.GREEN_BG : m.red_corner ? S.RED_BG : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      topCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      topCell.border = { top: redWon ? winnerBorder : thick, left: redWon ? winnerBorder : thick, bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } }, right: none };
      ws.getRow(topRow).height = 22;
      if (m.red_corner && !athleteFirstCell[m.red_corner]) athleteFirstCell[m.red_corner] = topCell.address;

      const botCell = ws.getCell(botRow, matchCol);
      botCell.value = blueName;
      botCell.font = S.boldF(13, blueWon ? '059669' : m.blue_corner ? '111827' : '9CA3AF');
      botCell.fill = blueWon ? S.GREEN_BG : m.blue_corner ? S.BLUE_BG : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      botCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      botCell.border = { top: { style: 'hair', color: { argb: 'FFD1D5DB' } }, left: blueWon ? winnerBorder : thick, bottom: blueWon ? winnerBorder : thick, right: none };
      ws.getRow(botRow).height = 22;
      if (m.blue_corner && !athleteFirstCell[m.blue_corner]) athleteFirstCell[m.blue_corner] = botCell.address;

      const topArm = ws.getCell(topRow, connCol);
      topArm.border = { top: thin, right: thin, bottom: none, left: none };
      const botArm = ws.getCell(botRow, connCol);
      botArm.border = { bottom: thin, right: thin, top: none, left: none };

      if (ri < nRounds - 1) {
        const midRowEnd = topRow + (UNIT * Math.pow(2, ri)) - GAP - 1;
        for (let vr = topRow; vr <= Math.round(midRowEnd); vr++) {
          const vc = ws.getCell(vr, connCol);
          if (vr === topRow) vc.border = { top: thin, right: thin, bottom: none, left: none };
          else if (vr === Math.round(midRowEnd)) vc.border = { bottom: thin, right: thin, top: none, left: none };
          else vc.border = { ...(vc.border || {}), right: thin };
        }
      }
    });
  });

  rounds.forEach((_, ri) => {
    ws.getColumn(getMatchCol(ri)).width = Math.max(ws.getColumn(getMatchCol(ri)).width || 0, COL_W);
    ws.getColumn(getConnCol(ri)).width = Math.max(ws.getColumn(getConnCol(ri)).width || 0, CON_W);
  });
  ws.getColumn(getMatchCol(nRounds)).width = Math.max(ws.getColumn(getMatchCol(nRounds)).width || 0, COL_W);

  return { nextRow: maxRowUsed + 3, athleteFirstCell };
}

/**
 * Builds the full, cross-linked competition workbook.
 * @param {object} params
 * @param {string} params.eventTitle
 * @param {Array} params.groups
 * @param {Array} params.categories - each with enrolled_athletes/enrolled_teams already attached (as loaded by useCentralizator)
 * @param {Array} params.fightWeights - FightAthleteWeight records for the whole event
 * @param {Array} params.matches - all Match records for the whole event (bulk-fetched)
 */
export async function buildFullCompetitionWorkbook({ eventTitle, groups, categories, fightWeights, matches }) {
  const S = buildStyleKit();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRVV Admin';
  wb.created = new Date();

  const groupsSorted = sortByOrder(groups || []);
  const catsByGroup = {};
  for (const cat of categories || []) (catsByGroup[cat.group] ||= []).push(cat);

  const weightByAthleteCat = {};
  for (const fw of fightWeights || []) weightByAthleteCat[`${fw.category}:${fw.athlete}`] = fw;

  const matchesByCategory = {};
  for (const m of matches || []) (matchesByCategory[m.category] ||= []).push(m);

  // ─── Sheet: Centralizator ───
  const wsC = wb.addWorksheet('Centralizator');
  sheetTitleRow(wsC, eventTitle, 7, S);
  wsC.addRow([]);
  wsC.addRow(['Grupa', 'Categorie', 'Gen', 'Tip', 'Nr. înscriși', 'Detaliu', 'Bracket']);
  wsC.getRow(3).height = 30;
  wsC.getRow(3).eachCell((c) => { c.font = S.boldF(15, 'FFFFFF'); c.fill = S.DARK_HDR; c.alignment = S.CC; c.border = S.allB(); });
  [30, 34, 14, 12, 14, 16, 16].forEach((w, i) => { wsC.getColumn(i + 1).width = w; });

  const catCentralRow = {}; // catId -> row number on Centralizator

  groupsSorted.forEach((group) => {
    const cats = sortByOrder(catsByGroup[group.id] || []);
    cats.forEach((cat, i) => {
      const isTeam = cat.type === 'team' || cat.type === 'teams';
      const count = isTeam ? (cat.enrolled_teams || []).length : (cat.enrolled_athletes || []).length;
      wsC.addRow([group.name, cat.name, GENDER_LABELS[cat.gender] || cat.gender, TYPE_LABELS[cat.type] || cat.type, count, '', '']);
      const row = wsC.lastRow;
      catCentralRow[cat.id] = row.number;
      row.height = 26;
      row.eachCell((c) => { c.alignment = S.CC; c.border = S.allB(S.GRAY_B); c.font = S.normF(13); });
      row.getCell(2).alignment = S.LC; row.getCell(2).font = S.boldF(14);
      if (i % 2 === 1) row.eachCell((c) => { if (!c.fill?.fgColor) c.fill = S.GRAY_BG; });
    });
  });

  // ─── Sheet: Tehnica ───
  const wsT = wb.addWorksheet('Tehnica');
  sheetTitleRow(wsT, eventTitle + ' — Probe tehnice', 5, S);
  wsT.getColumn(2).width = 34; wsT.getColumn(3).width = 28; wsT.getColumn(5).width = 18;

  const catDetailAnchor = {}; // catId -> { sheet, row }
  let rt = 3;
  groupsSorted.forEach((group) => {
    const cats = sortByOrder((catsByGroup[group.id] || []).filter((c) => c.type === 'solo' || c.type === 'team' || c.type === 'teams'));
    cats.forEach((cat) => {
      catDetailAnchor[cat.id] = { sheet: 'Tehnica', row: rt };
      const isTeam = cat.type !== 'solo';
      const hdrCell = wsT.getCell(rt, 1);
      hdrCell.value = `${group.name} — ${cat.name} (${GENDER_LABELS[cat.gender] || cat.gender})`;
      hdrCell.font = S.boldF(14, 'FFFFFF');
      hdrCell.fill = S.DARK_HDR;
      hdrCell.alignment = S.LC;
      wsT.getRow(rt).height = 26;
      try { wsT.mergeCells(rt, 1, rt, 4); } catch { /* no-op */ }
      const backCell = wsT.getCell(rt, 5);
      backCell.value = { text: '← Centralizator', hyperlink: `#'Centralizator'!A${catCentralRow[cat.id]}` };
      backCell.font = S.boldF(13, 'FFFFFF');
      backCell.alignment = S.CC;
      rt += 1;

      const entries = isTeam ? (cat.enrolled_teams || []) : (cat.enrolled_athletes || []);
      if (entries.length === 0) {
        wsT.getCell(rt, 1).value = '(niciun înscris)';
        wsT.getCell(rt, 1).font = S.normF(13, '9CA3AF');
        rt += 1;
      }
      entries.forEach((entry, i) => {
        let name, club;
        if (isTeam) {
          const memberNames = (entry.members || []).map((m) => m.name).filter(Boolean).join(' & ');
          name = entry.team_name || memberNames || 'Echipă';
          club = entry.club_name || entry.members?.[0]?.club?.name || '';
        } else {
          name = athleteName(entry.athlete_details);
          club = entry.athlete_details?.club?.name || '';
        }
        wsT.addRow(['', name, club]);
        const row = wsT.lastRow;
        row.height = 24;
        row.getCell(2).font = S.boldF(13); row.getCell(2).alignment = S.LC;
        row.getCell(3).font = S.normF(13, '4B5563'); row.getCell(3).alignment = S.LC;
        if (i % 2 === 1) { row.getCell(2).fill = S.GRAY_BG; row.getCell(3).fill = S.GRAY_BG; }
        rt = row.number + 1;
      });
      rt += 1; // spacer
    });
  });

  // ─── Sheet: Lupta ───
  const wsL = wb.addWorksheet('Lupta');
  sheetTitleRow(wsL, eventTitle + ' — Luptă', 6, S);
  wsL.getColumn(2).width = 34; wsL.getColumn(3).width = 28; wsL.getColumn(4).width = 16; wsL.getColumn(5).width = 16; wsL.getColumn(6).width = 18;

  let rl = 3;
  groupsSorted.forEach((group) => {
    const cats = sortByOrder((catsByGroup[group.id] || []).filter((c) => c.type === 'fight'));
    cats.forEach((cat) => {
      catDetailAnchor[cat.id] = { sheet: 'Lupta', row: rl };
      const hdrCell = wsL.getCell(rl, 1);
      hdrCell.value = `${group.name} — ${cat.name} (${GENDER_LABELS[cat.gender] || cat.gender})`;
      hdrCell.font = S.boldF(14, 'FFFFFF');
      hdrCell.fill = S.DARK_HDR;
      hdrCell.alignment = S.LC;
      wsL.getRow(rl).height = 26;
      try { wsL.mergeCells(rl, 1, rl, 5); } catch { /* no-op */ }
      const backCell = wsL.getCell(rl, 6);
      backCell.value = { text: '← Centralizator', hyperlink: `#'Centralizator'!A${catCentralRow[cat.id]}` };
      backCell.font = S.boldF(13, 'FFFFFF');
      backCell.alignment = S.CC;
      rl += 1;

      wsL.addRow(['', 'Nume', 'Club', 'Greutate trimisă', 'Greutate confirmată', '']);
      wsL.lastRow.eachCell((c, colNum) => { if (colNum > 1) { c.font = S.boldF(12.5, '374151'); c.alignment = S.CC; c.fill = S.GRAY_BG; } });
      rl = wsL.lastRow.number + 1;

      const entries = cat.enrolled_athletes || [];
      if (entries.length === 0) {
        wsL.getCell(rl, 1).value = '(niciun înscris)';
        wsL.getCell(rl, 1).font = S.normF(13, '9CA3AF');
        rl += 1;
      }
      entries.forEach((entry, i) => {
        const a = entry.athlete_details;
        const athleteId = a?.id || entry.athlete;
        const fw = weightByAthleteCat[`${cat.id}:${athleteId}`];
        wsL.addRow(['', athleteName(a), a?.club?.name || '', fw?.pre_weight_kg || entry.weight || '', fw?.current_weight_kg || '', '']);
        const row = wsL.lastRow;
        row.height = 24;
        row.getCell(2).font = S.boldF(13); row.getCell(2).alignment = S.LC;
        row.getCell(3).font = S.normF(13, '4B5563'); row.getCell(3).alignment = S.LC;
        row.getCell(4).alignment = S.CC; row.getCell(4).font = S.normF(13);
        row.getCell(5).alignment = S.CC; row.getCell(5).font = S.boldF(13, fw?.current_weight_kg ? '059669' : '000000');
        if (i % 2 === 1) [2, 3, 4, 5].forEach((ci) => { if (!row.getCell(ci).fill?.fgColor) row.getCell(ci).fill = S.GRAY_BG; });
        rl = row.number + 1;
      });
      rl += 1; // spacer
    });
  });

  // ─── Sheet: Piramide ───
  const wsP = wb.addWorksheet('Piramide');
  sheetTitleRow(wsP, eventTitle + ' — Piramide (bracket-uri)', 6, S);
  let rp = 3;
  const catBracketAnchor = {}; // catId -> cell address on Piramide

  groupsSorted.forEach((group) => {
    const cats = sortByOrder((catsByGroup[group.id] || []).filter((c) => c.type === 'fight'));
    cats.forEach((cat) => {
      const catMatches = matchesByCategory[cat.id] || [];
      if (catMatches.length === 0) return; // no bracket generated yet - nothing to draw
      catBracketAnchor[cat.id] = wsP.getCell(rp, 1).address;
      const { nextRow } = drawBracketSection(
        wsP, catMatches, `${group.name} — ${cat.name} (${GENDER_LABELS[cat.gender] || cat.gender})`, rp, S,
      );
      rp = nextRow;
    });
  });

  // ─── Backfill Centralizator's Detaliu/Bracket link columns ───
  Object.entries(catCentralRow).forEach(([catIdStr, rowNum]) => {
    const catId = Number(catIdStr);
    const anchor = catDetailAnchor[catId];
    if (anchor) {
      const cell = wsC.getCell(rowNum, 6);
      cell.value = { text: 'Vezi →', hyperlink: `#'${anchor.sheet}'!A${anchor.row}` };
      cell.font = S.boldF(13, '1D4ED8');
      cell.alignment = S.CC;
    }
    const bracketAddr = catBracketAnchor[catId];
    if (bracketAddr) {
      const cell = wsC.getCell(rowNum, 7);
      cell.value = { text: 'Bracket →', hyperlink: `#'Piramide'!${bracketAddr}` };
      cell.font = S.boldF(13, '059669');
      cell.alignment = S.CC;
    }
  });

  return wb;
}

export function downloadWorkbook(wb, filename) {
  return wb.xlsx.writeBuffer().then((buf) => {
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}
