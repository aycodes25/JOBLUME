import { z } from 'zod';

export const LOCATIONS = ['Lagos', 'Abuja', 'Remote'] as const;

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
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
  .refine(
    (v) => v.salary_min == null || v.salary_max == null || v.salary_min <= v.salary_max,
    { message: 'salary_min must not exceed salary_max', path: ['salary_min'] },
  );

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
