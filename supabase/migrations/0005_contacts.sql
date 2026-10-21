-- JobLume schema v5: reach the employer (contact details printed in the job posting)

-- A new email source: an address the employer published in the posting. The check keeps every earlier source.
-- (applications.email_candidates is untyped jsonb, so its entries may carry source 'posting' with no change here.)
alter table public.applications drop constraint if exists applications_email_source_check;
alter table public.applications
  add constraint applications_email_source_check
  check (email_source in ('hunter', 'guess', 'manual', 'posting'));

-- WhatsApp number published in the posting: digits only, country code included (E.164 allows at most 15 digits).
-- It only opens a chat from the app; nothing is sent automatically.
alter table public.applications
  add column whatsapp_number text
  check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{7,15}$');

-- Server-write-only, as for the rest of the table: clients may only read their own rows.
revoke insert, update, delete on public.applications from anon, authenticated;
