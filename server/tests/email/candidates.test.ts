import { describe, expect, it } from 'vitest';
import {
  buildCandidates, GUESS_CONFIDENCE, GUESS_MAILBOXES, guessCandidates, MAX_CANDIDATES, rankContacts, TRUSTED_CONFIDENCE,
} from '../../src/services/email/candidates.js';
import type { HunterContact } from '../../src/services/email/hunter.js';

const contact = (over: Partial<HunterContact>): HunterContact => ({
  email: 'x@acme.com', type: 'personal', confidence: 90, firstName: null, lastName: null, position: null, department: null, ...over,
});

const engineer = contact({ email: 'ada@acme.com', confidence: 94, firstName: 'Ada', lastName: 'Lovelace', position: 'Senior Engineer', department: 'it' });
const recruiter = contact({ email: 'grace@acme.com', confidence: 88, firstName: 'Grace', lastName: 'Hopper', position: 'Talent Acquisition Manager', department: 'hr' });
const generic = contact({ email: 'careers@acme.com', type: 'generic', confidence: 82 });
const weak = contact({ email: 'alan@acme.com', confidence: 40, position: 'Recruiter', department: 'hr' });

describe('rankContacts', () => {
  it('ranks recruiting contacts first, then generic addresses, then everyone else, by confidence', () => {
    expect(rankContacts([engineer, generic, recruiter]).map((c) => c.email)).toEqual(['grace@acme.com', 'careers@acme.com', 'ada@acme.com']);
  });

  it('keeps higher confidence first within a tier', () => {
    const a = contact({ email: 'a@acme.com', confidence: 70, position: 'Recruiter' });
    const b = contact({ email: 'b@acme.com', confidence: 95, department: 'hr' });
    expect(rankContacts([a, b]).map((c) => c.email)).toEqual(['b@acme.com', 'a@acme.com']);
  });

  it('drops contacts below confidence 50', () => {
    expect(rankContacts([weak])).toEqual([]);
  });

  it('labels each candidate and keeps the name and position', () => {
    const [first, second] = rankContacts([recruiter, generic]);
    expect(first).toEqual({ email: 'grace@acme.com', confidence: 88, source: 'hunter', label: 'Talent Acquisition Manager', name: 'Grace Hopper', position: 'Talent Acquisition Manager' });
    expect(second).toMatchObject({ email: 'careers@acme.com', source: 'hunter', label: 'Generic company address' });
    expect(second).not.toHaveProperty('name');
  });
});

describe('guessCandidates', () => {
  it('guesses the role mailboxes at the domain, labelled as low confidence', () => {
    const guesses = guessCandidates('acme.com');
    expect(guesses.map((g) => g.email)).toEqual(GUESS_MAILBOXES.map((m) => `${m}@acme.com`));
    expect(GUESS_MAILBOXES).toEqual(['careers', 'jobs', 'hr', 'recruitment']);
    for (const g of guesses) expect(g).toMatchObject({ confidence: GUESS_CONFIDENCE, source: 'guess', label: 'Guess, low confidence' });
    expect(GUESS_CONFIDENCE).toBe(30);
  });
});

describe('buildCandidates', () => {
  it('adds no guesses when a contact reaches the trusted confidence', () => {
    expect(TRUSTED_CONFIDENCE).toBe(80);
    expect(buildCandidates('acme.com', [recruiter, engineer]).every((c) => c.source === 'hunter')).toBe(true);
  });

  it('appends guesses after the Hunter contacts when none is trusted', () => {
    const mid = contact({ email: 'mid@acme.com', confidence: 60 });
    const out = buildCandidates('acme.com', [mid]);
    expect(out.map((c) => c.email)).toEqual(['mid@acme.com', 'careers@acme.com', 'jobs@acme.com', 'hr@acme.com', 'recruitment@acme.com']);
  });

  it('is only guesses when Hunter found nothing but the domain is known', () => {
    expect(buildCandidates('acme.com', []).map((c) => c.source)).toEqual(['guess', 'guess', 'guess', 'guess']);
  });

  it('is empty without a domain and without contacts', () => {
    expect(buildCandidates(null, [])).toEqual([]);
  });

  it('does not duplicate an address Hunter already returned', () => {
    const guessed = contact({ email: 'Careers@Acme.com', type: 'generic', confidence: 60 });
    const emails = buildCandidates('acme.com', [guessed]).map((c) => c.email.toLowerCase());
    expect(emails.filter((e) => e === 'careers@acme.com')).toHaveLength(1);
  });

  it('never returns more than six candidates', () => {
    const many = Array.from({ length: 9 }, (_, i) => contact({ email: `p${i}@acme.com`, confidence: 60 + i }));
    expect(MAX_CANDIDATES).toBe(6);
    expect(buildCandidates('acme.com', many)).toHaveLength(6);
  });
});
