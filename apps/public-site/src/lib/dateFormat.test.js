import { describe, it, expect } from 'vitest';
import { formatIsoToDisplay, maskDateInput, displayToIso } from './dateFormat.js';

describe('formatIsoToDisplay', () => {
  it('converts an ISO date to dd.mm.aaaa', () => {
    expect(formatIsoToDisplay('2010-03-05')).toBe('05.03.2010');
  });

  it('returns an empty string for falsy input', () => {
    expect(formatIsoToDisplay('')).toBe('');
    expect(formatIsoToDisplay(null)).toBe('');
    expect(formatIsoToDisplay(undefined)).toBe('');
  });

  it('returns an empty string for a malformed ISO string', () => {
    expect(formatIsoToDisplay('2010-03')).toBe('');
  });
});

describe('maskDateInput', () => {
  it('inserts dots after day and month as digits are typed', () => {
    expect(maskDateInput('0')).toBe('0');
    expect(maskDateInput('05')).toBe('05');
    expect(maskDateInput('053')).toBe('05.3');
    expect(maskDateInput('05032010')).toBe('05.03.2010');
  });

  it('strips non-digit characters', () => {
    expect(maskDateInput('05.03.2010')).toBe('05.03.2010');
    expect(maskDateInput('05/03/2010')).toBe('05.03.2010');
  });

  it('truncates to 8 digits (ddmmyyyy)', () => {
    expect(maskDateInput('050320109999')).toBe('05.03.2010');
  });
});

describe('displayToIso', () => {
  it('converts a valid complete dd.mm.aaaa value to ISO', () => {
    expect(displayToIso('05.03.2010')).toBe('2010-03-05');
  });

  it('returns null for an incomplete value', () => {
    expect(displayToIso('05.03')).toBeNull();
    expect(displayToIso('')).toBeNull();
    expect(displayToIso(undefined)).toBeNull();
  });

  it('returns null for a calendar-invalid date (e.g. 30 February)', () => {
    expect(displayToIso('30.02.2010')).toBeNull();
  });

  it('returns null for an out-of-range day/month', () => {
    expect(displayToIso('32.01.2010')).toBeNull();
    expect(displayToIso('01.13.2010')).toBeNull();
  });

  it('accepts a leap day on a leap year but not on a non-leap year', () => {
    expect(displayToIso('29.02.2020')).toBe('2020-02-29');
    expect(displayToIso('29.02.2021')).toBeNull();
  });
});
