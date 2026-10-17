import { z } from 'zod';
import { generateJson } from './generate.js';
import type { ProviderFn, Prompt } from './providers.js';

export const tailorSchema = z.object({
  tailored_cv_text: z.string().min(200),
  cover_letter_text: z.string().min(100),
  match_score_0_to_100: z.coerce.number().min(0).max(100).transform((n) => Math.round(n)),
  missing_keywords: z.array(z.string()).default([]),
});

export type TailorResult = z.output<typeof tailorSchema>;

export interface TailorInput {
  cvText: string;
  job: { title: string; company: string; location: string; description: string };
  profile: { skills: string[]; yearsExperience: number | null; location: string | null };
}

const SYSTEM = `You are a Nigerian ATS expert and a senior recruiter. Rewrite the candidate's base CV for the job described by the user.

Rules:
- Keep everything truthful. Do not invent employers, job titles, dates, qualifications, certifications, metrics or skills that are not in the base CV.
- You may reorder, rephrase and emphasise existing content, and mirror the job's keywords only where the base CV genuinely supports them.
- Optimise for ATS: plain text, standard headings on their own line (SUMMARY, SKILLS, EXPERIENCE, EDUCATION, CERTIFICATIONS), bullet points that start with "- ", no tables, no emojis or other symbols. Put the candidate's name and contact details on the first lines, before any heading.
- Cover letter: British English, direct and human, three short paragraphs, specific to this role and company, grounded only in the base CV. No cliches, no generic openings, no exaggerated claims.
- missing_keywords: important keywords from the job description that the base CV does not support. Do not add them to the CV.
- match_score_0_to_100: an honest estimate of how well the base CV fits this job.

Reply with ONLY a JSON object, no other text:
{ "tailored_cv_text": string, "cover_letter_text": string, "match_score_0_to_100": number, "missing_keywords": string[] }`;

export function buildTailorPrompt({ cvText, job, profile }: TailorInput): Prompt {
  const user = [
    `JOB TITLE: ${job.title}`,
    `COMPANY: ${job.company}`,
    `LOCATION: ${job.location || 'Not stated'}`,
    `JOB DESCRIPTION:\n${job.description.slice(0, 6000)}`,
    '',
    `CANDIDATE PROFILE: ${profile.yearsExperience ?? 'unknown'} years of experience; preferred location ${profile.location ?? 'not stated'}; listed skills: ${profile.skills.join(', ') || 'none listed'}.`,
    '',
    `BASE CV:\n${cvText.slice(0, 12000)}`,
  ].join('\n');
  return { system: SYSTEM, user };
}

export function createTailor(deps: { primary: ProviderFn; fallback?: ProviderFn }) {
  return async (input: TailorInput): Promise<TailorResult> => {
    const { system, user } = buildTailorPrompt(input);
    const { data } = await generateJson({ system, user, schema: tailorSchema, ...deps });
    return data;
  };
}
