import { describe, it, expect } from 'vitest';
import { parseBeltGrade } from './belts.js';

describe('parseBeltGrade', () => {
  it('returns null for falsy input', () => {
    expect(parseBeltGrade('')).toBeNull();
    expect(parseBeltGrade(null)).toBeNull();
  });

  it('returns null for an unrecognized grade', () => {
    expect(parseBeltGrade('CENTURĂ VERDE')).toBeNull();
  });

  it('parses a yellow belt grade and its dang-based stripe count', () => {
    const result = parseBeltGrade('CENTURĂ GALBENĂ, 2 DANG');
    expect(result.label).toBe('C. Galbenă, 2 Dang');
    expect(result.fill).toBe('#f5c518');
    expect(result.stripeFill).toBe('#da3b26');
    // yellow's stripe base is 0 dang, so 2 dang => 2 stripes
    expect(result.stripes).toBe(2);
  });

  it('parses a red belt grade, offsetting stripes by the yellow->red base', () => {
    const result = parseBeltGrade('CENTURĂ ROŞIE, 6 DANG');
    expect(result.label).toBe('C. Roşie, 6 Dang');
    expect(result.fill).toBe('#da3b26');
    expect(result.stripeFill).toBe('#ffffff');
    // red's stripe base is 4 dang, so 6 dang => 2 stripes
    expect(result.stripes).toBe(2);
  });

  it('accepts an alternate ("ROSU") spelling for red', () => {
    const result = parseBeltGrade('CENTURA ROSU, 5 DANG');
    expect(result.fill).toBe('#da3b26');
  });

  it('clamps stripe count to MAX_VISIBLE_STRIPES (8) instead of overflowing', () => {
    const result = parseBeltGrade('CENTURĂ ROŞIE, 20 DANG');
    expect(result.stripes).toBe(8);
  });

  it('never returns a negative stripe count for a dang below the belt base', () => {
    const result = parseBeltGrade('CENTURĂ ROŞIE, 1 DANG');
    expect(result.stripes).toBe(0);
  });

  it('parses a blue belt with a red-cấp track, matched before the "ROS" red check', () => {
    const result = parseBeltGrade('CENTURA ALBASTRĂ, 3 CẤP ROŞII');
    expect(result.fill).toBe('#1d4ed8');
    expect(result.stripeFill).toBe('#da3b26');
    expect(result.stripes).toBe(3);
    expect(result.label).toBe('C. Albastră, 3 Cấp');
  });

  it('parses a blue belt with a yellow-cấp track', () => {
    const result = parseBeltGrade('CENTURA ALBASTRĂ, 5 CAP GALBENE');
    expect(result.fill).toBe('#1d4ed8');
    expect(result.stripeFill).toBe('#f5c518');
    expect(result.stripes).toBe(5);
  });

  it('falls back to white stripes for a blue belt with no roşu/galben track named', () => {
    const result = parseBeltGrade('CENTURA ALBASTRĂ, 2 CAP');
    expect(result.stripeFill).toBe('#ffffff');
  });

  it('handles diacritics being present or stripped, and is case-insensitive', () => {
    const withDiacritics = parseBeltGrade('centură galbenă, 3 dang');
    const withoutDiacritics = parseBeltGrade('CENTURA GALBENA, 3 DANG');
    expect(withDiacritics.stripes).toBe(withoutDiacritics.stripes);
    expect(withDiacritics.label).toBe(withoutDiacritics.label);
  });

  it('returns a bare color label when no dang/cấp count is present in the name', () => {
    const result = parseBeltGrade('CENTURĂ GALBENĂ');
    expect(result.label).toBe('C. Galbenă');
    expect(result.stripes).toBe(0);
  });
});
