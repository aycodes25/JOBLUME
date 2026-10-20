import { isValidEmail, recipientInfo, sendDisabledReason } from '@/lib/email-send';

describe('isValidEmail', () => {
  it.each(['a@b.co', ' jane.doe+jobs@acme.com '])('accepts %j', (v) => expect(isValidEmail(v)).toBe(true));
  it.each(['', 'nope', 'a@b', '@b.co', 'a b@c.co'])('rejects %j', (v) => expect(isValidEmail(v)).toBe(false));
});

describe('recipientInfo', () => {
  const stored = (over = {}) => ({ hiring_manager_email: 'hr@acme.com', email_source: 'hunter' as const, email_confidence: 90, ...over });

  it('labels a trusted Hunter address as high confidence', () => {
    expect(recipientInfo(stored(), 'hr@acme.com')).toEqual({ source: 'hunter', isGuess: false, badge: { label: 'Found, high confidence', tone: 'success' } });
  });

  it('labels a weaker Hunter address as medium confidence', () => {
    expect(recipientInfo(stored({ email_confidence: 60 }), 'hr@acme.com').badge).toEqual({ label: 'Found, medium confidence', tone: 'warning' });
  });

  it('labels a guess and flags it as a guess', () => {
    const info = recipientInfo(stored({ email_source: 'guess', email_confidence: 30 }), 'hr@acme.com');
    expect(info).toEqual({ source: 'guess', isGuess: true, badge: { label: 'Guess, low confidence', tone: 'warning' } });
  });

  it('labels a pasted address as entered by the user', () => {
    expect(recipientInfo(stored({ email_source: 'manual', email_confidence: null }), 'hr@acme.com').badge).toEqual({ label: 'Entered by you', tone: 'secondary' });
  });

  it('treats an edited address as entered by the user, never as a guess', () => {
    const info = recipientInfo(stored({ email_source: 'guess', email_confidence: 30 }), 'someone@else.com');
    expect(info).toEqual({ source: 'manual', isGuess: false, badge: { label: 'Entered by you', tone: 'secondary' } });
  });

  it('compares addresses case-insensitively and ignores spaces', () => {
    expect(recipientInfo(stored(), '  HR@Acme.com ').source).toBe('hunter');
  });

  it('has no badge when there is no address', () => {
    expect(recipientInfo(stored({ hiring_manager_email: null, email_source: null, email_confidence: null }), '')).toEqual({ source: null, isGuess: false, badge: null });
  });
});

describe('sendDisabledReason', () => {
  const ok = { gmailConnected: true, email: 'hr@acme.com', isGuess: false, guessConfirmed: false };

  it('is null when sending is allowed', () => {
    expect(sendDisabledReason(ok)).toBeNull();
  });

  it('explains each blocker, in priority order', () => {
    expect(sendDisabledReason({ ...ok, gmailConnected: false })).toBe('Connect Gmail to send emails.');
    expect(sendDisabledReason({ ...ok, locked: 'Save your changes first.' })).toBe('Save your changes first.');
    expect(sendDisabledReason({ ...ok, email: '  ' })).toBe('Add a contact email first.');
    expect(sendDisabledReason({ ...ok, email: 'nope' })).toBe('Enter a valid email address.');
    expect(sendDisabledReason({ ...ok, isGuess: true })).toBe('Tick the box to send to this guessed address.');
    expect(sendDisabledReason({ ...ok, isGuess: true, guessConfirmed: true })).toBeNull();
  });

  it('reports Gmail first even when other problems exist', () => {
    expect(sendDisabledReason({ ...ok, gmailConnected: false, email: '' })).toBe('Connect Gmail to send emails.');
  });
});
