import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });

  it('lets the later Tailwind class win a conflict', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
