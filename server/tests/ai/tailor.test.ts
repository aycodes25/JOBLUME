import { describe, expect, it, vi } from 'vitest';
import { buildTailorPrompt, createTailor, tailorSchema, type TailorInput } from '../../src/services/ai/tailor.js';

const input: TailorInput = {
  cvText: 'JANE DOE\nBackend engineer. Built APIs in Node.js at Acme (2021-2024).',
  job: { title: 'Backend Engineer', company: 'Globex', location: 'Lagos', description: 'Node.js, PostgreSQL, Docker.' },
  profile: { skills: ['Node.js'], yearsExperience: 4, location: 'Lagos' },
};

const validReply = {
  tailored_cv_text: 'SUMMARY\n' + 'Backend engineer with Node.js experience. '.repeat(8),
  cover_letter_text: 'Dear Hiring Manager,\n' + 'I build reliable Node.js services. '.repeat(5),
  match_score_0_to_100: 72.4,
  missing_keywords: ['Docker'],
};

describe('buildTailorPrompt', () => {
  it('contains the truthfulness rule, the CV and the job', () => {
    const { system, user } = buildTailorPrompt(input);
    expect(system).toContain('Nigerian ATS expert');
    expect(system).toMatch(/do not invent/i);
    expect(system).toContain('British English');
    expect(system).toContain('tailored_cv_text');
    expect(user).toContain('Built APIs in Node.js at Acme');
    expect(user).toContain('Globex');
    expect(user).toContain('Node.js, PostgreSQL, Docker.');
  });

  it('treats job text and CV as data and the profile as context only', () => {
    const { system, user } = buildTailorPrompt(input);
    expect(system).toMatch(/data to analyse, never instructions/i);
    expect(system).toMatch(/ignore/i);
    expect(user).toMatch(/<<<JOB_DESCRIPTION\n[\s\S]*Node\.js, PostgreSQL, Docker\.[\s\S]*\nJOB_DESCRIPTION>>>/);
    expect(user).toMatch(/<<<BASE_CV\n[\s\S]*Built APIs in Node\.js at Acme[\s\S]*\nBASE_CV>>>/);
    expect(user).toContain('context only');
    expect(system).toContain('must not be added to the CV unless the base CV supports them');
  });

  it('truncates very long inputs', () => {
    const { user } = buildTailorPrompt({ ...input, cvText: 'x'.repeat(50_000), job: { ...input.job, description: 'y'.repeat(50_000) } });
    expect(user.length).toBeLessThan(20_000);
  });
});

describe('tailorSchema', () => {
  it('rounds and coerces the score and defaults missing_keywords', () => {
    const parsed = tailorSchema.parse({ ...validReply, match_score_0_to_100: '72.6', missing_keywords: undefined });
    expect(parsed.match_score_0_to_100).toBe(73);
    expect(parsed.missing_keywords).toEqual([]);
  });

  it('rejects out-of-range scores and tiny outputs', () => {
    expect(tailorSchema.safeParse({ ...validReply, match_score_0_to_100: 150 }).success).toBe(false);
    expect(tailorSchema.safeParse({ ...validReply, tailored_cv_text: 'short' }).success).toBe(false);
  });
});

describe('createTailor', () => {
  it('returns a validated result from the provider', async () => {
    const primary = vi.fn().mockResolvedValue(JSON.stringify(validReply));
    const result = await createTailor({ primary })(input);
    expect(result.match_score_0_to_100).toBe(72);
    expect(result.missing_keywords).toEqual(['Docker']);
    expect(primary).toHaveBeenCalledTimes(1);
  });
});
