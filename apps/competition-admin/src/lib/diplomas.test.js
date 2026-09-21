import { describe, it, expect } from 'vitest';
import {
  getTemplateKindForPlace,
  getPlaceLabel,
  normalizeDiplomaScope,
  resolveDiplomaTemplate,
  formatDiplomaGroupLabel,
  formatDiplomaGroupWithGender,
  formatValueWithClub,
  getDiplomaTemplateLabel,
  getDiplomaCategoryScopeLabel,
  getAvailableDiplomaFields,
} from './diplomas.js';

describe('getTemplateKindForPlace / getPlaceLabel', () => {
  it('maps places 1-3 to their medal kind/label', () => {
    expect(getTemplateKindForPlace(1)).toBe('first_place');
    expect(getPlaceLabel(1)).toBe('LOCUL I');
    expect(getTemplateKindForPlace(2)).toBe('second_place');
    expect(getPlaceLabel(2)).toBe('LOCUL II');
    expect(getTemplateKindForPlace(3)).toBe('third_place');
    expect(getPlaceLabel(3)).toBe('LOCUL III');
  });

  it('treats any other place (or none) as participation', () => {
    expect(getTemplateKindForPlace(4)).toBe('participation');
    expect(getTemplateKindForPlace(undefined)).toBe('participation');
    expect(getPlaceLabel(7)).toBe('DIPLOMĂ PARTICIPARE');
  });
});

describe('normalizeDiplomaScope', () => {
  it('normalizes the legacy "teams" spelling to "team"', () => {
    expect(normalizeDiplomaScope('teams')).toBe('team');
  });

  it('passes through known scopes unchanged', () => {
    expect(normalizeDiplomaScope('solo')).toBe('solo');
    expect(normalizeDiplomaScope('team')).toBe('team');
    expect(normalizeDiplomaScope('fight')).toBe('fight');
    expect(normalizeDiplomaScope('all')).toBe('all');
  });

  it('falls back to "all" for anything unrecognized', () => {
    expect(normalizeDiplomaScope('bogus')).toBe('all');
    expect(normalizeDiplomaScope(undefined)).toBe('all');
  });
});

describe('resolveDiplomaTemplate', () => {
  const exactMatch = { id: 1, template_kind: 'first_place', category_scope: 'solo', is_active: true };
  const kindAllFallback = { id: 2, template_kind: 'first_place', category_scope: 'all', is_active: true };
  const scopeMatchWrongKind = { id: 3, template_kind: 'participation', category_scope: 'solo', is_active: true };
  const scopeAllFallback = { id: 4, template_kind: 'participation', category_scope: 'all', is_active: true };
  const inactiveExactMatch = { id: 5, template_kind: 'second_place', category_scope: 'fight', is_active: false };

  it('prefers an exact kind+scope match', () => {
    const templates = [kindAllFallback, exactMatch, scopeAllFallback];
    const result = resolveDiplomaTemplate(templates, { place: 1, scope: 'solo' });
    expect(result.id).toBe(1);
  });

  it('falls back to kind match with scope "all" when no exact scope match exists', () => {
    const templates = [kindAllFallback, scopeAllFallback];
    const result = resolveDiplomaTemplate(templates, { place: 1, scope: 'team' });
    expect(result.id).toBe(2);
  });

  it('falls back to scope match with a different kind before falling back to scope "all"', () => {
    const templates = [scopeMatchWrongKind, scopeAllFallback];
    const result = resolveDiplomaTemplate(templates, { place: 1, scope: 'solo' });
    expect(result.id).toBe(3);
  });

  it('falls back to the last-resort scope "all" template when nothing else matches', () => {
    const templates = [scopeAllFallback];
    const result = resolveDiplomaTemplate(templates, { place: 1, scope: 'fight' });
    expect(result.id).toBe(4);
  });

  it('normalizes "teams" to "team" for matching purposes', () => {
    const teamTemplate = { id: 9, template_kind: 'first_place', category_scope: 'teams', is_active: true };
    const result = resolveDiplomaTemplate([teamTemplate], { place: 1, scope: 'teams' });
    expect(result.id).toBe(9);
  });

  it('prefers active templates over inactive ones, but falls back to inactive if that is all there is', () => {
    const onlyInactive = resolveDiplomaTemplate([inactiveExactMatch], { place: 2, scope: 'fight' });
    expect(onlyInactive.id).toBe(5);

    const activeWins = resolveDiplomaTemplate(
      [inactiveExactMatch, { ...inactiveExactMatch, id: 6, is_active: true }],
      { place: 2, scope: 'fight' },
    );
    expect(activeWins.id).toBe(6);
  });

  it('returns null for an empty/missing template list', () => {
    expect(resolveDiplomaTemplate([], { place: 1, scope: 'solo' })).toBeNull();
    expect(resolveDiplomaTemplate(null, { place: 1, scope: 'solo' })).toBeNull();
  });

  it('filters out null/undefined entries in the template list', () => {
    const result = resolveDiplomaTemplate([null, undefined, exactMatch], { place: 1, scope: 'solo' });
    expect(result.id).toBe(1);
  });
});

describe('formatDiplomaGroupLabel / formatDiplomaGroupWithGender', () => {
  it('returns an em dash for a missing group', () => {
    expect(formatDiplomaGroupLabel(null)).toBe('—');
  });

  it('appends a birth_date year range when both bounds are set', () => {
    const group = { name: 'Cadeti', birth_date_start: '2010-01-01', birth_date_end: '2012-12-31' };
    expect(formatDiplomaGroupLabel(group)).toBe('Cadeti (2010-2012)');
  });

  it('appends a birth_year range when both bounds are set (no birth_date)', () => {
    const group = { name: 'Seniori', birth_year_start: 1990, birth_year_end: 2000 };
    expect(formatDiplomaGroupLabel(group)).toBe('Seniori (1990-2000)');
  });

  it('omits the year range entirely when bounds are incomplete', () => {
    const group = { name: 'Seniori', birth_year_start: 1990 };
    expect(formatDiplomaGroupLabel(group)).toBe('Seniori');
  });

  it('combines the group label with a gender label', () => {
    const group = { name: 'Cadeti', birth_year_start: 2010, birth_year_end: 2012 };
    expect(formatDiplomaGroupWithGender(group, 'MASCULIN')).toBe('Cadeti (2010-2012) MASCULIN');
  });

  it('omits the gender segment when none is given', () => {
    const group = { name: 'Cadeti' };
    expect(formatDiplomaGroupWithGender(group)).toBe('Cadeti');
  });
});

describe('formatValueWithClub', () => {
  it('joins name and club with an en dash', () => {
    expect(formatValueWithClub('Popescu Andrei', 'CS Dragonul Rosu')).toBe('Popescu Andrei – CS Dragonul Rosu');
  });

  it('falls back to whichever of name/club is present', () => {
    expect(formatValueWithClub('Popescu Andrei', '')).toBe('Popescu Andrei');
    expect(formatValueWithClub('', 'CS Dragonul Rosu')).toBe('CS Dragonul Rosu');
  });

  it('trims whitespace and returns an empty string when both are blank', () => {
    expect(formatValueWithClub('  ', '  ')).toBe('');
  });
});

describe('getDiplomaTemplateLabel / getDiplomaCategoryScopeLabel', () => {
  it('resolves known option values to their label', () => {
    expect(getDiplomaTemplateLabel('first_place')).toBe('Diplomă locul 1');
    expect(getDiplomaCategoryScopeLabel('solo')).toBe('Solo');
  });

  it('falls back to echoing the raw value when unrecognized', () => {
    expect(getDiplomaTemplateLabel('bogus_kind')).toBe('bogus_kind');
  });
});

describe('getAvailableDiplomaFields', () => {
  it('returns every field for the "all" (generic fallback) scope, or when no scope is given', () => {
    expect(getAvailableDiplomaFields('all')).toHaveLength(7);
    expect(getAvailableDiplomaFields()).toHaveLength(7);
  });

  it('restricts to solo-relevant fields for scope "solo" (no team_with_club)', () => {
    const keys = getAvailableDiplomaFields('solo').map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['athlete_name', 'athlete_with_club', 'club_name', 'group_with_gender', 'event_name', 'place_label']));
    expect(keys).not.toContain('team_with_club');
  });

  it('restricts to team-relevant fields for scope "team" (no athlete_name/athlete_with_club)', () => {
    const keys = getAvailableDiplomaFields('team').map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['team_with_club', 'club_name', 'group_with_gender', 'event_name', 'place_label']));
    expect(keys).not.toContain('athlete_name');
    expect(keys).not.toContain('athlete_with_club');
  });

  it('restricts to fight-relevant fields for scope "fight" (no team_with_club)', () => {
    const keys = getAvailableDiplomaFields('fight').map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['athlete_name', 'athlete_with_club', 'club_name', 'group_with_gender', 'event_name', 'place_label']));
    expect(keys).not.toContain('team_with_club');
  });
});
