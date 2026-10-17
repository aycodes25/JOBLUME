import { describe, expect, it, vi } from 'vitest';
import { createApplicationsService } from '../../src/services/applications.js';
import type { ApplicationWithJob } from '../../src/api/deps.js';

const app: ApplicationWithJob = {
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'OLD', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'LETTER', match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null,
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '', job: null,
};

function make(over: Partial<Parameters<typeof createApplicationsService>[0]> = {}) {
  const repo = {
    list: vi.fn().mockResolvedValue([app]),
    get: vi.fn().mockResolvedValue(app),
    update: vi.fn().mockResolvedValue({ ...app, tailored_cv_text: 'NEW' }),
  };
  const deps = {
    repo,
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([9])),
    uploadPdf: vi.fn(async (p: string) => p),
    signUrl: vi.fn().mockResolvedValue('https://signed/url'),
    ...over,
  };
  return { svc: createApplicationsService(deps), deps, repo };
}

describe('applications service', () => {
  it('get() adds a signed pdf url', async () => {
    const { svc } = make();
    expect((await svc.get('u1', 'a1'))!.cv_pdf_url).toBe('https://signed/url');
  });

  it('get() returns null for an unknown application and does not sign', async () => {
    const { svc, deps } = make({ repo: { list: vi.fn(), get: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    expect(await svc.get('u1', 'nope')).toBeNull();
    expect(deps.signUrl).not.toHaveBeenCalled();
  });

  it('update() with changed CV text re-renders and re-uploads the PDF', async () => {
    const { svc, deps, repo } = make();
    await svc.update('u1', 'a1', { tailored_cv_text: 'NEW' });
    expect(deps.renderPdf).toHaveBeenCalledWith('NEW');
    expect(deps.uploadPdf).toHaveBeenCalledWith('u1/tailored/j1.pdf', expect.any(Uint8Array));
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', { tailored_cv_text: 'NEW', tailored_cv_url: 'u1/tailored/j1.pdf' });
  });

  it('update() with only the cover letter does not touch the PDF', async () => {
    const { svc, deps, repo } = make();
    await svc.update('u1', 'a1', { cover_letter_text: 'NEW LETTER' });
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', { cover_letter_text: 'NEW LETTER' });
  });

  it('update() on an unknown application returns null without writing', async () => {
    const { svc, repo } = make({ repo: { list: vi.fn(), get: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    expect(await svc.update('u1', 'nope', { cover_letter_text: 'x' })).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
