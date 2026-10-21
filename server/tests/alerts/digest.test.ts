import { describe, expect, it, vi } from 'vitest';
import { buildDigest, DIGEST_WINDOW_HOURS, MAX_LISTED, runAlertDigest, type AlertDeps, type DigestMatch } from '../../src/services/alerts/digest.js';
import { createDigestThrottle } from '../../src/services/alerts/throttle.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const match = (n: number, over: Partial<DigestMatch> = {}): DigestMatch => ({ id: `a${n}`, title: `Backend Engineer ${n}`, company: `Acme ${n}`, match_score: 90 - n, ...over });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** An in-memory stand-in for the one-hour throttle. */
function fakeThrottle() {
  const held = new Set<string>();
  return {
    held,
    acquire: vi.fn(async (userId: string) => (held.has(userId) ? false : (held.add(userId), true))),
    release: vi.fn(async (userId: string) => void held.delete(userId)),
  };
}

function make(over: Partial<AlertDeps> = {}) {
  const throttle = fakeThrottle();
  const sent: Array<{ accessToken: string; raw: string }> = [];
  const built: Array<{ from: string; to: string; subject: string; text: string }> = [];
  const deps: AlertDeps = {
    loadSubscribers: vi.fn<AlertDeps['loadSubscribers']>().mockImplementation(async () => [{ user_id: 'u1', auto_threshold: 80 }]),
    loadNewMatches: vi.fn<AlertDeps['loadNewMatches']>().mockImplementation(async () => [match(1), match(2)]),
    markNotified: vi.fn<AlertDeps['markNotified']>().mockImplementation(async () => undefined),
    isGmailConnected: vi.fn<AlertDeps['isGmailConnected']>().mockImplementation(async () => true),
    getAccessToken: vi.fn<AlertDeps['getAccessToken']>().mockImplementation(async () => ({ accessToken: 'TOKEN', email: 'me@gmail.com' })),
    buildRaw: vi.fn<AlertDeps['buildRaw']>().mockImplementation(async (email) => (built.push(email as never), 'RAW')),
    sendMessage: vi.fn<AlertDeps['sendMessage']>().mockImplementation(async (args) => void sent.push(args)),
    throttle,
    webOrigin: 'https://app.joblume.test/',
    now: () => NOW,
    log,
    ...over,
  };
  return { deps, throttle, sent, built };
}

describe('buildDigest', () => {
  it('lists each match with its score and links to the queue of the web app', () => {
    const { subject, text } = buildDigest([match(1), match(2)], 80, 'https://app.joblume.test/');
    expect(subject).toBe('JobLume: 2 new matches to review');
    expect(text).toContain('You have 2 new job matches at or above your 80% match score.');
    expect(text).toContain('- Backend Engineer 1 at Acme 1 (89% match)');
    expect(text).toContain('- Backend Engineer 2 at Acme 2 (88% match)');
    expect(text).toContain('Review them in JobLume: https://app.joblume.test/queue');
    expect(text).toContain('Switch it off there at any time.');
  });

  it('says "match" and "it" for a single match', () => {
    const { subject, text } = buildDigest([match(1)], 70, 'http://localhost:3000');
    expect(subject).toBe('JobLume: 1 new match to review');
    expect(text).toContain('You have 1 new job match at or above your 70% match score.');
    expect(text).toContain('Review it in JobLume: http://localhost:3000/queue');
  });

  it('lists at most ten and says how many more', () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => match(i + 1));
    const { text } = buildDigest(many, 80, 'http://localhost:3000');
    expect(text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(MAX_LISTED);
    expect(text).toContain('...and 3 more.');
  });

  it('flattens line breaks in a scraped title and cuts very long ones', () => {
    const { text } = buildDigest([match(1, { title: `Engineer\nBCC: x@y.z ${'a'.repeat(300)}` })], 80, 'http://localhost:3000');
    const line = text.split('\n').find((l) => l.startsWith('- '))!;
    expect(line).toContain('Engineer BCC: x@y.z');
    expect(line.length).toBeLessThan(200);
  });
});

describe('runAlertDigest', () => {
  it('sends one digest to the user\'s own Gmail address and marks the matches as notified', async () => {
    const { deps, sent, built } = make();
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sent).toEqual([{ accessToken: 'TOKEN', raw: 'RAW' }]);
    expect(built).toHaveLength(1);
    expect(built[0]!.from).toBe('me@gmail.com');
    expect(built[0]!.to).toBe('me@gmail.com');
    expect(built[0]!.subject).toBe('JobLume: 2 new matches to review');
    expect(deps.markNotified).toHaveBeenCalledWith(['a1', 'a2'], NOW);
  });

  it('asks only for matches at or above the user\'s threshold from the last day', async () => {
    const { deps } = make();
    await runAlertDigest(deps);
    const [userId, minScore, since] = vi.mocked(deps.loadNewMatches).mock.calls[0]!;
    expect(userId).toBe('u1');
    expect(minScore).toBe(80);
    expect(NOW.getTime() - since.getTime()).toBe(DIGEST_WINDOW_HOURS * 3_600_000);
  });

  it('sends nothing, and does not use up the hour, when there is nothing new', async () => {
    const { deps, throttle, sent } = make({ loadNewMatches: vi.fn<AlertDeps['loadNewMatches']>().mockImplementation(async () => []) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(throttle.acquire).not.toHaveBeenCalled();
    expect(deps.markNotified).not.toHaveBeenCalled();
  });

  it('sends nothing when nobody opted in', async () => {
    const { deps, sent } = make({ loadSubscribers: vi.fn<AlertDeps['loadSubscribers']>().mockImplementation(async () => []) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(deps.loadNewMatches).not.toHaveBeenCalled();
  });

  it('skips a user whose Gmail is not connected', async () => {
    const { deps, sent } = make({ isGmailConnected: vi.fn<AlertDeps['isGmailConnected']>().mockImplementation(async () => false) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(deps.loadNewMatches).not.toHaveBeenCalled();
  });

  it('sends at most one digest an hour: a second run right after sends nothing', async () => {
    const { deps, sent } = make();
    await runAlertDigest(deps);
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it('gives the hour back when the send fails, so the next run tries again', async () => {
    let fail = true;
    const { deps, sent, throttle } = make({
      sendMessage: vi.fn<AlertDeps['sendMessage']>().mockImplementation(async (args) => {
        if (fail) throw new Error('Gmail down');
        sent.push(args);
      }),
    });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(deps.markNotified).not.toHaveBeenCalled();
    expect(throttle.release).toHaveBeenCalledWith('u1');
    fail = false;
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it('keeps the hour used when the email went out but marking failed', async () => {
    const { deps, throttle } = make({ markNotified: vi.fn<AlertDeps['markNotified']>().mockImplementation(async () => { throw new Error('db down'); }) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(throttle.release).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), 'digest sent but its matches could not be marked');
  });

  it('one user failing does not stop the next user', async () => {
    const getAccessToken = vi.fn<AlertDeps['getAccessToken']>().mockImplementation(async (userId) => {
      if (userId === 'u1') throw new Error('reconnect Gmail');
      return { accessToken: 'T2', email: 'two@gmail.com' };
    });
    const { deps, sent, built } = make({
      loadSubscribers: vi.fn<AlertDeps['loadSubscribers']>().mockImplementation(async () => [
        { user_id: 'u1', auto_threshold: 80 },
        { user_id: 'u2', auto_threshold: 60 },
      ]),
      getAccessToken,
    });
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(sent).toEqual([{ accessToken: 'T2', raw: 'RAW' }]);
    expect(built[0]!.to).toBe('two@gmail.com');
  });

  it('never puts CV or cover letter text in the email: the digest only ever receives titles, companies and scores', async () => {
    const leaky = { ...match(1), tailored_cv_text: 'SECRET CV TEXT', cover_letter_text: 'SECRET LETTER' } as DigestMatch;
    const { deps, built } = make({ loadNewMatches: vi.fn<AlertDeps['loadNewMatches']>().mockImplementation(async () => [leaky]) });
    await runAlertDigest(deps);
    expect(JSON.stringify(built)).not.toMatch(/SECRET/);
  });
});

describe('createDigestThrottle', () => {
  function fakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => {
        if (store.has(key)) return null;
        store.set(key, value);
        return 'OK' as const;
      }),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    };
  }

  it('lets the first acquire through for an hour per user, and refuses the second', async () => {
    const redis = fakeRedis();
    const throttle = createDigestThrottle(redis as never);
    expect(await throttle.acquire('u1')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('alert:digest:u1', '1', 'EX', 3600, 'NX');
    expect(await throttle.acquire('u1')).toBe(false);
    expect(await throttle.acquire('u2')).toBe(true);
  });

  it('release() makes the user eligible again', async () => {
    const throttle = createDigestThrottle(fakeRedis() as never);
    await throttle.acquire('u1');
    await throttle.release('u1');
    expect(await throttle.acquire('u1')).toBe(true);
  });
});
