import type { EmailCandidate } from '@joblume/shared';
import type { HunterContact } from './hunter.js';

export const TRUSTED_CONFIDENCE = 80;
export const GUESS_CONFIDENCE = 30;
export const MIN_HUNTER_CONFIDENCE = 50;
export const MAX_CANDIDATES = 6;
export const GUESS_MAILBOXES = ['careers', 'jobs', 'hr', 'recruitment'] as const;

const RECRUITING = /recruit|talent|human resources|\bhr\b|people|hiring|careers|staffing/i;

const isRecruiting = (c: HunterContact) => c.department === 'hr' || (c.position !== null && RECRUITING.test(c.position));
const tier = (c: HunterContact) => (isRecruiting(c) ? 0 : c.type === 'generic' ? 1 : 2);

export function rankContacts(contacts: HunterContact[]): EmailCandidate[] {
  return contacts
    .filter((c) => c.confidence >= MIN_HUNTER_CONFIDENCE)
    .sort((a, b) => tier(a) - tier(b) || b.confidence - a.confidence || a.email.localeCompare(b.email))
    .map((c) => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      const label = isRecruiting(c) ? (c.position ?? 'Recruiting contact') : c.type === 'generic' ? 'Generic company address' : (c.position ?? 'Company contact');
      return {
        email: c.email,
        confidence: c.confidence,
        source: 'hunter' as const,
        label,
        ...(name ? { name } : {}),
        ...(c.position ? { position: c.position } : {}),
      };
    });
}

export function guessCandidates(domain: string): EmailCandidate[] {
  return GUESS_MAILBOXES.map((mailbox) => ({
    email: `${mailbox}@${domain}`,
    confidence: GUESS_CONFIDENCE,
    source: 'guess' as const,
    label: 'Guess, low confidence',
  }));
}

export const POSTING_CONFIDENCE = 95;

/** Addresses the employer printed in the posting. Not guesses, but never Auto-eligible (Auto needs a Hunter source). */
export function postingCandidates(emails: string[]): EmailCandidate[] {
  return emails.slice(0, MAX_CANDIDATES).map((email) => ({
    email,
    confidence: POSTING_CONFIDENCE,
    source: 'posting' as const,
    label: 'Published in the job post',
  }));
}

export function buildCandidates(domain: string | null, contacts: HunterContact[]): EmailCandidate[] {
  const ranked = rankContacts(contacts);
  const all = domain && !ranked.some((c) => c.confidence >= TRUSTED_CONFIDENCE) ? [...ranked, ...guessCandidates(domain)] : ranked;
  const seen = new Set<string>();
  const unique = all.filter((c) => {
    const key = c.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.slice(0, MAX_CANDIDATES);
}
