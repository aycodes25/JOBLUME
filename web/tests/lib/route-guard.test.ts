import { describe, expect, it } from 'vitest';
import { decideRedirect } from '@/lib/route-guard';

describe('decideRedirect', () => {
  it('sends signed-out visitors to /login from any app page', () => {
    expect(decideRedirect('/queue', false)).toBe('/login');
    expect(decideRedirect('/settings', false)).toBe('/login');
    expect(decideRedirect('/', false)).toBe('/login');
  });

  it('lets signed-out visitors see /login', () => {
    expect(decideRedirect('/login', false)).toBeNull();
  });

  it('sends signed-in users away from /login', () => {
    expect(decideRedirect('/login', true)).toBe('/queue');
  });

  it('lets signed-in users through everywhere else', () => {
    expect(decideRedirect('/queue', true)).toBeNull();
    expect(decideRedirect('/onboarding', true)).toBeNull();
  });
});
