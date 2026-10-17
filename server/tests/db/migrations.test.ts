import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0002_email.sql', import.meta.url), 'utf8');

describe('migration 0002_email.sql', () => {
  it('adds the Gmail, CV filename, email-candidate and log columns', () => {
    expect(sql).toMatch(/gmail_email text/);
    expect(sql).toMatch(/gmail_connected_at timestamptz/);
    expect(sql).toMatch(/base_cv_filename text/);
    expect(sql).toMatch(/email_source text check \(email_source in \('hunter', 'guess', 'manual'\)\)/);
    expect(sql).toMatch(/email_candidates jsonb not null default '\[\]'::jsonb/);
    expect(sql).toMatch(/to_email text/);
    expect(sql).toMatch(/gmail_thread_id text/);
    expect(sql).toMatch(/rfc_message_id text/);
    expect(sql).toMatch(/status text not null default 'sent' check \(status in \('sent', 'failed'\)\)/);
  });

  it('creates follow_ups with at most one row per application', () => {
    expect(sql).toMatch(/create table public\.follow_ups/);
    expect(sql).toMatch(/application_id uuid not null unique references public\.applications \(id\) on delete cascade/);
    expect(sql).toMatch(/'pending_review', 'sent', 'dismissed', 'failed'/);
  });

  it('creates the shared company_contacts cache keyed by company', () => {
    expect(sql).toMatch(/create table public\.company_contacts/);
    expect(sql).toMatch(/company_key text not null unique/);
  });

  it('turns on RLS for the new tables and keeps clients read-only', () => {
    expect(sql).toMatch(/alter table public\.follow_ups enable row level security/);
    expect(sql).toMatch(/alter table public\.company_contacts enable row level security/);
    expect(sql).toMatch(/revoke insert, update, delete on public\.follow_ups from anon, authenticated/);
    expect(sql).toMatch(/revoke all on public\.company_contacts from anon, authenticated/);
    expect(sql).toMatch(/revoke insert, update, delete on public\.email_logs from anon, authenticated/);
  });

  it('indexes applications that are due for a follow-up', () => {
    expect(sql).toMatch(/create index applications_followup_idx on public\.applications \(follow_up_at\) where status = 'applied'/);
  });
});
