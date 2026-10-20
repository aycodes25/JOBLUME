import type { EmailCandidate } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { manualEmailChanges, nextCandidateChanges } from '../../src/services/email/choose.js';

const c = (email: string, confidence: number, source: 'hunter' | 'guess' = 'hunter'): EmailCandidate => ({ email, confidence, source, label: 'x' });
const list = [c('a@acme.com', 90), c('b@acme.com', 60), c('careers@acme.com', 30, 'guess')];

describe('nextCandidateChanges', () => {
  it('moves from the current candidate to the next one', () => {
    expect(nextCandidateChanges({ email_candidates: list, hiring_manager_email: 'a@acme.com' })).toEqual({
      exhausted: false,
      changes: { hiring_manager_email: 'b@acme.com', email_confidence: 60, email_source: 'hunter' },
    });
    expect(nextCandidateChanges({ email_candidates: list, hiring_manager_email: 'b@acme.com' })).toEqual({
      exhausted: false,
      changes: { hiring_manager_email: 'careers@acme.com', email_confidence: 30, email_source: 'guess' },
    });
  });

  it('matches the current address case-insensitively', () => {
    const r = nextCandidateChanges({ email_candidates: list, hiring_manager_email: 'A@Acme.com' });
    expect(r).toMatchObject({ exhausted: false, changes: { hiring_manager_email: 'b@acme.com' } });
  });

  it('is exhausted after the last candidate', () => {
    expect(nextCandidateChanges({ email_candidates: list, hiring_manager_email: 'careers@acme.com' })).toEqual({ exhausted: true });
  });

  it('starts from the first candidate when the current address is pasted or missing', () => {
    expect(nextCandidateChanges({ email_candidates: list, hiring_manager_email: 'mine@x.com' })).toMatchObject({ exhausted: false, changes: { hiring_manager_email: 'a@acme.com' } });
    expect(nextCandidateChanges({ email_candidates: list, hiring_manager_email: null })).toMatchObject({ exhausted: false, changes: { hiring_manager_email: 'a@acme.com' } });
  });

  it('is exhausted when there are no candidates', () => {
    expect(nextCandidateChanges({ email_candidates: [], hiring_manager_email: null })).toEqual({ exhausted: true });
  });
});

describe('manualEmailChanges', () => {
  it('marks a pasted address as manual with no confidence', () => {
    expect(manualEmailChanges('jane@acme.com')).toEqual({ hiring_manager_email: 'jane@acme.com', email_confidence: null, email_source: 'manual' });
  });
});
