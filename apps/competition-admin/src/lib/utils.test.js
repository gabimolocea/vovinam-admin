import { describe, it, expect } from 'vitest';
import { cn } from './utils.js';

describe('cn', () => {
  it('joins plain class strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    const disabled = false;
    expect(cn('a', disabled && 'b', null, undefined, 'c')).toBe('a c');
  });

  it('merges conflicting tailwind utility classes, keeping the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('supports conditional object syntax via clsx', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });
});
