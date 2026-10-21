import type { EmailCandidate } from '@joblume/shared';
import { describe, expect, it, vi } from 'vitest';
import { runFindEmail, type FindEmailDeps } from '../../src/worker/find-email.js';

const candidates: EmailCandidate[] = [
  { email: 'grace@acme.com', confidence: 88, source: 'hunter', label: 'Recruiter' },
  { email: 'careers@acme.com', confidence: 30, source: 'guess', label: 'Guess, low confidence' },
];
const application = (over: object = {}) => ({
  id: 'a1', user_id: 'u1', status: 'pending_review' as const, email_candidates: [] as EmailCandidate[],
  job: { company: 'Acme', company_domain: null as string | null }, ...over,
});

function make(over: Partial<FindEmailDeps> = {}): FindEmailDeps {
  return {
    loadApplication: vi.fn().mockResolvedValue(application()),
    find: vi.fn().mockResolvedValue(candidates),
    saveCandidates: vi.fn().mockResolvedValue(true),
    afterFound: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('runFindEmail', () => {
  it('stores the candidates, selects the best one and calls afterFound', async () => {
    const d = make();
    expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('found');
    expect(d.find).toHaveBeenCalledWith({ company: 'Acme', knownDomain: null });
    expect(d.saveCandidates).toHaveBeenCalledWith('a1', {
      email_candidates: candidates, hiring_manager_email: 'grace@acme.com', email_confidence: 88, email_source: 'hunter',
    });
    expect(d.afterFound).toHaveBeenCalledWith('a1');
  });

  it('passes a known company domain to the finder', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(application({ job: { company: 'Acme', company_domain: 'acme.com' } })) });
    await runFindEmail({ applicationId: 'a1' }, d);
    expect(d.find).toHaveBeenCalledWith({ company: 'Acme', knownDomain: 'acme.com' });
  });

  it('skips afterFound when the conditional write changed no row', async () => {
    const d = make({ saveCandidates: vi.fn().mockResolvedValue(false) });
    expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('skipped');
    expect(d.afterFound).not.toHaveBeenCalled();
  });

  it('reports none and saves nothing when no candidate exists', async () => {
    const d = make({ find: vi.fn().mockResolvedValue([]) });
    expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('none');
    expect(d.saveCandidates).not.toHaveBeenCalled();
    expect(d.afterFound).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown application', null],
    ['an application with no job', application({ job: null })],
    ['an application that is no longer pending', application({ status: 'applied' })],
    ['an application that already has candidates', application({ email_candidates: candidates })],
  ])('skips %s', async (_n, loaded) => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(loaded) });
    expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('skipped');
    expect(d.find).not.toHaveBeenCalled();
  });

  it('does not require an afterFound hook', async () => {
    const d = make({ afterFound: undefined });
    await expect(runFindEmail({ applicationId: 'a1' }, d)).resolves.toBe('found');
  });

  it('lets lookup failures propagate so the queue can retry', async () => {
    const d = make({ find: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(runFindEmail({ applicationId: 'a1' }, d)).rejects.toThrow('boom');
  });

  describe('contacts published in the posting', () => {
    const withDescription = (description: string, over: object = {}) =>
      vi.fn().mockResolvedValue(application({ job: { company: 'Acme', company_domain: null, description }, ...over }));

    it('saves posting addresses first at confidence 95 and does not call Hunter', async () => {
      const d = make({ loadApplication: withDescription('Apply to careers@acme.com or hr@acme.com') });
      expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('found');
      expect(d.find).not.toHaveBeenCalled();
      expect(d.saveCandidates).toHaveBeenCalledWith('a1', {
        email_candidates: [
          { email: 'careers@acme.com', confidence: 95, source: 'posting', label: 'Published in the job post' },
          { email: 'hr@acme.com', confidence: 95, source: 'posting', label: 'Published in the job post' },
        ],
        hiring_manager_email: 'careers@acme.com', email_confidence: 95, email_source: 'posting',
      });
      expect(d.afterFound).toHaveBeenCalledWith('a1');
    });

    it('stores the WhatsApp number with the posting email', async () => {
      const d = make({ loadApplication: withDescription('Email hr@acme.com or WhatsApp 0803 123 4567') });
      await runFindEmail({ applicationId: 'a1' }, d);
      expect(d.saveCandidates).toHaveBeenCalledWith('a1', expect.objectContaining({ whatsapp_number: '2348031234567', email_source: 'posting' }));
    });

    it('with only a WhatsApp number it still looks up email, then saves both in one guarded write', async () => {
      const d = make({ loadApplication: withDescription('WhatsApp us on https://wa.me/2348031234567') });
      expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('found');
      expect(d.find).toHaveBeenCalledTimes(1);
      expect(d.saveCandidates).toHaveBeenCalledWith('a1', {
        email_candidates: candidates, hiring_manager_email: 'grace@acme.com', email_confidence: 88, email_source: 'hunter',
        whatsapp_number: '2348031234567',
      });
    });

    it('saves just the WhatsApp number when no email can be found, and reports none', async () => {
      const d = make({ loadApplication: withDescription('WhatsApp 08031234567'), find: vi.fn().mockResolvedValue([]) });
      expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('none');
      expect(d.saveCandidates).toHaveBeenCalledWith('a1', { whatsapp_number: '2348031234567' });
      expect(d.afterFound).not.toHaveBeenCalled();
    });

    it('does not replace a WhatsApp number that is already stored', async () => {
      const d = make({ loadApplication: withDescription('Email hr@acme.com, WhatsApp 08031234567', { whatsapp_number: '2349990001111' }) });
      await runFindEmail({ applicationId: 'a1' }, d);
      expect(d.saveCandidates).toHaveBeenCalledWith('a1', expect.not.objectContaining({ whatsapp_number: expect.anything() }));
    });

    it('falls back to the normal lookup when the posting has no contact', async () => {
      const d = make({ loadApplication: withDescription('Great role, apply on our site.') });
      expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('found');
      expect(d.find).toHaveBeenCalledTimes(1);
    });

    it('returns skipped and calls afterFound for nothing when the guarded write loses a race with a pasted address', async () => {
      const d = make({ loadApplication: withDescription('Apply to hr@acme.com'), saveCandidates: vi.fn().mockResolvedValue(false) });
      expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('skipped');
      expect(d.afterFound).not.toHaveBeenCalled();
    });

    it.each([
      ['a manual address', { email_source: 'manual' as const }],
      ['a Hunter address', { email_source: 'hunter' as const }],
      ['stored candidates', { email_candidates: candidates }],
    ])('never overwrites %s already on the application', async (_n, over) => {
      const d = make({ loadApplication: withDescription('Apply to hr@acme.com', over) });
      expect(await runFindEmail({ applicationId: 'a1' }, d)).toBe('skipped');
      expect(d.saveCandidates).not.toHaveBeenCalled();
    });
  });
});
