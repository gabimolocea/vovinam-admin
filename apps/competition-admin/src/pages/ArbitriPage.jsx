import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CentralizatorContext } from './CategoriesLayout';
import {
  competitionRefereeAPI, athleteAPI,
  categoryRefereeAssignmentAPI, matchRefereeAssignmentAPI,
  fieldAPI,
} from '@shared/lib/api';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui';
import { FileText, Pencil, Plus, X } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROLE_LABELS = {
  central: 'Arbitru central',
  corner: 'Arbitru de colț',
  table: 'Arbitru masă centrală',
  secretariat: 'Secretariat',
};

const EVENT_TYPE_LABELS = {
  competition: 'Competiție',
  examination: 'Examen',
  training_seminar: 'Seminar de pregătire',
};

// pdf-lib's standard fonts only support WinAnsi (cp1252), which has no
// ă/â/î/ș/ț - strip them rather than pull in a custom Unicode font just for
// one document.
const stripDiacritics = (s) => String(s ?? '')
  .replace(/[ăâ]/g, 'a').replace(/[ĂÂ]/g, 'A')
  .replace(/î/g, 'i').replace(/Î/g, 'I')
  .replace(/[șş]/g, 's').replace(/[ȘŞ]/g, 'S')
  .replace(/[țţ]/g, 't').replace(/[ȚŢ]/g, 'T');

export default function ArbitriPage() {
  const ctx = useContext(CentralizatorContext);
  const { eventId, eventData } = ctx || {};

  const [rosterRefs, setRosterRefs] = useState([]);
  const [allReferees, setAllReferees] = useState([]);
  const [catRefAssignments, setCatRefAssignments] = useState([]);
  const [matchRefAssignments, setMatchRefAssignments] = useState([]);
  const [catAssignments, setCatAssignments] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [editingRef, setEditingRef] = useState(null);
  const [editForm, setEditForm] = useState({ role: '', license_number: '' });

  const normalizeList = useCallback((response) => {
    if (Array.isArray(response?.data)) return response.data;
    return response?.data?.results || [];
  }, []);

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [rosterRes, allRefsRes, catRefRes, matchRefRes, catAssRes, fieldsRes] = await Promise.all([
        competitionRefereeAPI.list({ event_id: eventId }),
        athleteAPI.list({ is_referee: true }),
        categoryRefereeAssignmentAPI.list({ event_id: eventId }),
        matchRefereeAssignmentAPI.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        fieldAPI.list({ event_id: eventId }),
      ]);
      setRosterRefs(normalizeList(rosterRes));
      setAllReferees(normalizeList(allRefsRes).filter(a => a.is_referee));
      setCatRefAssignments(normalizeList(catRefRes));
      setMatchRefAssignments(normalizeList(matchRefRes));
      setCatAssignments(normalizeList(catAssRes));
      setFields(normalizeList(fieldsRes).sort((a, b) => (a.field_number ?? 0) - (b.field_number ?? 0)));
    } catch (err) {
      console.error('Failed to load referee data', err);
    } finally {
      setLoading(false);
    }
  }, [eventId, normalizeList]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!ctx) return null;

  const formatGradeLabel = (value) => {
    if (!value) return '—';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      return value.name || value.label || value.title || '—';
    }
    return '—';
  };

  const rosterAthleteIds = new Set(rosterRefs.map(r => r.athlete));

  const availableRefs = useMemo(() => (
    allReferees
      .filter(a =>
        search === '' ||
        `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase().includes(search.toLowerCase()) ||
        (a.club_name || '').toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => `${a.last_name || ''} ${a.first_name || ''}`.localeCompare(`${b.last_name || ''} ${b.first_name || ''}`))
  ), [allReferees, search]);

  const getRefDetailedAssignments = (athleteId) => {
    const assignments = [];
    for (const a of catRefAssignments) {
      const slots = [];
      for (let i = 1; i <= 5; i++) {
        if (a[`referee_${i}`] === athleteId) slots.push(`A${i}`);
      }
      if (slots.length > 0) {
        const fieldAss = catAssignments.find(fa => fa.category === a.category);
        const field = fieldAss ? fields.find(f => f.id === fieldAss.field) : null;
        assignments.push({
          type: 'category',
          name: a.category_name || `Cat #${a.category}`,
          slots,
          fieldName: field?.name || null,
          fieldId: fieldAss?.field || null,
          order: fieldAss?.order ?? 999,
          duration: fieldAss?.estimated_duration || 15,
        });
      }
    }
    for (const a of matchRefAssignments) {
      const slots = [];
      for (let i = 1; i <= 5; i++) {
        if (a[`referee_${i}`] === athleteId) slots.push(`A${i}`);
      }
      if (slots.length > 0) {
        assignments.push({
          type: 'match',
          name: a.match_name || `Meci #${a.match}`,
          slots,
          fieldName: null,
          fieldId: null,
          order: 999,
          duration: 10,
        });
      }
    }
    return assignments;
  };

  const getRefConflicts = (athleteId) => {
    const assignments = getRefDetailedAssignments(athleteId);
    const byField = {};
    for (const a of assignments) {
      if (!a.fieldId) continue;
      if (!byField[a.fieldId]) byField[a.fieldId] = [];
      byField[a.fieldId].push(a);
    }

    const fieldTimelines = {};
    for (const [fieldId, items] of Object.entries(byField)) {
      const allFieldCatAssigns = catAssignments
        .filter(fa => fa.field === parseInt(fieldId))
        .sort((a, b) => a.order - b.order);

      let accumulated = 0;
      const timeMap = {};
      for (const fa of allFieldCatAssigns) {
        timeMap[fa.category] = { offset: accumulated, duration: fa.estimated_duration || 15 };
        accumulated += fa.estimated_duration || 15;
      }

      for (const item of items) {
        if (item.type === 'category') {
          const catAss = catRefAssignments.find(a => a.category_name === item.name);
          const catId = catAss?.category;
          const tm = catId ? timeMap[catId] : null;
          if (tm) {
            const field = fields.find(f => f.id === parseInt(fieldId));
            if (!fieldTimelines[fieldId]) fieldTimelines[fieldId] = [];
            fieldTimelines[fieldId].push({
              name: item.name,
              startOffset: tm.offset,
              endOffset: tm.offset + tm.duration,
              fieldName: field?.name || item.fieldName,
            });
          }
        }
      }
    }

    const conflicts = [];
    const fieldIds = Object.keys(fieldTimelines);
    for (let i = 0; i < fieldIds.length; i++) {
      for (let j = i + 1; j < fieldIds.length; j++) {
        for (const a of fieldTimelines[fieldIds[i]]) {
          for (const b of fieldTimelines[fieldIds[j]]) {
            if (a.startOffset < b.endOffset && b.startOffset < a.endOffset) {
              conflicts.push({ item1: `${a.name} (${a.fieldName})`, item2: `${b.name} (${b.fieldName})` });
            }
          }
        }
      }
    }
    return conflicts;
  };

  const addToRoster = async (athleteId) => {
    setBusy(true);
    try {
      await competitionRefereeAPI.create({ event: eventId, athlete: athleteId });
      await fetchData();
    } catch (err) { console.error(err); }
    finally {
      setBusy(false);
      setShowAddPicker(false);
      setSearch('');
    }
  };

  const removeFromRoster = async (id) => {
    setBusy(true);
    try {
      await competitionRefereeAPI.delete(id);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setBusy(false); }
  };

  const closeAddPicker = () => {
    setShowAddPicker(false);
    setSearch('');
  };

  const openEdit = (entry) => {
    setEditingRef(entry);
    setEditForm({
      role: entry.role || '',
      license_number: entry.license_number || '',
    });
  };

  const closeEdit = () => setEditingRef(null);

  const saveEdit = async () => {
    if (!editingRef) return;
    setBusy(true);
    try {
      await competitionRefereeAPI.update(editingRef.id, {
        role: editForm.role,
        license_number: editForm.license_number.trim(),
      });
      await fetchData();
      setEditingRef(null);
    } catch (err) { console.error(err); }
    finally { setBusy(false); }
  };

  const generateDelegation = async () => {
    const title = stripDiacritics(eventData?.name || `Competitia #${eventId}`);
    const dateRange = (() => {
      if (!eventData?.start_date) return '-';
      const start = new Date(eventData.start_date).toLocaleDateString('ro-RO');
      const end = eventData?.end_date ? new Date(eventData.end_date).toLocaleDateString('ro-RO') : null;
      return end && end !== start ? `${start} - ${end}` : start;
    })();
    const location = stripDiacritics([eventData?.city_name, eventData?.address].filter(Boolean).join(', ') || '-');
    const tip = stripDiacritics(EVENT_TYPE_LABELS[eventData?.event_type] || eventData?.event_type || '-');

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 50;
    const COL_W = [30, 150, 70, 110, 65, 70];
    const COL_X = [MARGIN];
    COL_W.forEach((w, i) => COL_X.push(COL_X[i] + w));
    const TABLE_W = COL_W.reduce((a, b) => a + b, 0);
    const HEADERS = ['#', 'Nume', 'Cat.', 'Rol delegat', 'Licenta', 'Judet'];
    const ROW_H = 20;
    const HEADER_ROW_H = 22;

    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let logoImage = null;
    try {
      // The source logo is a 4584x4584 PNG - embedding it as-is would bloat
      // the PDF to nearly 1MB for a 56pt-tall image, so downscale it on a
      // canvas first.
      const logoBlob = await fetch('/frvv-logo.png').then((r) => r.blob());
      const bitmap = await createImageBitmap(logoBlob);
      const LOGO_PX = 200;
      const canvas = document.createElement('canvas');
      canvas.width = LOGO_PX;
      canvas.height = LOGO_PX;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, LOGO_PX, LOGO_PX);
      const resizedBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const logoBytes = await resizedBlob.arrayBuffer();
      logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (err) {
      console.error('Failed to embed federation logo in delegation PDF', err);
    }

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const fitText = (font, text, size, maxWidth) => {
      if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
      let out = text;
      while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
        out = out.slice(0, -1);
      }
      return `${out}...`;
    };

    const centerAt = (text, cx, cy, font, size) => {
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: cx - w / 2, y: cy, size, font });
    };

    const drawDocHeader = () => {
      if (logoImage) {
        const LOGO_SIZE = 56;
        page.drawImage(logoImage, { x: MARGIN, y: PAGE_H - MARGIN - LOGO_SIZE + 14, width: LOGO_SIZE, height: LOGO_SIZE });
      }
      centerAt('FEDERATIA ROMANA DE VOVINAM VIET VO DAO', PAGE_W / 2, y, fontBold, 14);
      y -= 18;
      centerAt('COMISIA DE ARBITRI', PAGE_W / 2, y, fontBold, 11);
      y -= 22;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + TABLE_W, y }, thickness: 1.5 });
      y -= 26;
      centerAt('DELEGARE OFICIALA', PAGE_W / 2, y, fontBold, 20);
      y -= 12;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + TABLE_W, y }, thickness: 1.5 });
      y -= 28;

      [['Competitia: ', title], ['Data: ', dateRange], ['Locatia: ', location], ['Tip: ', tip]].forEach(([label, value]) => {
        page.drawText(label, { x: MARGIN, y, size: 11, font: fontBold });
        const labelW = fontBold.widthOfTextAtSize(label, 11);
        page.drawText(value, { x: MARGIN + labelW, y, size: 11, font: fontRegular });
        y -= 18;
      });
      y -= 14;
    };

    const drawTableHeader = () => {
      page.drawRectangle({ x: MARGIN, y: y - HEADER_ROW_H, width: TABLE_W, height: HEADER_ROW_H, color: rgb(0.12, 0.16, 0.22) });
      HEADERS.forEach((h, i) => {
        page.drawText(h, { x: COL_X[i] + 6, y: y - HEADER_ROW_H + 7, size: 10, font: fontBold, color: rgb(1, 1, 1) });
      });
      for (let i = 0; i <= COL_W.length; i++) {
        page.drawLine({ start: { x: COL_X[i], y }, end: { x: COL_X[i], y: y - HEADER_ROW_H }, thickness: 1 });
      }
      page.drawLine({ start: { x: MARGIN, y: y - HEADER_ROW_H }, end: { x: MARGIN + TABLE_W, y: y - HEADER_ROW_H }, thickness: 1 });
      y -= HEADER_ROW_H;
    };

    drawDocHeader();
    drawTableHeader();

    const drawRow = (values) => {
      if (y - ROW_H < MARGIN + 20) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
        drawTableHeader();
      }
      const rowTop = y;
      values.forEach((val, i) => {
        const text = fitText(fontRegular, val, 9, COL_W[i] - 10);
        page.drawText(text, { x: COL_X[i] + 5, y: rowTop - ROW_H + 6, size: 9, font: fontRegular });
      });
      for (let i = 0; i <= COL_W.length; i++) {
        page.drawLine({ start: { x: COL_X[i], y: rowTop }, end: { x: COL_X[i], y: rowTop - ROW_H }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
      }
      page.drawLine({ start: { x: MARGIN, y: rowTop - ROW_H }, end: { x: MARGIN + TABLE_W, y: rowTop - ROW_H }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
      y -= ROW_H;
    };

    if (rosterRows.length === 0) {
      drawRow(['', 'Niciun arbitru adaugat.', '', '', '', '']);
    } else {
      rosterRows.forEach((entry, index) => {
        drawRow([
          String(index + 1),
          stripDiacritics(entry.athlete_name || `Arbitru #${entry.athlete}`),
          stripDiacritics(entry.category_display || '-'),
          stripDiacritics(ROLE_LABELS[entry.role] || '-'),
          stripDiacritics(entry.license_number || '-'),
          stripDiacritics(entry.county || '-'),
        ]);
      });
    }

    if (y - 140 < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    y -= 60;
    const col1CenterX = MARGIN + TABLE_W * 0.25;
    const col2CenterX = MARGIN + TABLE_W * 0.75;
    const lineHalfWidth = TABLE_W * 0.175;
    page.drawLine({ start: { x: col1CenterX - lineHalfWidth, y }, end: { x: col1CenterX + lineHalfWidth, y }, thickness: 1 });
    page.drawLine({ start: { x: col2CenterX - lineHalfWidth, y }, end: { x: col2CenterX + lineHalfWidth, y }, thickness: 1 });
    centerAt('Presedinte Comisia de Arbitri', col1CenterX, y - 14, fontBold, 10);
    centerAt('Director Tehnic National', col2CenterX, y - 14, fontBold, 10);

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const fileNameSafe = (eventData?.name || `competitie_${eventId}`).replace(/[^a-zA-Z0-9]+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Delegare_Oficiala_${fileNameSafe}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const handleGenerateDelegation = () => {
    generateDelegation().catch((err) => console.error('Failed to generate delegation PDF', err));
  };

  const toggleRefPresence = async (athleteId) => {
    if (busy) return;

    const isAlreadyAdded = rosterAthleteIds.has(athleteId);
    setBusy(true);
    try {
      if (isAlreadyAdded) {
        const rosterEntry = rosterRefs.find(r => r.athlete === athleteId);
        if (rosterEntry?.id) {
          await competitionRefereeAPI.delete(rosterEntry.id);
        }
      } else {
        await competitionRefereeAPI.create({ event: eventId, athlete: athleteId });
      }
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const rosterRows = useMemo(() => (
    rosterRefs
      .map(entry => ({
        ...entry,
        assignments: getRefDetailedAssignments(entry.athlete),
        conflicts: getRefConflicts(entry.athlete),
      }))
      .sort((a, b) => (a.athlete_name || '').localeCompare(b.athlete_name || ''))
  ), [rosterRefs, catRefAssignments, matchRefAssignments, catAssignments, fields]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Se încarcă arbitrii...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-2">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Arbitri</h2>
            <p className="mt-1 text-xs text-muted-foreground">{rosterRows.length} arbitri participanți</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleGenerateDelegation}>
              <FileText className="h-4 w-4" />
              Delegare Oficială (PDF)
            </Button>
            <Button type="button" size="sm" onClick={() => setShowAddPicker(true)}>
              <Plus className="h-4 w-4" />
              Adaugă arbitru
            </Button>
          </div>
        </div>

        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px] text-center">Nr</TableHead>
              <TableHead>Arbitru</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>Cat.</TableHead>
              <TableHead>Rol delegat</TableHead>
              <TableHead className="w-[110px] text-center">Conflicte</TableHead>
              <TableHead className="w-[140px] text-center">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rosterRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  Nu există arbitri adăugați pentru această competiție.
                </TableCell>
              </TableRow>
            ) : (
              rosterRows.map((entry, index) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{entry.athlete_name || `Arbitru #${entry.athlete}`}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.club_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.category_display || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ROLE_LABELS[entry.role] || '—'}</TableCell>
                  <TableCell className="text-center">
                    {entry.conflicts.length > 0 ? (
                      <Badge variant="destructive">{entry.conflicts.length}</Badge>
                    ) : (
                      <Badge variant="secondary">0</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openEdit(entry)}
                        disabled={busy}
                        title="Editează rol / licență / județ"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeFromRoster(entry.id)}
                        disabled={busy}
                        title="Scoate arbitrul din competiție"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showAddPicker} onOpenChange={(open) => (open ? setShowAddPicker(true) : closeAddPicker())}>
        <DialogContent fullScreen>
          <DialogHeader>
            <DialogTitle>Adaugă arbitru</DialogTitle>
            <DialogDescription>Selectează unul dintre arbitrii disponibili</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută arbitru..."
            />

            <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card">
              {availableRefs.length === 0 ? (
                <div className="px-3 py-5 text-center text-sm text-muted-foreground">
                  {search ? 'Niciun arbitru găsit.' : 'Nu există arbitri disponibili.'}
                </div>
              ) : (
                availableRefs.map(ref => {
                  const isSelected = rosterAthleteIds.has(ref.id);
                  return (
                    <button
                      key={ref.id}
                      type="button"
                      onClick={() => toggleRefPresence(ref.id)}
                      disabled={busy}
                      className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left transition disabled:opacity-50 last:border-b-0 ${
                        isSelected ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20' : 'hover:bg-accent'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-bold ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-input bg-background text-transparent'
                        }`}>
                          ✓
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {`${ref.last_name || ''} ${ref.first_name || ''}`.trim() || ref.athlete_name || `Arbitru #${ref.id}`}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {(ref.club_name || 'fără club')} · {formatGradeLabel(ref.current_grade || ref.grade)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingRef)} onOpenChange={(open) => (open ? null : closeEdit())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează arbitru</DialogTitle>
            <DialogDescription>
              {editingRef?.athlete_name || `Arbitru #${editingRef?.athlete}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rol delegat
              </label>
              <Select
                value={editForm.role || 'none'}
                onValueChange={(value) => setEditForm(f => ({ ...f, role: value === 'none' ? '' : value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Fără rol</SelectItem>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Licență
              </label>
              <Input
                type="text"
                value={editForm.license_number}
                onChange={(e) => setEditForm(f => ({ ...f, license_number: e.target.value }))}
                placeholder="Nr. licență arbitru"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Județul este preluat automat din localitatea clubului arbitrului.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={closeEdit} disabled={busy}>
                Anulează
              </Button>
              <Button type="button" size="sm" onClick={saveEdit} disabled={busy}>
                {busy ? 'Se salvează...' : 'Salvează'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
