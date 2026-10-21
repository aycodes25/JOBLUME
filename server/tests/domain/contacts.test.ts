import { describe, expect, it } from 'vitest';
import { extractContacts, MAX_INPUT_CHARS } from '../../src/domain/contacts.js';

const emails = (t: string) => extractContacts(t).emails;
const wa = (t: string) => extractContacts(t).whatsapp;

describe('extractContacts: emails', () => {
  it.each([
    ['a plain address', 'Send your CV to hr@acme.com today', ['hr@acme.com']],
    ['an uppercase address', 'Email Careers@ACME.COM now', ['careers@acme.com']],
    ['a mailto link', '<a href="mailto:jobs@acme.com">apply</a>', ['jobs@acme.com']],
    ['a full stop after the address', 'Apply to jobs@acme.com.', ['jobs@acme.com']],
    ['a comma, bracket and quote after the address', 'Write (jobs@acme.com), "hr@acme.com" or x@acme.co.uk;', ['jobs@acme.com', 'hr@acme.com', 'x@acme.co.uk']],
    ['a trailing hyphen', 'mail jobs@acme.com- thanks', ['jobs@acme.com']],
    ['name [at] company dot com', 'Apply: jane [at] acme dot com', ['jane@acme.com']],
    ['name(at)company.com', 'Apply: jane(at)acme.com', ['jane@acme.com']],
    ['name [at] company [dot] co [dot] uk', 'jane [AT] acme [DOT] co [DOT] uk', ['jane@acme.co.uk']],
    ['a plus tag and dots in the local part', 'first.last+jobs@sub.acme.io', ['first.last+jobs@sub.acme.io']],
    ['duplicates in different case', 'hr@acme.com and HR@Acme.com', ['hr@acme.com']],
  ])('finds %s', (_n, text, expected) => {
    expect(emails(text)).toEqual(expected);
  });

  it.each([
    ['noreply', 'noreply@acme.com'],
    ['no-reply', 'no-reply@acme.com'],
    ['donotreply', 'DoNotReply@acme.com'],
    ['example.com', 'jane@example.com'],
    ['a subdomain of example.org', 'jane@mail.example.org'],
    ['an image filename', 'logo@2x.png and banner@3x.jpg'],
    ['a version string', 'upgrade from 1.2@3 to 2.0@4.1'],
    ['an address without a TLD', 'reach me at a@b'],
    ['a numeric TLD', 'ip user@10.0.0.1'],
    ['a bare at sign', 'meet @ 5pm @home'],
    ['an empty local part', '@acme.com'],
    ['a double dot domain', 'jane@acme..com'],
  ])('ignores %s', (_n, text) => {
    expect(emails(text)).toEqual([]);
  });

  it('keeps first-seen order and caps the list at 5', () => {
    const text = Array.from({ length: 8 }, (_, i) => `p${i}@acme.com`).join(' ');
    expect(emails(text)).toEqual(['p0@acme.com', 'p1@acme.com', 'p2@acme.com', 'p3@acme.com', 'p4@acme.com']);
  });

  it('drops privacy/support/abuse mailboxes when a better address exists', () => {
    expect(emails('privacy@acme.com support@acme.com careers@acme.com abuse@acme.com')).toEqual(['careers@acme.com']);
  });

  it('keeps a support mailbox when nothing else exists, but never a compliance one', () => {
    expect(emails('support@acme.com, privacy@acme.com, noreply@acme.com')).toEqual(['support@acme.com']);
  });

  it.each([
    'accommodation', 'accommodations', 'eeo', 'disability', 'fraud', 'recruiting-fraud', 'privacy', 'legal', 'abuse', 'dpo', 'security', 'compliance', 'press', 'media', 'billing',
  ])('drops the %s mailbox outright, even when it is the only address', (local) => {
    expect(emails(`Contact ${local}@acme.com`)).toEqual([]);
  });

  it.each(['careers', 'jobs', 'hr', 'recruitment', 'talent', 'apply', 'hiring'])('keeps the %s mailbox', (local) => {
    expect(emails(`Write to ${local}@acme.com`)).toEqual([`${local}@acme.com`]);
  });

  it.each([
    'greenhouse.io', 'greenhouse-mail.io', 'lever.co', 'workablemail.com', 'ashbyhq.com', 'smartrecruiters.com', 'myworkdayjobs.com', 'icims.com',
    'workingnomads.com', 'remoteok.com', 'remoteok.io', 'remotive.com', 'remotive.io', 'weworkremotely.com', 'himalayas.app', 'arbeitnow.com', 'jobberman.com', 'myjobmag.com',
  ])('ignores addresses at %s and its subdomains', (domain) => {
    expect(emails(`mail jobs@${domain} or hr@eu.${domain}`)).toEqual([]);
  });

  it('does not treat a lookalike domain as a job board', () => {
    expect(emails('hr@notlever.co and hr@lever.com')).toEqual(['hr@notlever.co', 'hr@lever.com']);
  });

  it('drops an over-long local part instead of keeping its last 64 characters', () => {
    expect(emails(`${'a'.repeat(100)}@acme.com`)).toEqual([]);
    expect(emails(`${'a'.repeat(64)}@acme.com`)).toEqual([`${'a'.repeat(64)}@acme.com`]);
  });

  it('returns nothing for empty or non-string input', () => {
    expect(extractContacts('')).toEqual({ emails: [], whatsapp: [] });
    expect(extractContacts(undefined as unknown as string)).toEqual({ emails: [], whatsapp: [] });
  });
});

describe('extractContacts: WhatsApp numbers', () => {
  it.each([
    ['a wa.me link', 'Chat: https://wa.me/2348031234567 now', ['2348031234567']],
    ['a wa.me link with a plus', 'https://wa.me/+2348031234567', ['2348031234567']],
    ['an api.whatsapp.com link', 'https://api.whatsapp.com/send?phone=2348031234567&text=hi', ['2348031234567']],
    ['an api.whatsapp.com link with phone after other params', 'https://api.whatsapp.com/send?text=hi&phone=2348031234567', ['2348031234567']],
    ['an api.whatsapp.com link with an encoded plus', 'https://api.whatsapp.com/send?phone=%2B2348031234567', ['2348031234567']],
    ['a Nigerian 0803 number after the word', 'WhatsApp: 0803 123 4567', ['2348031234567']],
    ['a Nigerian number before the word', 'call 08031234567 (WhatsApp only)', ['2348031234567']],
    ['a +234 number', 'Send a WhatsApp message to +234 803 123 4567', ['2348031234567']],
    ['a 234 number with no plus', 'whatsapp 2348031234567', ['2348031234567']],
    ['a 0090 style international number', 'WhatsApp 00441234567890', ['441234567890']],
    ['a number with dashes and brackets', 'WhatsApp (0805) 123-4567', ['2348051234567']],
    ['a lowercase keyword', 'reach us on whatsapp 07031234567', ['2347031234567']],
    ['a number cut by the end of the search window', 'Send your CV via WhatsApp to our recruitment team on +2348031234567', ['2348031234567']],
    ['a number cut by the start of the search window', `0803 123 4567${' call or message us on the'.padEnd(32, '.')}WhatsApp line`,['2348031234567']],
    ['+234 (0) 803 123 4567', 'WhatsApp: +234 (0) 803 123 4567', ['2348031234567']],
    ['a plus number with a stray trunk zero', 'WhatsApp +2340 803 123 4567', ['2348031234567']],
    ['a 2340 number with no plus', 'whatsapp 23408031234567', ['2348031234567']],
  ])('finds %s', (_n, text, expected) => {
    expect(wa(text)).toEqual(expected);
  });

  it.each([
    ['a phone number with no WhatsApp mention', 'Call 08031234567 for details'],
    ['a number far from the word', `WhatsApp is great. ${'x'.repeat(80)} 08031234567`],
    ['a date near the word', 'WhatsApp group created 2026-10-21'],
    ['a short number near the word', 'WhatsApp 12345'],
    ['a wa.me business link with no number', 'https://wa.me/message/ABCDEF123'],
    ['a too long digit run', 'WhatsApp 0803123456789012345'],
    ['a landline-like number without a plus', 'WhatsApp 012345678'],
    ['a long digit run that still touches the window edge', `WhatsApp ${'1 '.repeat(60)}`],
  ])('ignores %s', (_n, text) => {
    expect(wa(text)).toEqual([]);
  });

  it('deduplicates the same number written two ways and caps the list at 3', () => {
    expect(wa('wa.me/2348031234567 WhatsApp 0803 123 4567')).toEqual(['2348031234567']);
    const many = [1, 2, 3, 4, 5].map((n) => `https://wa.me/23480312345${n}0`).join(' ');
    expect(wa(many)).toHaveLength(3);
  });

  it('returns digits only', () => {
    for (const n of wa('WhatsApp +234 (803) 123-4567 or https://wa.me/2347031234567')) expect(n).toMatch(/^\d{7,15}$/);
  });
});

describe('extractContacts: untrusted input', () => {
  const timed = (f: () => unknown) => {
    const t = Date.now();
    f();
    return Date.now() - t;
  };

  it.each([
    ['one long run of local-part characters', 'a'.repeat(MAX_INPUT_CHARS)],
    ['many at signs', '@'.repeat(MAX_INPUT_CHARS)],
    ['local parts that never reach a domain', 'a.'.repeat(MAX_INPUT_CHARS / 2) + '@'],
    ['an unterminated obfuscation', ' [at '.repeat(MAX_INPUT_CHARS / 5)],
    ['repeated dot-space runs', 'a@' + ' dot a'.repeat(MAX_INPUT_CHARS / 6)],
    ['repeated whatsapp keywords', 'whatsapp 0 '.repeat(MAX_INPUT_CHARS / 11)],
    ['an endless link query', 'api.whatsapp.com/send?' + 'a'.repeat(MAX_INPUT_CHARS)],
    ['a long digit and separator run', 'whatsapp ' + '0 '.repeat(MAX_INPUT_CHARS / 2)],
  ])('stays fast on %s', (_n, text) => {
    expect(timed(() => extractContacts(text))).toBeLessThan(1000);
  });

  it('only reads the first 100k characters', () => {
    const text = `${' '.repeat(MAX_INPUT_CHARS)} late@acme.com`;
    expect(emails(text)).toEqual([]);
    expect(emails(`early@acme.com ${' '.repeat(MAX_INPUT_CHARS)}`)).toEqual(['early@acme.com']);
  });

  it('never returns more than the caps even for hostile input', () => {
    const r = extractContacts('x@acme.com '.repeat(1000).replace(/x/g, 'u') + 'wa.me/2348031234567 '.repeat(1000));
    expect(r.emails.length).toBeLessThanOrEqual(5);
    expect(r.whatsapp.length).toBeLessThanOrEqual(3);
  });
});
