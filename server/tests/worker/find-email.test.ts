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
});
