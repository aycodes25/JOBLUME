export const isValidEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

type Source = 'hunter' | 'guess' | 'manual';

export function recipientInfo(
  stored: { hiring_manager_email: string | null; email_source: Source | null; email_confidence: number | null },
  current: string,
): { source: Source | null; isGuess: boolean; badge: { label: string; tone: 'success' | 'warning' | 'secondary' } | null } {
  const typed = current.trim().toLowerCase();
  if (!typed) return { source: null, isGuess: false, badge: null };
  const same = typed === (stored.hiring_manager_email ?? '').trim().toLowerCase();
  const source: Source = same ? (stored.email_source ?? 'manual') : 'manual';
  if (source === 'guess') return { source, isGuess: true, badge: { label: 'Guess, low confidence', tone: 'warning' } };
  if (source === 'hunter') {
    return (stored.email_confidence ?? 0) >= 80
      ? { source, isGuess: false, badge: { label: 'Found, high confidence', tone: 'success' } }
      : { source, isGuess: false, badge: { label: 'Found, medium confidence', tone: 'warning' } };
  }
  return { source, isGuess: false, badge: { label: 'Entered by you', tone: 'secondary' } };
}

export function sendDisabledReason(i: {
  gmailConnected: boolean;
  email: string;
  isGuess: boolean;
  guessConfirmed: boolean;
  locked?: string;
}): string | null {
  if (!i.gmailConnected) return 'Connect Gmail to send emails.';
  if (i.locked) return i.locked;
  if (!i.email.trim()) return 'Add a contact email first.';
  if (!isValidEmail(i.email)) return 'Enter a valid email address.';
  if (i.isGuess && !i.guessConfirmed) return 'Tick the box to send to this guessed address.';
  return null;
}
