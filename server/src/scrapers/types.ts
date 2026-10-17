import type { JobSource, JobStub, NormalisedJob } from '../domain/jobs.js';

export interface Scraper {
  source: JobSource;
  /** Cheap: one listing request. */
  list(): Promise<JobStub[]>;
  /** May cost one request per job. Only called for stubs not already stored. */
  detail(stub: JobStub): Promise<NormalisedJob>;
  /** Random delay range between detail calls. Omit when detail() makes no request. */
  detailDelayMs?: [min: number, max: number];
}
