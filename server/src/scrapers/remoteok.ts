import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const API_URL = 'https://remoteok.com/api';
// The feed is one large file and the server can take 25 seconds or more to send it.
const TIMEOUT_MS = 60_000;

interface RemoteOkItem {
  url?: string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  epoch?: number;
  date?: string;
}

// RemoteOK adds an anti-spam instruction ("mention the word ... when applying") to the end of every description.
// It is not part of the job, and the AI that writes the cover letter must never see it.
const APPLY_TRAP = /Please mention the word\s+\*\*[^*]*\*\*\s+and tag\s+\S+\s+when applying[\s\S]*$/i;

/**
 * The feed is a JSON array. Its first element is the terms notice, not a job. The terms require a follow link back to
 * RemoteOK and naming it as the source, so the job's own RemoteOK page is kept as the stored link and the board is
 * shown as "RemoteOK".
 */
export function parseRemoteOk(json: string): JobStub[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) return [];
  const stubs: JobStub[] = [];
  for (const item of data as RemoteOkItem[]) {
    if (!item || !item.position || !item.company || !item.url) continue;
    stubs.push({
      title: item.position.trim(),
      company: item.company.trim(),
      // An empty location means the employer hires anywhere. A named place (for example "Copenhagen") is a real limit.
      location: item.location?.trim() || 'Remote',
      url: item.url,
      source: 'remoteok',
      description: htmlToText((item.description ?? '').replace(APPLY_TRAP, '')),
      postedAt: parsePostedAt(item.epoch ?? item.date),
    });
  }
  return stubs;
}

export function createRemoteOkScraper(fetchText: FetchText): Scraper {
  return {
    source: 'remoteok',
    async list() {
      return parseRemoteOk(await fetchText(API_URL, { timeoutMs: TIMEOUT_MS }));
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable RemoteOK job: ${stub.url}`);
      return job;
    },
  };
}
