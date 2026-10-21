import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN } from '@joblume/shared';

const sql = readFileSync(new URL('../../../supabase/migrations/0007_contact_profile.sql', import.meta.url), 'utf8');

describe('migration 0007_contact_profile.sql', () => {
  it('adds the five nullable contact columns to profiles', () => {
    for (const col of ['phone', 'city', 'linkedin_url', 'github_url', 'portfolio_url']) {
      expect(sql).toMatch(new RegExp(String.raw`add column ${col} text\s+check \(${col} is null or`));
    }
    expect(sql).not.toMatch(/ text not null/);
  });

  it('checks the phone with the same rule as the shared zod schema', () => {
    const m = sql.match(/phone ~ '([^']+)'/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(PHONE_PATTERN.source);
  });

  it('requires https for the three links and caps their length', () => {
    for (const col of ['linkedin_url', 'github_url', 'portfolio_url']) {
      expect(sql).toMatch(new RegExp(String.raw`${col} ~\* '\^https://' and char_length\(${col}\) <= 300`));
    }
  });

  it('caps the city and the full name', () => {
    expect(sql).toMatch(/char_length\(city\) between 1 and 80/);
    expect(sql).toMatch(/users_full_name_length\s+check \(full_name is null or char_length\(full_name\) between 1 and 120\) not valid/);
  });

  it('keeps profiles server-write-only and grants nothing', () => {
    expect(sql).toMatch(/revoke update on public\.profiles from anon, authenticated/);
    expect(sql).not.toMatch(/grant /i);
  });
});
