import { describe, expect, it, vi } from 'vitest';
import type { JobFetchesRepo } from '../../src/services/jobs/fetches-repo.js';
import { createJobLinksService, RECENT_FETCHES, type JobLinksDeps } from '../../src/services/jobs/links.js';

const LINK = { url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' as const };

function make(over: Partial<JobLinksDeps> = {}) {
  const fetches = {
    save: vi.fn<JobFetchesRepo['save']>().mockImplementation(async () => undefined),
    listRecent: vi.fn<JobFetchesRepo['listRecent']>().mockImplementation(async () => []),
  };
  const deps: JobLinksDeps = {
    findJobIdByUrl: vi.fn<JobLinksDeps['findJobIdByUrl']>().mockImplementation(async () => null),
    fetches,
    enqueueFetch: vi.fn<JobLinksDeps['enqueueFetch']>().mockImplementation(async () => undefined),
    enqueueUserMatch: vi.fn<JobLinksDeps['enqueueUserMatch']>().mockImplementation(async () => undefined),
    ...over,
  };
  return { deps, fetches, svc: createJobLinksService(deps) };
}

describe('createJobLinksService.addFromUrl', () => {
  it('records a new link as queued and queues the page fetch', async () => {
    const { svc, deps, fetches } = make();
    expect(await svc.addFromUrl('u1', LINK)).toEqual({ queued: true });
    expect(deps.findJobIdByUrl).toHaveBeenCalledWith(LINK.url);
    expect(fetches.save).toHaveBeenCalledWith('u1', LINK.url, { status: 'queued' });
    expect(deps.enqueueFetch).toHaveBeenCalledWith({ userId: 'u1', url: LINK.url, source: 'linkedin' });
    expect(deps.enqueueUserMatch).not.toHaveBeenCalled();
  });

  it('answers with the stored job and matches it for this user when the link is already a job', async () => {
    const { svc, deps, fetches } = make({ findJobIdByUrl: vi.fn<JobLinksDeps['findJobIdByUrl']>().mockImplementation(async () => 'j1') });
    expect(await svc.addFromUrl('u1', LINK)).toEqual({ job_id: 'j1' });
    expect(fetches.save).toHaveBeenCalledWith('u1', LINK.url, { status: 'done', jobId: 'j1' });
    expect(deps.enqueueUserMatch).toHaveBeenCalledWith('u1', 'j1');
    expect(deps.enqueueFetch).not.toHaveBeenCalled();
  });
});

describe('createJobLinksService.listFetches', () => {
  it('lists the user\'s 20 most recent links', async () => {
    const { svc, fetches } = make();
    await svc.listFetches('u1');
    expect(RECENT_FETCHES).toBe(20);
    expect(fetches.listRecent).toHaveBeenCalledWith('u1', 20);
  });
});
