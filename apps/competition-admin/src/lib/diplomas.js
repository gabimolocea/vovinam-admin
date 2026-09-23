import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import robotoRegularUrl from '../assets/fonts/Roboto-Regular.ttf?url';
import robotoBoldUrl from '../assets/fonts/Roboto-Bold.ttf?url';

export const DIPLOMA_TEMPLATE_OPTIONS = [
  { value: 'first_place', label: 'Diplomă locul 1' },
  { value: 'second_place', label: 'Diplomă locul 2' },
  { value: 'third_place', label: 'Diplomă locul 3' },
  { value: 'participation', label: 'Diplomă participare' },
];

export const DIPLOMA_CATEGORY_SCOPE_OPTIONS = [
  { value: 'all', label: 'Else / fallback' },
  { value: 'solo', label: 'Solo' },
  { value: 'team', label: 'Echipă' },
  { value: 'fight', label: 'Luptă' },
];

// `scopes` lists which specific category scopes (solo/team/fight) a field
// is relevant to - never 'all' itself, which getAvailableDiplomaFields
// handles separately (a scope: 'all' template is a generic fallback that
// can end up used by any category type, so it gets every field on offer).
export const DIPLOMA_FIELDS = [
  {
    key: 'athlete_name',
    label: 'Nume sportiv',
    scopes: ['solo', 'fight'],
  },
  {
    key: 'club_name',
    label: 'Club',
    scopes: ['solo', 'team', 'fight'],
  },
  {
    key: 'athlete_with_club',
    label: 'Nume sportiv (club)',
    scopes: ['solo', 'fight'],
  },
  {
    key: 'team_with_club',
    label: 'Nume echipă (club)',
    scopes: ['team'],
  },
  {
    key: 'group_with_gender',
    label: 'Grupa + gen',
    scopes: ['solo', 'team', 'fight'],
  },
  {
    key: 'event_name',
    label: 'Nume competiție',
    scopes: ['solo', 'team', 'fight'],
  },
  {
    key: 'place_label',
    label: 'Loc / tip diplomă',
    scopes: ['solo', 'team', 'fight'],
  },
];

const DIPLOMA_FIELD_BINDINGS = {
  athlete_name: 'payload.participant.athlete_name',
  athlete_with_club: 'payload.participant.athlete_with_club',
  club_name: 'payload.participant.club_name',
  team_name: 'payload.participant.team_name',
  team_with_club: 'payload.participant.team_with_club',
  group_name: 'payload.category.group_name',
  group_with_gender: 'payload.category.group_with_gender',
  category_name: 'payload.category.category_name',
  gender: 'payload.category.gender',
  event_name: 'payload.event.event_name',
  place_label: 'payload.result.place_label',
};

const DIPLOMA_PAYLOAD_EXAMPLES = {
  all: {
    payload: {
      scope: 'fallback',
      participant: {
        athlete_with_club: 'POPESCU ANDREI – CS DRAGONUL ROSU',
        team_with_club: 'ECHIPA A – CS DRAGONUL ROSU',
      },
      category: {
        group_with_gender: 'CADETI (2010-2012) MASCULIN',
      },
      event: {
        event_name: 'CAMPIONAT NATIONAL',
      },
      result: {
        place_label: 'LOCUL I',
      },
    },
  },
  solo: {
    payload: {
      participant: {
        athlete_name: 'POPESCU ANDREI',
        athlete_with_club: 'POPESCU ANDREI – CS DRAGONUL ROSU',
        club_name: 'CS DRAGONUL ROSU',
      },
      category: {
        category_name: 'THAP TU QUYEN',
        group_name: 'CADETI (2010-2012)',
        group_with_gender: 'CADETI (2010-2012) MASCULIN',
        gender: 'MASCULIN',
      },
      event: {
        event_name: 'CAMPIONAT NATIONAL',
      },
      result: {
        place_label: 'LOCUL I',
      },
    },
  },
  team: {
    payload: {
      participant: {
        team_name: 'ECHIPA A',
        team_with_club: 'ECHIPA A – CS DRAGONUL ROSU',
        club_name: 'CS DRAGONUL ROSU',
      },
      category: {
        category_name: 'SONG LUYEN',
        group_name: 'SENIORI',
        group_with_gender: 'SENIORI MIXT',
        gender: 'MIXT',
      },
      event: {
        event_name: 'CAMPIONAT NATIONAL',
      },
      result: {
        place_label: 'LOCUL I',
      },
    },
  },
  fight: {
    payload: {
      participant: {
        athlete_name: 'IONESCU MIHAI',
        athlete_with_club: 'IONESCU MIHAI – CS DRAGONUL ROSU',
        club_name: 'CS DRAGONUL ROSU',
      },
      category: {
        category_name: 'LUPTA -60 KG',
        group_name: 'JUNIORI',
        group_with_gender: 'JUNIORI MASCULIN',
        gender: 'MASCULIN',
      },
      event: {
        event_name: 'CAMPIONAT NATIONAL',
      },
      result: {
        place_label: 'LOCUL I',
      },
    },
  },
};

export function createDiplomaPlacement(field) {
  return {
    id: `${field.key}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    field_key: field.key,
    label: field.label,
    sample: `{{${DIPLOMA_FIELD_BINDINGS[field.key] || field.key}}}`,
    x: 50,
    y: 50,
    font_size: 26,
    width: 40,
    max_length: 0,
    align: 'center',
    bold: false,
    color: '#111827',
  };
}

export function getAvailableDiplomaFields(scope = 'all') {
  if (scope === 'all') return DIPLOMA_FIELDS;
  return DIPLOMA_FIELDS.filter((field) => field.scopes.includes(scope));
}

export function getDiplomaTemplateLabel(kind) {
  return DIPLOMA_TEMPLATE_OPTIONS.find((option) => option.value === kind)?.label || kind;
}

export function getDiplomaCategoryScopeLabel(scope) {
  return DIPLOMA_CATEGORY_SCOPE_OPTIONS.find((option) => option.value === scope)?.label || scope;
}

export function getDiplomaFieldBinding(fieldKey) {
  return DIPLOMA_FIELD_BINDINGS[fieldKey] || fieldKey;
}

export function getDiplomaFieldToken(fieldKey) {
  return `{{${getDiplomaFieldBinding(fieldKey)}}}`;
}

export function getDiplomaPayloadExample(scope = 'all') {
  const normalizedScope = normalizeDiplomaScope(scope);
  return DIPLOMA_PAYLOAD_EXAMPLES[normalizedScope] || DIPLOMA_PAYLOAD_EXAMPLES.solo;
}

function getGroupYearsLabel(group) {
  if (!group) return '';

  if (group.birth_date_start && group.birth_date_end) {
    const startYear = new Date(group.birth_date_start).getFullYear();
    const endYear = new Date(group.birth_date_end).getFullYear();
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return `${startYear}-${endYear}`;
    }
  }

  if (group.birth_year_start && group.birth_year_end) {
    return `${group.birth_year_start}-${group.birth_year_end}`;
  }

  return '';
}

export function formatDiplomaGroupLabel(group) {
  if (!group) return '—';
  const baseName = String(group.name || '—').trim();
  const years = getGroupYearsLabel(group);
  return years ? `${baseName} (${years})` : baseName;
}

export function formatDiplomaGroupWithGender(group, genderLabel = '') {
  const groupLabel = formatDiplomaGroupLabel(group);
  const normalizedGender = String(genderLabel || '').trim();
  return [groupLabel, normalizedGender].filter(Boolean).join(' ');
}

export function getTemplateKindForPlace(place) {
  if (place === 1) return 'first_place';
  if (place === 2) return 'second_place';
  if (place === 3) return 'third_place';
  return 'participation';
}

export function getPlaceLabel(place) {
  if (place === 1) return 'LOCUL I';
  if (place === 2) return 'LOCUL II';
  if (place === 3) return 'LOCUL III';
  return 'DIPLOMĂ PARTICIPARE';
}

export function normalizeDiplomaScope(scope) {
  if (scope === 'teams') return 'team';
  if (scope === 'solo' || scope === 'team' || scope === 'fight' || scope === 'all') {
    return scope;
  }
  return 'all';
}

export function resolveDiplomaTemplate(templates, { place, scope }) {
  const templateKind = getTemplateKindForPlace(place);
  const normalizedScope = normalizeDiplomaScope(scope);
  const allTemplates = (templates || []).filter(Boolean);
  const activeTemplates = allTemplates.filter((template) => template?.is_active !== false);
  const pool = activeTemplates.length > 0 ? activeTemplates : allTemplates;

  return pool.find((template) => template.template_kind === templateKind && normalizeDiplomaScope(template.category_scope) === normalizedScope)
    || pool.find((template) => template.template_kind === templateKind && normalizeDiplomaScope(template.category_scope) === 'all')
    || pool.find((template) => normalizeDiplomaScope(template.category_scope) === normalizedScope)
    || pool.find((template) => normalizeDiplomaScope(template.category_scope) === 'all')
    || pool.find((template) => template.template_kind === templateKind)
    || pool[0]
    || null;
}

export function formatValueWithClub(name, club) {
  const trimmedName = (name || '').trim();
  const trimmedClub = (club || '').trim();
  if (trimmedName && trimmedClub) return `${trimmedName} – ${trimmedClub}`;
  return trimmedName || trimmedClub || '';
}

function hexToRgb(color) {
  const normalized = String(color || '#111827').replace('#', '').trim();
  const safe = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const r = parseInt(safe.slice(0, 2), 16) / 255;
  const g = parseInt(safe.slice(2, 4), 16) / 255;
  const b = parseInt(safe.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function getPlacementText(placement, values) {
  const raw = values?.[placement.field_key];
  const maxLength = Math.max(0, Number(placement?.max_length) || 0);
  if (raw == null || raw === '') {
    const fallback = placement.sample || placement.label || '';
    return maxLength > 0 ? fallback.slice(0, maxLength) : fallback;
  }
  const text = String(raw);
  return maxLength > 0 ? text.slice(0, maxLength) : text;
}

async function loadTemplatePdf(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Nu s-a putut încărca PDF-ul șablonului.');
  }
  return response.arrayBuffer();
}

// pdf-lib's built-in Helvetica is WinAnsi-encoded, which has no ă, ș or ț -
// drawing one throws ("WinAnsi cannot encode ...") and the whole diploma
// fails. That killed every participation diploma outright, because the
// label we generate ourselves is "DIPLOMĂ PARTICIPARE", and it would have
// killed any diploma for an athlete, club or group written with proper
// Romanian spelling. Roboto (Apache-2.0, committed under src/assets/fonts)
// covers the full Romanian alphabet; it's a neutral grotesque, so diplomas
// keep looking the way they do today. Subset on embed so we only carry the
// glyphs actually used instead of ~330KB of font in every PDF.
let unicodeFontBytesPromise = null;

function loadUnicodeFontBytes() {
  if (!unicodeFontBytesPromise) {
    unicodeFontBytesPromise = Promise.all([
      fetch(robotoRegularUrl).then((response) => response.arrayBuffer()),
      fetch(robotoBoldUrl).then((response) => response.arrayBuffer()),
    ]).catch((error) => {
      // Let the next diploma retry rather than caching the failure forever.
      unicodeFontBytesPromise = null;
      throw error;
    });
  }
  return unicodeFontBytesPromise;
}

async function embedDiplomaFonts(pdfDoc) {
  try {
    const [regularBytes, boldBytes] = await loadUnicodeFontBytes();
    pdfDoc.registerFontkit(fontkit);
    return {
      fontRegular: await pdfDoc.embedFont(regularBytes, { subset: true }),
      fontBold: await pdfDoc.embedFont(boldBytes, { subset: true }),
    };
  } catch (error) {
    // Worst case (font asset missing from the build), fall back to the old
    // behaviour: plain-ASCII diplomas still come out, diacritics still fail.
    console.error('Nu s-a putut încărca fontul Unicode pentru diplome:', error);
    return {
      fontRegular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      fontBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };
  }
}

async function renderDiplomaPdfBytes({ template, values }) {
  const existingPdfBytes = await loadTemplatePdf(template.pdf_url);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const { fontRegular, fontBold } = await embedDiplomaFonts(pdfDoc);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();

  (template.placements || []).forEach((placement) => {
    const text = getPlacementText(placement, values);
    if (!text) return;

    const fontSize = Math.max(8, Number(placement.font_size) || 26);
    const drawFont = placement.bold ? fontBold : fontRegular;
    const textWidth = drawFont.widthOfTextAtSize(text, fontSize);
    const widthPercent = Math.max(5, Math.min(100, Number(placement.width) || 40));
    const boxWidth = (widthPercent / 100) * pageWidth;
    const centerX = (Math.max(0, Math.min(100, Number(placement.x) || 0)) / 100) * pageWidth;
    const topY = (Math.max(0, Math.min(100, Number(placement.y) || 0)) / 100) * pageHeight;
    const leftX = centerX - (boxWidth / 2);

    let drawX = leftX;
    if ((placement.align || 'center') === 'center') {
      drawX = centerX - (textWidth / 2);
    } else if ((placement.align || 'center') === 'right') {
      drawX = leftX + boxWidth - textWidth;
    }

    firstPage.drawText(text, {
      x: drawX,
      y: pageHeight - topY - (fontSize / 2),
      size: fontSize,
      font: drawFont,
      color: hexToRgb(placement.color),
      maxWidth: boxWidth,
      lineHeight: fontSize * 1.1,
    });
  });

  return pdfDoc.save();
}

function openPdfBytesInBrowser(outputBytes, previewWindow, fileName) {
  const blob = new Blob([outputBytes], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);

  const preview = previewWindow && !previewWindow.closed ? previewWindow : null;
  if (preview) {
    preview.location.href = objectUrl;
    preview.focus?.();
  } else {
    const fallbackWindow = typeof window !== 'undefined' ? window.open(objectUrl, '_blank') : null;
    if (fallbackWindow) {
      fallbackWindow.focus?.();
    } else {
      // Nowhere to preview it: the launcher runs these apps in an embedded
      // webview, where a new window is refused outright and window.open
      // just returns null (a browser popup blocker does the same). Both
      // paths above used to be window.open, so the diploma was rendered
      // and then silently dropped - pressing the button appeared to do
      // nothing at all. Hand the file over instead, which also happens to
      // be what you want when you're about to print a stack of them.
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${fileName || 'diploma'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function generateDiplomaPdf({ template, values, fileName, previewWindow }) {
  const outputBytes = await renderDiplomaPdfBytes({ template, values, fileName });
  openPdfBytesInBrowser(outputBytes, previewWindow, fileName);
}

export async function generateCombinedDiplomaPdf(items, previewWindow) {
  const mergedPdf = await PDFDocument.create();

  for (const item of items || []) {
    if (!item?.template) continue;
    // eslint-disable-next-line no-await-in-loop
    const renderedBytes = await renderDiplomaPdfBytes({ template: item.template, values: item.values });
    // eslint-disable-next-line no-await-in-loop
    const renderedPdf = await PDFDocument.load(renderedBytes);
    // eslint-disable-next-line no-await-in-loop
    const pages = await mergedPdf.copyPages(renderedPdf, renderedPdf.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }

  const outputBytes = await mergedPdf.save();
  openPdfBytesInBrowser(outputBytes, previewWindow, 'diplome');
}
