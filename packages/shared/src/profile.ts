import { z } from 'zod';

export const LOCATIONS = ['Lagos', 'Abuja', 'Remote'] as const;

/** 7 to 20 characters of digits, space, + - ( ). Same rule as the database check in migration 0007. */
export const PHONE_PATTERN = /^[0-9 +()-]{7,20}$/;

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((v) => v.toLowerCase().startsWith('https://'), 'Must start with https://');

export const profilePatchSchema = z
  .object({
    skills: z.array(z.string().trim().min(1).max(60)).max(100),
    years_experience: z.number().int().min(0).max(60).nullable(),
    desired_roles: z.array(z.string().trim().min(2).max(80)).max(20),
    location: z.enum(LOCATIONS).nullable(),
    salary_min: z.number().int().min(0).nullable(),
    salary_max: z.number().int().min(0).nullable(),
    apply_mode: z.enum(['manual', 'auto']),
    auto_threshold: z.number().int().min(0).max(100),
    daily_cap: z.number().int().min(1).max(20),
    auto_followup: z.boolean(),
    notify_new_matches: z.boolean(),
    // Contact details for the browser extension. full_name is stored on users.full_name by the server.
    full_name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(PHONE_PATTERN, 'Phone: 7 to 20 digits, spaces, + - ( )').nullable(),
    city: z.string().trim().min(1).max(80).nullable(),
    linkedin_url: httpsUrl.nullable(),
    github_url: httpsUrl.nullable(),
    portfolio_url: httpsUrl.nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
  .refine(
    (v) => v.salary_min == null || v.salary_max == null || v.salary_min <= v.salary_max,
    { message: 'salary_min must not exceed salary_max', path: ['salary_min'] },
  );

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
