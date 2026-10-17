export const SCAN_LIMIT = 50;

export interface ScanDeps {
  findDue(limit: number): Promise<{ id: string }[]>;
  enqueueDraft(applicationId: string): Promise<void>;
}

export async function runFollowUpScan(d: ScanDeps): Promise<{ queued: number; failed: number }> {
  const due = await d.findDue(SCAN_LIMIT);
  let queued = 0;
  let failed = 0;
  for (const application of due) {
    try {
      await d.enqueueDraft(application.id);
      queued += 1;
    } catch {
      failed += 1;
    }
  }
  return { queued, failed };
}
