import { describe, expect, it } from 'vitest';
import { buildFollowUpPatch } from '@/lib/follow-ups';

const original = { subject: 'Re: Application for Data Analyst', body: 'Dear Hiring Team, I wanted to ask for an update on my application. Kind regards.' };

describe('buildFollowUpPatch', () => {
  it('is not dirty when nothing changed', () => {
    expect(buildFollowUpPatch(original, { ...original })).toEqual({ patch: {}, errors: {}, dirty: false });
  });

  it('patches only the changed, trimmed fields', () => {
    const r = buildFollowUpPatch(original, { subject: '  Re: Hello again  ', body: original.body });
    expect(r.patch).toEqual({ subject: 'Re: Hello again' });
    expect(r.dirty).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('flags a subject or body that is too short or too long', () => {
    expect(buildFollowUpPatch(original, { subject: 'Re', body: original.body }).errors.subject).toMatch(/at least 3/);
    expect(buildFollowUpPatch(original, { subject: 'x'.repeat(201), body: original.body }).errors.subject).toMatch(/too long/);
    expect(buildFollowUpPatch(original, { subject: original.subject, body: 'too short' }).errors.body).toMatch(/at least 40/);
    expect(buildFollowUpPatch(original, { subject: original.subject, body: 'x'.repeat(2001) }).errors.body).toMatch(/too long/);
  });

  it('does not validate a field the user did not change', () => {
    expect(buildFollowUpPatch({ subject: 'Re', body: 'short' }, { subject: 'Re', body: 'short' }).errors).toEqual({});
  });
});
