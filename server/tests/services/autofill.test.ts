import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import type { ProfileRow } from '../../src/db/types.js';
import { createAutofillService, cvFilename, splitFullName } from '../../src/services/autofill.js';

const application = (over: Partial<ApplicationWithJob> = {}): ApplicationWithJob => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: 'u1/tailored/j1.pdf', cover_letter_text: 'Dear team,\nHello.',
  match_score: 80, missing_keywords: [], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [],
  whatsapp_number: null, apply_method: null, status: 'approved', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://job-boards.greenhouse.io/acme/jobs/1', company_domain: null },
  ...over,
});

const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: 'u1', base_cv_text: 'cv', base_cv_url: 'p', base_cv_filename: null, skills: [], years_experience: 3, desired_roles: [],
  location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20, auto_followup: false,
  notify_new_matches: false, updated_at: '', full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos',
  linkedin_url: 'https://www.linkedin.com/in/ada', github_url: 'https://github.com/ada', portfolio_url: 'https://ada.dev', ...over,
});

type GetApp = (userId: string, id: string) => Promise<ApplicationWithJob | null>;
type GetProfile = (userId: string) => Promise<ProfileRow | null>;
type Sign = (path: string) => Promise<string>;

function make(over: { app?: ApplicationWithJob | null; profile?: ProfileRow | null; sign?: Sign } = {}) {
  const get = vi.fn<GetApp>().mockImplementation(async (userId) => (userId === 'u1' ? (over.app === undefined ? application() : over.app) : null));
  const getProfile = vi.fn<GetProfile>().mockImplementation(async () => (over.profile === undefined ? profile() : over.profile));
  const signUrl = vi.fn<Sign>(over.sign ?? (async (p) => `https://abcd1234.supabase.co/storage/v1/object/sign/cvs/${p}?token=t`));
  return { svc: createAutofillService({ applications: { get }, profiles: { get: getProfile }, signUrl }), get, getProfile, signUrl };
}

describe('splitFullName', () => {
  it('uses the last word as the last name', () => {
    expect(splitFullName('Ada Lovelace')).toEqual({ first: 'Ada', last: 'Lovelace' });
    expect(splitFullName('  Ada  Augusta   King Lovelace ')).toEqual({ first: 'Ada Augusta King', last: 'Lovelace' });
    expect(splitFullName('Adeyemi')).toEqual({ first: 'Adeyemi', last: null });
    expect(splitFullName('')).toEqual({ first: null, last: null });
    expect(splitFullName(null)).toEqual({ first: null, last: null });
  });
});

describe('cvFilename', () => {
  it('builds an ASCII file name and falls back to CV.pdf', () => {
    expect(cvFilename('Ada Lovelace')).toBe('Ada Lovelace CV.pdf');
    expect(cvFilename('Ada/../Lovelace')).toBe('Ada..Lovelace CV.pdf');
    expect(cvFilename('Ádéola O’Neil')).toBe('dola ONeil CV.pdf');
    expect(cvFilename('王小明')).toBe('CV.pdf');
    expect(cvFilename(null)).toBe('CV.pdf');
    expect(cvFilename('x'.repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe('autofill service', () => {
  it('returns exactly the allowed fields, scoped to the signed-in user', async () => {
    const { svc, get, signUrl } = make();
    const out = await svc.get({ id: 'u1', email: 'ada@example.com' }, 'a1');
    expect(out).toEqual({
      job_url: 'https://job-boards.greenhouse.io/acme/jobs/1',
      full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com',
      phone: '+234 801 234 5678', city: 'Lagos',
      linkedin_url: 'https://www.linkedin.com/in/ada', github_url: 'https://github.com/ada', portfolio_url: 'https://ada.dev',
      cover_letter: 'Dear team,\nHello.',
      cv: { url: 'https://abcd1234.supabase.co/storage/v1/object/sign/cvs/u1/tailored/j1.pdf?token=t', filename: 'Ada Lovelace CV.pdf' },
    });
    expect(Object.keys(out!).sort()).toEqual([
      'city', 'cover_letter', 'cv', 'email', 'first_name', 'full_name', 'github_url', 'job_url', 'last_name', 'linkedin_url', 'phone', 'portfolio_url',
    ]);
    expect(get).toHaveBeenCalledWith('u1', 'a1');
    expect(signUrl).toHaveBeenCalledWith('u1/tailored/j1.pdf');
  });

  it('returns null for an application that is not the user own (no signing, no profile read)', async () => {
    const { svc, signUrl, getProfile } = make();
    expect(await svc.get({ id: 'u2', email: 'x@y.z' }, 'a1')).toBeNull();
    expect(signUrl).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('returns null when the job has no link', async () => {
    const { svc } = make({ app: application({ job: null }) });
    expect(await svc.get({ id: 'u1', email: null }, 'a1')).toBeNull();
  });

  it('uses null for everything the user has not filled in', async () => {
    const { svc } = make({
      app: application({ tailored_cv_url: null, cover_letter_text: '   ' }),
      profile: profile({ full_name: null, phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null }),
    });
    const out = await svc.get({ id: 'u1', email: null }, 'a1');
    expect(out).toMatchObject({
      full_name: null, first_name: null, last_name: null, email: null, phone: null, city: null,
      linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: null, cv: null,
    });
  });

  it('still answers, without a CV, when signing fails or the profile row is missing', async () => {
    const { svc } = make({ sign: async () => { throw new Error('storage down'); }, profile: null });
    const out = await svc.get({ id: 'u1', email: 'ada@example.com' }, 'a1');
    expect(out?.cv).toBeNull();
    expect(out?.email).toBe('ada@example.com');
    expect(out?.full_name).toBeNull();
  });

  it('caps the cover letter at 10000 characters', async () => {
    const { svc } = make({ app: application({ cover_letter_text: 'x'.repeat(12_000) }) });
    expect((await svc.get({ id: 'u1', email: null }, 'a1'))?.cover_letter).toHaveLength(10_000);
  });
});
