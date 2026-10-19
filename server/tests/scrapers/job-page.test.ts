import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractJobPage, type FetchedPage } from '../../src/scrapers/job-page.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const LI = { url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' as const };
const IN = { url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', source: 'indeed' as const };
const page = (html: string, over: Partial<FetchedPage> = {}): FetchedPage => ({ status: 200, finalUrl: LI.url, html, ...over });

describe('extractJobPage: LinkedIn', () => {
  it('reads the JSON-LD posting, decoding its escaped HTML description', () => {
    const result = extractJobPage(page(fixture('linkedin-job.html')), LI);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job).toMatchObject({
      title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos, Lagos State, Nigeria',
      source: 'linkedin', url: LI.url, companyDomain: null,
    });
    expect(result.job.description).toContain('Acme Analytics is hiring a Data Analyst to join our Lagos team.');
    expect(result.job.description).toContain('SQL and Python');
    expect(result.job.description).not.toMatch(/<p>|&lt;/);
  });

  it('falls back to the top-card selectors when there is no JSON-LD', () => {
    const html = fixture('linkedin-job.html').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
    const result = extractJobPage(page(html), LI);
    expect(result).toEqual({
      ok: true,
      job: {
        title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos, Lagos State, Nigeria',
        description: 'Acme Analytics is hiring a Data Analyst.', source: 'linkedin', url: LI.url, companyDomain: null,
      },
    });
  });

  it('ignores a broken JSON-LD block and still reads the page', () => {
    const html = fixture('linkedin-job.html').replace('<head>', '<head><script type="application/ld+json">{not json</script>');
    expect(extractJobPage(page(html), LI)).toMatchObject({ ok: true, job: { title: 'Data Analyst' } });
  });
});

describe('extractJobPage: Indeed', () => {
  it('reads the header and description selectors and drops the hidden "job post" suffix', () => {
    const result = extractJobPage(page(fixture('indeed-job.html'), { finalUrl: IN.url }), IN);
    expect(result).toMatchObject({
      ok: true,
      job: { title: 'Backend Engineer', company: 'Paystack', location: 'Lagos', source: 'indeed', url: IN.url, companyDomain: null },
    });
    if (result.ok) expect(result.job.description).toBe('We are looking for a backend engineer.\n• Node.js and TypeScript\n• PostgreSQL');
  });
});

describe('extractJobPage: failure reasons', () => {
  it.each([
    ['a 404', page('<html></html>', { status: 404 }), 'not_found'],
    ['a 410', page('<html></html>', { status: 410 }), 'not_found'],
    ['a 401', page('<html></html>', { status: 401 }), 'login_required'],
    ['a 403', page('<html></html>', { status: 403 }), 'blocked'],
    ['a 429', page('<html></html>', { status: 429 }), 'blocked'],
    ['LinkedIn bot status 999', page('<html></html>', { status: 999 }), 'blocked'],
    ['a redirect to the LinkedIn authwall', page(fixture('linkedin-job.html'), { finalUrl: 'https://www.linkedin.com/authwall?trk=x' }), 'login_required'],
    ['a redirect to the LinkedIn login', page('<html></html>', { finalUrl: 'https://www.linkedin.com/login?session_redirect=x' }), 'login_required'],
    ['a redirect to the Indeed sign-in', page('<html></html>', { finalUrl: 'https://secure.indeed.com/auth?continue=x' }), 'login_required'],
    ['a sign-in form instead of a job', page('<html><body><form action="https://www.linkedin.com/uas/login-submit"><input name="session_key"></form></body></html>'), 'login_required'],
    ['an Indeed security check', page(fixture('indeed-blocked.html')), 'blocked'],
    ['a job that is no longer available', page(fixture('linkedin-expired.html')), 'not_found'],
    ['a page without the job fields', page('<html><body><h1>Data Analyst</h1><p>Some text</p></body></html>'), 'unparseable'],
  ])('reports %s as %s', (_name, input, reason) => {
    expect(extractJobPage(input, LI)).toEqual({ ok: false, reason });
  });
});
