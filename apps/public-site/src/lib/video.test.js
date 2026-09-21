import { describe, it, expect } from 'vitest';
import { toEmbedUrl, getYouTubeId } from './video.js';

describe('toEmbedUrl', () => {
  it('returns an empty string for falsy input', () => {
    expect(toEmbedUrl('')).toBe('');
  });

  it('converts a youtube.com watch URL', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts a youtu.be short link', () => {
    expect(toEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts a youtube shorts URL', () => {
    expect(toEmbedUrl('https://www.youtube.com/shorts/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts an m.youtube.com URL', () => {
    expect(toEmbedUrl('https://m.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts a vimeo.com URL', () => {
    expect(toEmbedUrl('https://vimeo.com/12345678')).toBe('https://player.vimeo.com/video/12345678');
  });

  it('falls back to the original URL for an unrecognized host', () => {
    expect(toEmbedUrl('https://example.com/video/1')).toBe('https://example.com/video/1');
  });

  it('falls back to the original (unparseable) string instead of throwing', () => {
    expect(toEmbedUrl('not a url')).toBe('not a url');
  });
});

describe('getYouTubeId', () => {
  it('returns null for falsy input', () => {
    expect(getYouTubeId('')).toBeNull();
  });

  it('extracts the id from a watch URL', () => {
    expect(getYouTubeId('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('extracts the id from a youtu.be short link', () => {
    expect(getYouTubeId('https://youtu.be/abc123')).toBe('abc123');
  });

  it('extracts the id from a shorts URL', () => {
    expect(getYouTubeId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
  });

  it('returns null for a non-YouTube host', () => {
    expect(getYouTubeId('https://vimeo.com/12345678')).toBeNull();
  });

  it('returns null instead of throwing for an unparseable string', () => {
    expect(getYouTubeId('not a url')).toBeNull();
  });
});
