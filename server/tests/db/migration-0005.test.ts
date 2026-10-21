import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0005_contacts.sql', import.meta.url), 'utf8');

describe('migration 0005_contacts.sql', () => {
  it('lets email_source accept every earlier source plus posting', () => {
    const check = sql.match(/add constraint applications_email_source_check\s+check \(email_source in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const allowed = [...check![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(allowed).toEqual(['hunter', 'guess', 'manual', 'posting']);
    expect(sql).toMatch(/drop constraint if exists applications_email_source_check/);
  });

  it('adds a nullable whatsapp_number limited to 7 to 15 digits', () => {
    expect(sql).toMatch(/add column whatsapp_number text\s+check \(whatsapp_number is null or whatsapp_number ~ '\^\[0-9\]\{7,15\}\$'\)/);
    expect(sql).not.toMatch(/whatsapp_number text not null/);
  });

  it('keeps applications server-write-only', () => {
    expect(sql).toMatch(/revoke insert, update, delete on public\.applications from anon, authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)/i);
  });
});
