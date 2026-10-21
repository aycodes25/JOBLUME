import type { EmailCandidate, EmailSource } from '@joblume/shared';
import { extractContacts } from '../domain/contacts.js';
import { postingCandidates } from './email/candidates.js';

export interface BackfillRow {
  id: string;
  email_source: EmailSource | null;
  email_candidates: EmailCandidate[];
  whatsapp_number: string | null;
  job: { description: string | null } | null;
}

export interface BackfillDeps {
  /** Pending_review applications only, ordered by id, strictly after `afterId`. */
  listPending(afterId: string | null, limit: number): Promise<BackfillRow[]>;
  /** Conditional write: still pending_review and email_source null or guess. Resolves true when a row changed. */
  saveEmail(id: string, changes: Record<string, unknown>): Promise<boolean>;
  /** Conditional write: still pending_review and whatsapp_number null. Resolves true when a row changed. */
  saveWhatsapp(id: string, number: string): Promise<boolean>;
}

export interface BackfillCounts {
  scanned: number;
  emailFilled: number;
  whatsappFilled: number;
  /** Rows with a posting address that were left alone because they hold a manual or Hunter address. */
  protectedEmail: number;
  lostRace: number;
}

export const PAGE_SIZE = 200;

/** Candidates that may be replaced: none at all, or only low-confidence guesses. Manual and Hunter data is never touched. */
const replaceable = (r: BackfillRow) =>
  (r.email_source === null || r.email_source === 'guess') && r.email_candidates.every((c) => c.source === 'guess');

export async function backfillContacts(d: BackfillDeps, opts: { dry: boolean }): Promise<BackfillCounts> {
  const counts: BackfillCounts = { scanned: 0, emailFilled: 0, whatsappFilled: 0, protectedEmail: 0, lostRace: 0 };
  let after: string | null = null;
  for (;;) {
    const rows = await d.listPending(after, PAGE_SIZE);
    for (const row of rows) {
      counts.scanned += 1;
      const found = extractContacts(row.job?.description ?? '');
      const posting = postingCandidates(found.emails);

      if (posting.length > 0) {
        if (!replaceable(row)) counts.protectedEmail += 1;
        else if (opts.dry) counts.emailFilled += 1;
        else {
          const best = posting[0]!;
          const saved = await d.saveEmail(row.id, {
            email_candidates: posting, hiring_manager_email: best.email, email_confidence: best.confidence, email_source: best.source,
          });
          if (saved) counts.emailFilled += 1;
          else counts.lostRace += 1;
        }
      }

      const number = found.whatsapp[0];
      if (number && !row.whatsapp_number) {
        if (opts.dry) counts.whatsappFilled += 1;
        else if (await d.saveWhatsapp(row.id, number)) counts.whatsappFilled += 1;
        else counts.lostRace += 1;
      }
    }
    if (rows.length < PAGE_SIZE) break;
    after = rows[rows.length - 1]!.id;
  }
  return counts;
}

export function formatCounts(c: BackfillCounts, dry: boolean): string {
  return [
    dry ? 'DRY RUN: nothing was written. Counts show what would change.' : 'Backfill finished.',
    `scanned pending applications: ${c.scanned}`,
    `${dry ? 'would fill' : 'filled'} posting emails: ${c.emailFilled}`,
    `${dry ? 'would fill' : 'filled'} WhatsApp numbers: ${c.whatsappFilled}`,
    `kept (manual or Hunter address): ${c.protectedEmail}`,
    `skipped (changed while running): ${c.lostRace}`,
  ].join('\n');
}
