import type { FollowUpsJobData } from '../queues.js';
import { runFollowUpDraft, type DraftDeps } from '../services/followups/draft.js';
import { runFollowUpScan, type ScanDeps } from '../services/followups/scan.js';

export async function runFollowUpsJob(data: FollowUpsJobData, d: { scan: ScanDeps; draft: DraftDeps }) {
  return data.kind === 'scan' ? runFollowUpScan(d.scan) : runFollowUpDraft({ applicationId: data.applicationId }, d.draft);
}
