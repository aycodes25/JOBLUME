import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import { createApplicationsService } from '../../src/services/applications.js';

const existing: ApplicationWithJob = {
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'CV', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'LETTER', match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [], whatsapp_number: null,
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '', job: null,
};

function make(get = vi.fn().mockResolvedValue(existing)) {
  const repo = { list: vi.fn(), get, update: vi.fn().mockResolvedValue({ ...existing, status: 'applied' }), listForAnalytics: vi.fn() };
  const svc = createApplicationsService({
    repo,
    renderPdf: vi.fn(),
    uploadPdf: vi.fn(),
    signUrl: vi.fn(),
    now: () => new Date('2026-10-20T10:00:00.000Z'),
  });
  return { svc, repo };
}

describe('applications service setStatus', () => {
  it('reads the application for that user, applies the planned changes and returns the updated row', async () => {
    const { svc, repo } = make();
    const result = await svc.setStatus('u1', 'a1', 'applied');
    expect(repo.get).toHaveBeenCalledWith('u1', 'a1');
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', {
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'assisted',
    });
    expect(result?.status).toBe('applied');
  });

  it('returns null and writes nothing for an unknown application', async () => {
    const { svc, repo } = make(vi.fn().mockResolvedValue(null));
    expect(await svc.setStatus('u1', 'nope', 'applied')).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
