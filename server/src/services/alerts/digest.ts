import type { Logger } from '../../lib/logger.js';
import type { OutgoingEmail } from '../gmail/mime.js';
import type { DigestThrottle } from './throttle.js';

/** One new match as the digest sees it. There is deliberately no CV or cover letter text here. */
export interface DigestMatch {
  id: string;
  title: string;
  company: string;
  match_score: number;
}

/** Only matches made in the last day are mentioned, so switching the digest on does not bring up old ones. */
export const DIGEST_WINDOW_HOURS = 24;
/** The email lists at most this many matches and says how many more there are. */
export const MAX_LISTED = 10;
const MAX_FIELD_LENGTH = 120;

export interface AlertDeps {
  loadSubscribers(): Promise<Array<{ user_id: string; auto_threshold: number }>>;
  loadNewMatches(userId: string, minScore: number, since: Date): Promise<DigestMatch[]>;
  markNotified(applicationIds: string[], at: Date): Promise<void>;
  isGmailConnected(userId: string): Promise<boolean>;
  /** The user's own Gmail address and a token for it (the existing gmail.send permission). */
  getAccessToken(userId: string): Promise<{ accessToken: string; email: string }>;
  buildRaw(email: OutgoingEmail): Promise<string>;
  sendMessage(args: { accessToken: string; raw: string }): Promise<unknown>;
  throttle: DigestThrottle;
  /** The web app's address, for the link in the email. */
  webOrigin: string;
  now(): Date;
  log: Logger;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);

export function buildDigest(matches: DigestMatch[], threshold: number, webOrigin: string): { subject: string; text: string } {
  const count = matches.length;
  const listed = matches.slice(0, MAX_LISTED).map((m) => `- ${oneLine(m.title)} at ${oneLine(m.company)} (${m.match_score}% match)`);
  const more = count > MAX_LISTED ? [`...and ${count - MAX_LISTED} more.`] : [];
  const text = [
    `You have ${count} new job ${count === 1 ? 'match' : 'matches'} at or above your ${threshold}% match score.`,
    '',
    ...listed,
    ...more,
    '',
    `Review ${count === 1 ? 'it' : 'them'} in JobLume: ${webOrigin.replace(/\/+$/, '')}/queue`,
    '',
    'You get this email because "Email me about new matches" is switched on in your JobLume Settings. Switch it off there at any time.',
    '',
  ].join('\n');
  return { subject: `JobLume: ${count} new ${count === 1 ? 'match' : 'matches'} to review`, text };
}

/**
 * For every user who opted in: if they have new matches at or above their threshold, send ONE digest to their own
 * Gmail address. At most one per user per hour, and never when there is nothing new. A failure for one user does not stop the rest.
 */
export async function runAlertDigest(d: AlertDeps): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };
  const since = new Date(d.now().getTime() - DIGEST_WINDOW_HOURS * 3_600_000);

  for (const subscriber of await d.loadSubscribers()) {
    const userId = subscriber.user_id;
    let throttled = false;
    try {
      if (!(await d.isGmailConnected(userId))) {
        result.skipped++;
        continue;
      }
      const matches = await d.loadNewMatches(userId, subscriber.auto_threshold, since);
      if (matches.length === 0) {
        result.skipped++;
        continue;
      }
      if (!(await d.throttle.acquire(userId))) {
        result.skipped++;
        continue;
      }
      throttled = true;

      const { accessToken, email } = await d.getAccessToken(userId);
      const { subject, text } = buildDigest(matches, subscriber.auto_threshold, d.webOrigin);
      const raw = await d.buildRaw({ from: email, to: email, subject, text });
      await d.sendMessage({ accessToken, raw });
      result.sent++;
      // From here the email is out: the hour stays used even if the marker below fails.
      throttled = false;
      try {
        await d.markNotified(matches.map((m) => m.id), d.now());
      } catch (err) {
        d.log.error({ err, userId }, 'digest sent but its matches could not be marked');
      }
    } catch (err) {
      result.failed++;
      d.log.warn({ err, userId }, 'new-match digest failed');
      if (throttled) {
        try {
          await d.throttle.release(userId);
        } catch (releaseErr) {
          d.log.warn({ err: releaseErr, userId }, 'could not release the digest hour');
        }
      }
    }
  }
  return result;
}
