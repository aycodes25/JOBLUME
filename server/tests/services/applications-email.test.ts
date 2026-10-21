import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import { createApplicationsService } from '../../src/services/applications.js';

const app = (over: Partial<ApplicationWithJob> = {}): ApplicationWithJob => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: 'a@acme.com', email_confidence: 90, email_source: 'hunter',
  email_candidates: [
    { email: 'a@acme.com', confidence: 90, source: 'hunter', label: 'x' },
    { email: 'careers@acme.com', confidence: 30, source: 'guess', label: 'y' },
  ],
  whatsapp_number: null, apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '', job: null, ...over,
});

function make(existing: ApplicationWithJob | null = app()) {
  const repo = {
    list: vi.fn(), listForAnalytics: vi.fn(),
    get: vi.fn().mockResolvedValue(existing),
    update: vi.fn(async (_u: string, _id: string, changes: Record<string, unknown>) => ({ ...(existing ?? app()), ...changes }) as ApplicationWithJob),
  };
  const svc = createApplicationsService({ repo, renderPdf: vi.fn(), uploadPdf: vi.fn(), signUrl: vi.fn() });
  return { svc, repo };
}

describe('nextEmail', () => {
  it('saves the next candidate and returns the updated application', async () => {
    const { svc, repo } = make();
    const result = await svc.nextEmail('u1', 'a1');
    expect(repo.get).toHaveBeenCalledWith('u1', 'a1');
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', { hiring_manager_email: 'careers@acme.com', email_confidence: 30, email_source: 'guess' });
    expect(result).toMatchObject({ exhausted: false, application: { hiring_manager_email: 'careers@acme.com' } });
  });

  it('reports exhausted without writing', async () => {
    const { svc, repo } = make(app({ hiring_manager_email: 'careers@acme.com' }));
    expect(await svc.nextEmail('u1', 'a1')).toMatchObject({ exhausted: true });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('returns null for an unknown application and refuses a finished one', async () => {
    expect(await make(null).svc.nextEmail('u1', 'x')).toBeNull();
    await expect(make(app({ status: 'applied' })).svc.nextEmail('u1', 'a1')).rejects.toMatchObject({ status: 409, code: 'already_sent' });
  });
});

describe('setEmail', () => {
  it('stores a pasted address as manual', async () => {
    const { svc, repo } = make();
    await svc.setEmail('u1', 'a1', 'jane@acme.com');
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', { hiring_manager_email: 'jane@acme.com', email_confidence: null, email_source: 'manual' });
  });

  it('returns null for an unknown application and refuses a skipped or applied one', async () => {
    expect(await make(null).svc.setEmail('u1', 'x', 'a@b.co')).toBeNull();
    await expect(make(app({ status: 'skipped' })).svc.setEmail('u1', 'a1', 'a@b.co')).rejects.toMatchObject({ code: 'already_sent' });
  });
});
