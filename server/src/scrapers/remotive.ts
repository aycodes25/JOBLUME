import type { JobStub } from '../domain/jobs.js';
import type { FetchText } from '../lib/http.js';
import { htmlToText } from '../lib/html.js';
import type { Scraper } from './types.js';

const API_URL = 'https://remotive.com/api/remote-jobs?limit=100';

interface RemotiveJob {
  url?: string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  description?: string;
}

export function parseRemotive(json: string): JobStub[] {
  const data = JSON.parse(json) as { jobs?: RemotiveJob[] };
  const stubs: JobStub[] = [];
  for (const j of data.jobs ?? []) {
    if (!j.url || !j.title || !j.company_name) continue;
    stubs.push({
      title: j.title.trim(),
      company: j.company_name.trim(),
      location: j.candidate_required_location?.trim() || 'Remote',
      url: j.url,
      source: 'remotive',
      description: htmlToText(j.description ?? ''),
    });
  }
  return stubs;
}

export function createRemotiveScraper(fetchText: FetchText): Scraper {
  return {
    source: 'remotive',
    async list() {
      return parseRemotive(await fetchText(API_URL));
    },
    async detail(stub) {
      return {
        title: stub.title,
        company: stub.company,
        location: stub.location,
        description: stub.description ?? '',
        source: 'remotive',
        url: stub.url,
        companyDomain: null,
      };
    },
  };
}
