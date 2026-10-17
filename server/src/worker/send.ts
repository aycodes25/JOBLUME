import { ApiError } from '../lib/errors.js';
import type { SendJobData } from '../queues.js';

export interface SendJobDeps {
  sendApplication(userId: string, applicationId: string): Promise<unknown>;
  sendFollowUp(userId: string, followUpId: string): Promise<void>;
}

/** Runs one queued automatic send. A business-rule refusal (cap reached, not eligible, ...) is a result, not a failure. */
export async function runSendJob(data: SendJobData, d: SendJobDeps): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    if (data.kind === 'application') await d.sendApplication(data.userId, data.applicationId);
    else await d.sendFollowUp(data.userId, data.followUpId);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    throw err;
  }
}
