import { describe, it, expect } from 'vitest';
import { absoluteUrl, excerpt, SITE_URL } from './seo.js';

describe('absoluteUrl', () => {
  it('returns the site root for the default path, and the bare site URL for an explicit empty string', () => {
    expect(absoluteUrl()).toBe(`${SITE_URL}/`);
    expect(absoluteUrl('')).toBe(SITE_URL);
  });

  it('prefixes a root-relative path with the site URL', () => {
    expect(absoluteUrl('/noutati')).toBe(`${SITE_URL}/noutati`);
  });

  it('adds a leading slash for a path missing one', () => {
    expect(absoluteUrl('noutati')).toBe(`${SITE_URL}/noutati`);
  });

  it('leaves an already-absolute http(s) URL untouched', () => {
    expect(absoluteUrl('https://other-domain.ro/x')).toBe('https://other-domain.ro/x');
    expect(absoluteUrl('http://other-domain.ro/x')).toBe('http://other-domain.ro/x');
  });
});

describe('excerpt', () => {
  it('returns an empty string for falsy input', () => {
    expect(excerpt('')).toBe('');
    expect(excerpt(null)).toBe('');
  });

  it('strips HTML tags', () => {
    expect(excerpt('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('decodes common HTML entities', () => {
    expect(excerpt('Tom &amp; Jerry &mdash; a &quot;classic&quot;')).toBe('Tom & Jerry — a "classic"');
    expect(excerpt('Wait&hellip;')).toBe('Wait…');
    expect(excerpt('non&nbsp;breaking')).toBe('non breaking');
  });

  it('collapses repeated whitespace left over from stripped tags', () => {
    expect(excerpt('<p>Line one</p>\n\n<p>Line   two</p>')).toBe('Line one Line two');
  });

  it('leaves short text untruncated', () => {
    expect(excerpt('Short text')).toBe('Short text');
  });

  it('truncates long text to maxLength and appends an ellipsis', () => {
    const long = 'a'.repeat(200);
    const result = excerpt(long, 160);
    expect(result.length).toBe(160);
    expect(result.endsWith('…')).toBe(true);
    expect(result.startsWith('a'.repeat(159))).toBe(true);
  });

  it('trims trailing whitespace before the ellipsis when truncating mid-word-boundary', () => {
    const text = `${'a'.repeat(158)}  bcdef`;
    const result = excerpt(text, 160);
    expect(result.endsWith(' …')).toBe(false);
  });
});
