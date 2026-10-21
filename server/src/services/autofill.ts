import type { AutofillPayload } from '@joblume/shared';
import type { ApplicationsRepo, AutofillService, ProfileRepo } from '../api/deps.js';

const COVER_LETTER_MAX = 10_000;

/** The last word is the last name, everything before it the first name. A single word is a first name only. */
export function splitFullName(full: string | null | undefined): { first: string | null; last: string | null } {
  const tokens = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: null, last: null };
  if (tokens.length === 1) return { first: tokens[0]!, last: null };
  return { first: tokens.slice(0, -1).join(' '), last: tokens[tokens.length - 1]! };
}

/** ASCII file name for the CV upload: "Ada Lovelace CV.pdf", or "CV.pdf" when the name has no ASCII letters. */
export function cvFilename(fullName: string | null | undefined): string {
  const safe = (fullName ?? '').replace(/[^A-Za-z0-9 _.()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return safe ? `${safe} CV.pdf` : 'CV.pdf';
}

const orNull = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function createAutofillService(deps: {
  applications: Pick<ApplicationsRepo, 'get'>;
  profiles: Pick<ProfileRepo, 'get'>;
  signUrl(path: string): Promise<string>;
}): AutofillService {
  return {
    async get(user, applicationId) {
      const app = await deps.applications.get(user.id, applicationId);
      if (!app?.job?.url) return null;
      const profile = await deps.profiles.get(user.id);

      const fullName = orNull(profile?.full_name);
      const { first, last } = splitFullName(fullName);

      let cv: AutofillPayload['cv'] = null;
      if (app.tailored_cv_url) {
        try {
          cv = { url: await deps.signUrl(app.tailored_cv_url), filename: cvFilename(fullName) };
        } catch {
          cv = null;
        }
      }

      const letter = orNull(app.cover_letter_text);
      return {
        job_url: app.job.url,
        full_name: fullName,
        first_name: first,
        last_name: last,
        email: orNull(user.email),
        phone: orNull(profile?.phone),
        city: orNull(profile?.city),
        linkedin_url: orNull(profile?.linkedin_url),
        github_url: orNull(profile?.github_url),
        portfolio_url: orNull(profile?.portfolio_url),
        cover_letter: letter ? letter.slice(0, COVER_LETTER_MAX) : null,
        cv,
      };
    },
  };
}
