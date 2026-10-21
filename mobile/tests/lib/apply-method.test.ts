import { applyMethod, whatsappLink } from '@/lib/applications';

describe('applyMethod', () => {
  const cand = { email: 'a@b.co', confidence: 95, source: 'posting', label: 'Published' };
  it('is email when there is a candidate or a stored address', () => {
    expect(applyMethod({ email_candidates: [cand], hiring_manager_email: null, whatsapp_number: null })).toBe('email');
    expect(applyMethod({ email_candidates: [], hiring_manager_email: 'hr@acme.com', whatsapp_number: null })).toBe('email');
  });
  it('prefers email over WhatsApp', () => {
    expect(applyMethod({ email_candidates: [cand], hiring_manager_email: null, whatsapp_number: '2348031234567' })).toBe('email');
  });
  it('is whatsapp with a number and no email', () => {
    expect(applyMethod({ email_candidates: [], hiring_manager_email: null, whatsapp_number: '2348031234567' })).toBe('whatsapp');
  });
  it('is site with neither, or with missing fields', () => {
    expect(applyMethod({ email_candidates: [], hiring_manager_email: null, whatsapp_number: null })).toBe('site');
    expect(applyMethod({ email_candidates: [], hiring_manager_email: '  ', whatsapp_number: '' })).toBe('site');
    expect(applyMethod({} as never)).toBe('site');
  });
});

describe('whatsappLink', () => {
  it('builds a wa.me link with the encoded, whitespace-collapsed start of the letter', () => {
    expect(whatsappLink('2348031234567', 'Dear team,\n\nI am   keen & ready.')).toBe(
      `https://wa.me/2348031234567?text=${encodeURIComponent('Dear team, I am keen & ready.')}`,
    );
  });
  it('uses only the first 300 characters', () => {
    const url = whatsappLink('2348031234567', 'x'.repeat(500))!;
    expect(decodeURIComponent(url.split('?text=')[1]!)).toHaveLength(300);
  });
  it('allows an empty letter', () => {
    expect(whatsappLink('2348031234567', null)).toBe('https://wa.me/2348031234567?text=');
  });
  it.each([null, undefined, '', '123456', '1234567890123456', '+2348031234567', '234 803 123', '23480abc4567', '234803123456/../x'])('returns null for %j', (n) => {
    expect(whatsappLink(n as never, 'hi')).toBeNull();
  });
  it('accepts 7 and 15 digits', () => {
    expect(whatsappLink('1234567', 'hi')).not.toBeNull();
    expect(whatsappLink('123456789012345', 'hi')).not.toBeNull();
  });
});
