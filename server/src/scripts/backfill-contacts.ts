import type { Db } from '../lib/supabase.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { getEnv } from '../lib/env.js';
import { backfillContacts, formatCounts, type BackfillDeps, type BackfillRow } from '../services/backfill-contacts.js';

/** Supabase-backed deps. Reads are limited to pending applications; every write re-checks its guard in SQL. */
export function createBackfillDeps(db: Db): BackfillDeps {
  return {
    async listPending(afterId, limit) {
      let q = db
        .from('applications')
        .select('id, email_source, email_candidates, whatsapp_number, job:jobs(description)')
        .eq('status', 'pending_review')
        .order('id', { ascending: true })
        .limit(limit);
      if (afterId) q = q.gt('id', afterId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BackfillRow[];
    },
    async saveEmail(id, changes) {
      const { data, error } = await db
        .from('applications')
        .update(changes)
        .eq('id', id)
        .eq('status', 'pending_review')
        .or('email_source.is.null,email_source.eq.guess')
        .select('id');
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async saveWhatsapp(id, number) {
      const { data, error } = await db
        .from('applications')
        .update({ whatsapp_number: number })
        .eq('id', id)
        .eq('status', 'pending_review')
        .is('whatsapp_number', null)
        .select('id');
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
}

async function main() {
  const dry = process.argv.slice(2).includes('--dry');
  const env = getEnv();
  const counts = await backfillContacts(createBackfillDeps(createSupabaseAdmin(env)), { dry });
  console.log(formatCounts(counts, dry));
}

main().catch((err: unknown) => {
  console.error('backfill failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
