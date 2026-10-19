import { canonicalJobUrl, type AddJobLinkResult, type JobFetch, type JobFetchReason } from '@joblume/shared';
import { sourceLabel } from './format';

export const INVALID_LINK_MESSAGE =
  'That is not a LinkedIn or Indeed job link. Open the job itself and copy the address from your browser.';

export const FETCH_REASON_TEXT: Record<JobFetchReason, string> = {
  blocked: 'The site blocked us from reading it. Try again later.',
  login_required: 'The site asked for a sign-in, so we could not read it.',
  not_found: 'This job is no longer available.',
  unparseable: 'We could not read the job details on that page.',
};

export function fetchStatusText(f: Pick<JobFetch, 'status' | 'reason'>): string {
  if (f.status === 'queued') return 'Reading the job…';
  if (f.status === 'done') return 'Job added. Its application appears in your queue shortly.';
  return f.reason ? FETCH_REASON_TEXT[f.reason] : 'We could not read that job.';
}

export function fetchSourceLabel(url: string): string {
  const link = canonicalJobUrl(url);
  return link ? sourceLabel(link.source) : 'Link';
}

export function addResultMessage(result: AddJobLinkResult): string {
  return 'job_id' in result
    ? 'We already have this job. Its application appears in your queue shortly.'
    : 'Got it. We are reading the job now. It appears in your queue within a few minutes.';
}
