import { describe, expect, it, vi } from 'vitest';
import type { JobRow, ProfileRow } from '../../src/db/types.js';
import { tailorJobId } from '../../src/queues.js';
import { runTailor, type TailorDeps } from '../../src/worker/tailor.js';

const job: JobRow = {
  id: 'j1', title: 'Backend Engineer', company: 'Acme', location: 'Lagos', description: 'Node.js', source: 'myjobmag',
  url: 'https://x/1', company_domain: null, dedupe_key: 'k', created_at: '',
};
const profile: ProfileRow = {
  user_id: 'u1', base_cv_text: 'My CV text', base_cv_url: 'u1/base-cv.pdf', base_cv_filename: null, skills: ['Node.js'], years_experience: 4,
  desired_roles: ['backend engineer'], location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual',
  auto_threshold: 80, daily_cap: 20, auto_followup: false, updated_at: '',
};
const result = { tailored_cv_text: 'TAILORED', cover_letter_text: 'LETTER', match_score_0_to_100: 77, missing_keywords: ['Docker'] };

function deps(over: Partial<TailorDeps> = {}): TailorDeps {
  return {
    loadJob: vi.fn().mockResolvedValue(job),
    loadProfile: vi.fn().mockResolvedValue(profile),
    applicationExists: vi.fn().mockResolvedValue(false),
    tailor: vi.fn().mockResolvedValue(result),
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadPdf: vi.fn(async (path: string) => path),
    insertApplication: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('tailorJobId', () => {
  it('is deterministic and contains no colon (BullMQ forbids it)', () => {
    expect(tailorJobId('u1', 'j1')).toBe('tailor-u1-j1');
    expect(tailorJobId('u1', 'j1')).not.toContain(':');
  });
});

describe('runTailor', () => {
  it('tailors, renders, uploads and inserts a pending_review application', async () => {
    const d = deps();
    expect(await runTailor({ userId: 'u1', jobId: 'j1' }, d)).toBe('created');
    expect(d.tailor).toHaveBeenCalledWith({
      cvText: 'My CV text',
      job: { title: 'Backend Engineer', company: 'Acme', location: 'Lagos', description: 'Node.js' },
      profile: { skills: ['Node.js'], yearsExperience: 4, location: 'Lagos' },
    });
    expect(d.renderPdf).toHaveBeenCalledWith('TAILORED');
    expect(d.uploadPdf).toHaveBeenCalledWith('u1/tailored/j1.pdf', expect.any(Uint8Array));
    expect(d.insertApplication).toHaveBeenCalledWith({
      user_id: 'u1', job_id: 'j1', tailored_cv_text: 'TAILORED', tailored_cv_url: 'u1/tailored/j1.pdf',
      cover_letter_text: 'LETTER', match_score: 77, missing_keywords: ['Docker'], status: 'pending_review',
    });
  });

  it('skips without calling the AI when an application already exists', async () => {
    const d = deps({ applicationExists: vi.fn().mockResolvedValue(true) });
    expect(await runTailor({ userId: 'u1', jobId: 'j1' }, d)).toBe('skipped');
    expect(d.tailor).not.toHaveBeenCalled();
  });

  it.each([
    ['job missing', { loadJob: vi.fn().mockResolvedValue(null) }],
    ['profile missing', { loadProfile: vi.fn().mockResolvedValue(null) }],
    ['no base CV', { loadProfile: vi.fn().mockResolvedValue({ ...profile, base_cv_text: null }) }],
  ])('skips when %s', async (_name, over) => {
    const d = deps(over);
    expect(await runTailor({ userId: 'u1', jobId: 'j1' }, d)).toBe('skipped');
    expect(d.tailor).not.toHaveBeenCalled();
  });

  it('propagates AI failures so BullMQ can retry or delay', async () => {
    const d = deps({ tailor: vi.fn().mockRejectedValue(new Error('ai down')) });
    await expect(runTailor({ userId: 'u1', jobId: 'j1' }, d)).rejects.toThrow('ai down');
    expect(d.insertApplication).not.toHaveBeenCalled();
  });
});

describe('runTailor onCreated', () => {
  it('calls onCreated with the new application id', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const d = deps({ insertApplication: vi.fn().mockResolvedValue('new-app-id'), onCreated });
    await runTailor({ userId: 'u1', jobId: 'j1' }, d);
    expect(onCreated).toHaveBeenCalledWith('new-app-id');
  });

  it('does not call onCreated when the insert reported a duplicate (null) or returned nothing', async () => {
    const onCreated = vi.fn();
    await runTailor({ userId: 'u1', jobId: 'j1' }, deps({ insertApplication: vi.fn().mockResolvedValue(null), onCreated }));
    await runTailor({ userId: 'u1', jobId: 'j1' }, deps({ insertApplication: vi.fn().mockResolvedValue(undefined), onCreated }));
    expect(onCreated).not.toHaveBeenCalled();
  });
});
