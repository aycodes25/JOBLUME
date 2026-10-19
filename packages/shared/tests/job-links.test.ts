import { describe, expect, it } from 'vitest';
import { canonicalJobUrl, MAX_JOB_LINK_LENGTH } from '../src/index.js';

describe('canonicalJobUrl: LinkedIn', () => {
  const canonical = 'https://www.linkedin.com/jobs/view/4012345678/';
  it.each([
    ['the canonical form', 'https://www.linkedin.com/jobs/view/4012345678/'],
    ['no trailing slash', 'https://www.linkedin.com/jobs/view/4012345678'],
    ['the bare host, a slug and tracking params', 'https://linkedin.com/jobs/view/data-analyst-at-acme-4012345678?trk=public_jobs&refId=abc%3D%3D'],
    ['tracking params and a fragment', 'https://www.linkedin.com/jobs/view/4012345678/?trackingId=x#top'],
    ['a search page with a selected job', 'https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=data'],
    ['a collection page with a selected job', 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678'],
    ['spaces and upper case in the host', '  https://WWW.LinkedIn.com/jobs/view/4012345678/  '],
    ['an explicit default port', 'https://www.linkedin.com:443/jobs/view/4012345678/'],
    ['empty userinfo (the host is still LinkedIn and the output carries none)', 'https://@www.linkedin.com/jobs/view/4012345678/'],
  ])('accepts %s', (_name, input) => {
    expect(canonicalJobUrl(input)).toEqual({ url: canonical, source: 'linkedin' });
  });
});

describe('canonicalJobUrl: Indeed', () => {
  it.each([
    ['https://ng.indeed.com/viewjob?jk=0123456789abcdef&from=serp', 'https://ng.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://indeed.com/viewjob?jk=0123456789ABCDEF', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://www.indeed.com/rc/clk?jk=0123456789abcdef&fccid=x&vjs=3', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://uk.indeed.com/m/viewjob?jk=0123456789abcdef', 'https://uk.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://www.indeed.com/jobs?q=analyst&l=Lagos&vjk=0123456789abcdef', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://www.indeed.com/q-data-analyst-jobs.html?vjk=0123456789abcdef', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://WWW.INDEED.COM/viewjob?jk=0123456789abcdef', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
  ])('canonicalises %s', (input, expected) => {
    expect(canonicalJobUrl(input)).toEqual({ url: expected, source: 'indeed' });
  });
});

describe('canonicalJobUrl: refused', () => {
  it.each([
    ['http (not https)', 'http://www.linkedin.com/jobs/view/4012345678/'],
    ['another job site', 'https://www.glassdoor.com/job-listing/123'],
    ['a look-alike host', 'https://evil-indeed.com/viewjob?jk=0123456789abcdef'],
    ['a host that only starts with the name', 'https://indeed.com.evil.io/viewjob?jk=0123456789abcdef'],
    ['a LinkedIn look-alike', 'https://linkedin.com.evil.io/jobs/view/4012345678/'],
    ['a LinkedIn look-alike with a hyphen', 'https://evil-linkedin.com/jobs/view/4012345678/'],
    ['a LinkedIn subdomain that is not allowed', 'https://ng.linkedin.com/jobs/view/4012345678/'],
    ['a LinkedIn profile', 'https://www.linkedin.com/in/ada-lovelace/'],
    ['a LinkedIn company page', 'https://www.linkedin.com/company/acme/jobs/'],
    ['a LinkedIn search without a selected job', 'https://www.linkedin.com/jobs/search/?keywords=data'],
    ['an Indeed search without a selected job', 'https://www.indeed.com/jobs?q=analyst'],
    ['an Indeed company page', 'https://www.indeed.com/cmp/Acme/jobs?jk=0123456789abcdef'],
    ['a malformed Indeed job key', 'https://www.indeed.com/viewjob?jk=nothex'],
    ['credentials in the URL', 'https://user:pw@www.linkedin.com/jobs/view/4012345678/'],
    ['a LinkedIn host used as the username', 'https://www.linkedin.com@evil.com/jobs/view/4012345678/'],
    ['a LinkedIn host used as the username with a password', 'https://www.linkedin.com:pw@evil.com/jobs/view/4012345678/'],
    ['an Indeed host used as the username', 'https://www.indeed.com@evil.com/viewjob?jk=0123456789abcdef'],
    ['a backslash that hides the real host', 'https://evil.com\\@www.linkedin.com/jobs/view/4012345678/'],
    ['a backslash before the host', 'https://evil.com\\.www.linkedin.com/jobs/view/4012345678/'],
    ['an encoded slash in the host', 'https://www.linkedin.com%2f.evil.com/jobs/view/4012345678/'],
    ['an encoded @ in the host', 'https://www.linkedin.com%40evil.com/jobs/view/4012345678/'],
    ['a trailing-dot host', 'https://www.linkedin.com./jobs/view/4012345678/'],
    ['a trailing-dot Indeed host', 'https://www.indeed.com./viewjob?jk=0123456789abcdef'],
    ['a deeper Indeed subdomain chain', 'https://evil.com.indeed.com.evil.io/viewjob?jk=0123456789abcdef'],
    ['a nested Indeed subdomain', 'https://a.b.indeed.com/viewjob?jk=0123456789abcdef'],
    ['a punycode look-alike host', 'https://xn--linkedn-9ya.com/jobs/view/4012345678/'],
    ['a Unicode look-alike host', 'https://www.linkedin.cоm/jobs/view/4012345678/'],
    ['an IP address host', 'https://127.0.0.1/jobs/view/4012345678/'],
    ['localhost', 'https://localhost/viewjob?jk=0123456789abcdef'],
    ['a custom port', 'https://www.linkedin.com:8443/jobs/view/4012345678/'],
    ['a custom port on Indeed', 'https://www.indeed.com:8443/viewjob?jk=0123456789abcdef'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>1</script>'],
    ['a file: URL', 'file:///etc/passwd'],
    ['a protocol-relative URL', '//www.linkedin.com/jobs/view/4012345678/'],
    ['a scheme-less URL', 'www.linkedin.com/jobs/view/4012345678/'],
    ['text that is not a URL', 'linkedin job 4012345678'],
    ['an encoded job path', 'https://www.linkedin.com/jobs/view/%34012345678/'],
    ['a LinkedIn job id that is too short', 'https://www.linkedin.com/jobs/view/1234/'],
    ['a non-numeric LinkedIn currentJobId', 'https://www.linkedin.com/jobs/search/?currentJobId=abc12345'],
    ['an empty string', '   '],
  ])('refuses %s', (_name, input) => {
    expect(canonicalJobUrl(input)).toBeNull();
  });

  it.each([undefined, null, 42, {}, ['https://www.linkedin.com/jobs/view/4012345678/']])('refuses the non-string %j', (input) => {
    expect(canonicalJobUrl(input)).toBeNull();
  });

  it('refuses links longer than 2048 characters', () => {
    expect(MAX_JOB_LINK_LENGTH).toBe(2048);
    const long = `https://www.linkedin.com/jobs/view/4012345678/?pad=${'a'.repeat(MAX_JOB_LINK_LENGTH)}`;
    expect(canonicalJobUrl(long)).toBeNull();
  });

  it('accepts a link of exactly the maximum length', () => {
    const base = 'https://www.linkedin.com/jobs/view/4012345678/?pad=';
    const exact = base + 'a'.repeat(MAX_JOB_LINK_LENGTH - base.length);
    expect(exact.length).toBe(MAX_JOB_LINK_LENGTH);
    expect(canonicalJobUrl(exact)?.source).toBe('linkedin');
  });

  it('refuses pathological input quickly', () => {
    const start = Date.now();
    const evil = `https://www.linkedin.com/jobs/view/${'a-'.repeat(900)}x`;
    expect(canonicalJobUrl(evil)).toBeNull();
    expect(Date.now() - start).toBeLessThan(500);
  });
});
