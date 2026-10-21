import type { EmailCandidate } from '@joblume/shared';
import { describe, expect, it, vi } from 'vitest';
import { backfillContacts, formatCounts, PAGE_SIZE, type BackfillDeps, type BackfillRow } from '../../src/services/backfill-contacts.js';

const guess: EmailCandidate = { email: 'careers@acme.com', confidence: 30, source: 'guess', label: 'Guess, low confidence' };
const hunter: EmailCandidate = { email: 'grace@acme.com', confidence: 88, source: 'hunter', label: 'Recruiter' };
const row = (id: string, description: string | null, over: Partial<BackfillRow> = {}): BackfillRow => ({
  id, email_source: null, email_candidates: [], whatsapp_number: null, job: { description }, ...over,
});

function make(pages: BackfillRow[][], over: Partial<BackfillDeps> = {}): BackfillDeps {
  let call = 0;
  return {
    listPending: vi.fn(async () => pages[call++] ?? []),
    saveEmail: vi.fn().mockResolvedValue(true),
    saveWhatsapp: vi.fn().mockResolvedValue(true),
    ...over,
  };
}

const POSTING = { email_candidates: [{ email: 'hr@acme.com', confidence: 95, source: 'posting', label: 'Published in the job post' }], hiring_manager_email: 'hr@acme.com', email_confidence: 95, email_source: 'posting' };

describe('backfillContacts', () => {
  it('fills an empty application with the posting email and the WhatsApp number', async () => {
    const d = make([[row('a1', 'Apply: hr@acme.com or WhatsApp 0803 123 4567')]]);
    const counts = await backfillContacts(d, { dry: false });
    expect(d.saveEmail).toHaveBeenCalledWith('a1', POSTING);
    expect(d.saveWhatsapp).toHaveBeenCalledWith('a1', '2348031234567');
    expect(counts).toEqual({ scanned: 1, emailFilled: 1, whatsappFilled: 1, protectedEmail: 0, lostRace: 0 });
  });

  it('dry run counts what would change and writes nothing', async () => {
    const d = make([[row('a1', 'hr@acme.com WhatsApp 08031234567'), row('a2', 'nothing here')]]);
    const counts = await backfillContacts(d, { dry: true });
    expect(d.saveEmail).not.toHaveBeenCalled();
    expect(d.saveWhatsapp).not.toHaveBeenCalled();
    expect(counts).toEqual({ scanned: 2, emailFilled: 1, whatsappFilled: 1, protectedEmail: 0, lostRace: 0 });
    expect(formatCounts(counts, true)).toMatch(/DRY RUN: nothing was written/);
  });

  it('upgrades an application that only holds guesses', async () => {
    const d = make([[row('a1', 'hr@acme.com', { email_source: 'guess', email_candidates: [guess] })]]);
    await backfillContacts(d, { dry: false });
    expect(d.saveEmail).toHaveBeenCalledWith('a1', POSTING);
  });

  it.each([
    ['a manual address', { email_source: 'manual' as const }],
    ['a Hunter address', { email_source: 'hunter' as const, email_candidates: [hunter, guess] }],
    ['Hunter candidates even when a guess is selected', { email_source: 'guess' as const, email_candidates: [hunter, guess] }],
    ['an earlier posting address', { email_source: 'posting' as const, email_candidates: [] }],
  ])('never overwrites %s', async (_n, over) => {
    const d = make([[row('a1', 'hr@acme.com', over)]]);
    const counts = await backfillContacts(d, { dry: false });
    expect(d.saveEmail).not.toHaveBeenCalled();
    expect(counts.protectedEmail).toBe(1);
    expect(counts.emailFilled).toBe(0);
  });

  it('fills a missing WhatsApp number even when the email is protected, but never replaces an existing one', async () => {
    const d = make([[
      row('a1', 'hr@acme.com WhatsApp 08031234567', { email_source: 'manual' }),
      row('a2', 'WhatsApp 08031234567', { whatsapp_number: '2349990001111' }),
    ]]);
    const counts = await backfillContacts(d, { dry: false });
    expect(d.saveWhatsapp).toHaveBeenCalledTimes(1);
    expect(d.saveWhatsapp).toHaveBeenCalledWith('a1', '2348031234567');
    expect(counts.whatsappFilled).toBe(1);
  });

  it('counts a write that matched no row as lost, not filled', async () => {
    const d = make([[row('a1', 'hr@acme.com WhatsApp 08031234567')]], {
      saveEmail: vi.fn().mockResolvedValue(false), saveWhatsapp: vi.fn().mockResolvedValue(false),
    });
    expect(await backfillContacts(d, { dry: false })).toMatchObject({ emailFilled: 0, whatsappFilled: 0, lostRace: 2 });
  });

  it('copes with applications that have no job or no description', async () => {
    const d = make([[row('a1', null), { ...row('a2', ''), job: null }]]);
    expect(await backfillContacts(d, { dry: false })).toMatchObject({ scanned: 2, emailFilled: 0 });
  });

  it('pages by id until a short page', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => row(`id-${String(i).padStart(4, '0')}`, ''));
    const d = make([full, [row('id-9999', '')]]);
    const counts = await backfillContacts(d, { dry: true });
    expect(counts.scanned).toBe(PAGE_SIZE + 1);
    expect(d.listPending).toHaveBeenNthCalledWith(1, null, PAGE_SIZE);
    expect(d.listPending).toHaveBeenNthCalledWith(2, `id-${String(PAGE_SIZE - 1).padStart(4, '0')}`, PAGE_SIZE);
  });
});
