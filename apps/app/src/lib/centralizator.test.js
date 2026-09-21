import { describe, it, expect } from 'vitest';
import {
  isTeamCategoryType,
  parseWeightBound,
  suggestCategory,
  findMatchingGroups,
  findMatchingGroup,
} from './centralizator.js';

describe('isTeamCategoryType', () => {
  it('treats both "team" and "teams" as team categories', () => {
    expect(isTeamCategoryType('team')).toBe(true);
    expect(isTeamCategoryType('teams')).toBe(true);
  });

  it('rejects other category types', () => {
    expect(isTeamCategoryType('solo')).toBe(false);
    expect(isTeamCategoryType('fight')).toBe(false);
  });
});

describe('parseWeightBound', () => {
  it('parses a "-30kg" upper-bound category', () => {
    expect(parseWeightBound('-30kg')).toEqual({ sign: '-', value: 30 });
  });

  it('parses a "+95kg" open-ended category', () => {
    expect(parseWeightBound('+95kg')).toEqual({ sign: '+', value: 95 });
  });

  it('parses decimal weights and is case-insensitive on the unit', () => {
    expect(parseWeightBound('-56.5KG')).toEqual({ sign: '-', value: 56.5 });
  });

  it('returns null for a name with no weight bound', () => {
    expect(parseWeightBound('Cadeti Masculin')).toBeNull();
  });
});

describe('suggestCategory', () => {
  const categories = [
    { id: 1, name: '-30kg' },
    { id: 2, name: '-45kg' },
    { id: 3, name: '-60kg' },
    { id: 4, name: '+60kg' },
  ];

  it('returns null when weight is null/NaN', () => {
    expect(suggestCategory(null, categories)).toBeNull();
    expect(suggestCategory(NaN, categories)).toBeNull();
  });

  it('picks the first upper-bound category the weight fits under', () => {
    expect(suggestCategory(28, categories).id).toBe(1);
    expect(suggestCategory(30, categories).id).toBe(1);
    expect(suggestCategory(31, categories).id).toBe(2);
    expect(suggestCategory(44, categories).id).toBe(2);
  });

  it('falls back to the open-ended "+" category when the weight exceeds every bound', () => {
    expect(suggestCategory(75, categories).id).toBe(4);
  });

  it('returns null when there is no matching bound and no "+" fallback', () => {
    const noFallback = categories.slice(0, 3);
    expect(suggestCategory(75, noFallback)).toBeNull();
  });

  it('ignores category names it cannot parse a weight bound from', () => {
    const withJunk = [{ id: 9, name: 'Categorie fara greutate' }, ...categories];
    expect(suggestCategory(28, withJunk).id).toBe(1);
  });
});

describe('findMatchingGroups / findMatchingGroup', () => {
  it('returns [] when there is no date of birth', () => {
    expect(findMatchingGroups(null, [{ id: 1 }])).toEqual([]);
    expect(findMatchingGroup(null, [{ id: 1 }])).toBeNull();
  });

  it('returns [] for an unparseable date of birth', () => {
    expect(findMatchingGroups('not-a-date', [{ id: 1 }])).toEqual([]);
  });

  it('matches a closed birth_date_start/end window (inclusive)', () => {
    const groups = [{ id: 1, birth_date_start: '2010-01-01', birth_date_end: '2012-12-31' }];
    expect(findMatchingGroup('2011-06-15', groups)?.id).toBe(1);
    expect(findMatchingGroup('2010-01-01', groups)?.id).toBe(1);
    expect(findMatchingGroup('2012-12-31', groups)?.id).toBe(1);
    expect(findMatchingGroup('2013-01-01', groups)).toBeNull();
    expect(findMatchingGroup('2009-12-31', groups)).toBeNull();
  });

  it('matches a closed birth_year_start/end window (inclusive)', () => {
    const groups = [{ id: 1, birth_year_start: 2010, birth_year_end: 2012 }];
    expect(findMatchingGroup('2011-06-15', groups)?.id).toBe(1);
    expect(findMatchingGroup('2013-01-01', groups)).toBeNull();
  });

  // Per Group.eligibility_warnings() on the backend: an only-start-set
  // group means "this age or older" (born that date/year or EARLIER) - the
  // opposite direction from how `start` behaves when paired with an `end`.
  it('treats an open-start-only birth_date bound as "born on/before start" (Seniors-style "+")', () => {
    const groups = [{ id: 1, birth_date_start: '2008-01-01' }];
    expect(findMatchingGroup('2005-01-01', groups)?.id).toBe(1);
    expect(findMatchingGroup('2008-01-01', groups)?.id).toBe(1);
    expect(findMatchingGroup('2009-01-01', groups)).toBeNull();
  });

  it('treats an open-start-only birth_year bound as "born that year or earlier"', () => {
    const groups = [{ id: 1, birth_year_start: 2008 }];
    expect(findMatchingGroup('2005-01-01', groups)?.id).toBe(1);
    expect(findMatchingGroup('2009-01-01', groups)).toBeNull();
  });

  it('treats an open-end-only bound as "born on/before end" too', () => {
    const groups = [{ id: 1, birth_date_end: '2012-12-31' }];
    expect(findMatchingGroup('2005-01-01', groups)?.id).toBe(1);
    expect(findMatchingGroup('2013-01-01', groups)).toBeNull();
  });

  it('birth_date bounds take priority over birth_year bounds when both are set', () => {
    const groups = [{ id: 1, birth_date_start: '2010-01-01', birth_date_end: '2010-12-31', birth_year_start: 1990, birth_year_end: 1995 }];
    // A 1990-born athlete would match the (ignored) year bound but not the date bound.
    expect(findMatchingGroup('1990-06-01', groups)).toBeNull();
    expect(findMatchingGroup('2010-06-01', groups)?.id).toBe(1);
  });

  it('returns every matching group in input order, not just the first', () => {
    const groups = [
      { id: 1, birth_year_start: 2008 },
      { id: 2, birth_year_start: 2005 },
      { id: 3, birth_year_start: 2000 },
    ];
    // dobYear 2003 is "<= start" for groups 1 and 2, but not for group 3.
    const matches = findMatchingGroups('2003-01-01', groups);
    expect(matches.map((g) => g.id)).toEqual([1, 2]);
  });

  it('skips a group with neither date nor year bounds set', () => {
    const groups = [{ id: 1 }, { id: 2, birth_year_start: 2008, birth_year_end: 2012 }];
    expect(findMatchingGroup('2010-01-01', groups)?.id).toBe(2);
  });
});
