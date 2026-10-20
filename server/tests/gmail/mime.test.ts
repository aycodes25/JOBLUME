import { describe, expect, it } from 'vitest';
import { buildRawMessage, cvAttachmentName, safeFilename, sanitizeHeader } from '../../src/services/gmail/mime.js';

const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
const headersOf = (message: string) => message.split(/\r?\n\r?\n/)[0]!.split(/\r?\n/);
const base = { from: 'me@gmail.com', to: 'hr@acme.com', subject: 'Application for Data Analyst', text: 'Dear team,\nPlease find my CV attached.' };
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7

describe('buildRawMessage', () => {
  it('builds a multipart message with the headers, the body and the PDF attachment', async () => {
    const message = decode(await buildRawMessage({ ...base, attachment: { filename: 'CV - Data Analyst.pdf', content: pdf, contentType: 'application/pdf' } }));
    const headers = headersOf(message);
    expect(headers.some((h) => /^From: .*me@gmail\.com/i.test(h))).toBe(true);
    expect(headers.some((h) => /^To: .*hr@acme\.com/i.test(h))).toBe(true);
    expect(headers.some((h) => h === 'Subject: Application for Data Analyst')).toBe(true);
    expect(message).toMatch(/multipart\/mixed/i);
    expect(message).toMatch(/Content-Type: text\/plain/i);
    expect(message).toContain('Please find my CV attached.');
    expect(message).toMatch(/Content-Type: application\/pdf/i);
    expect(message).toContain('CV - Data Analyst.pdf');
    expect(message).toContain(Buffer.from(pdf).toString('base64'));
  });

  it('builds a plain text message when there is no attachment', async () => {
    const message = decode(await buildRawMessage(base));
    expect(message).not.toMatch(/multipart\/mixed/i);
    expect(message).toContain('Dear team,');
  });

  it('does not let a line break in the subject or recipient add a header', async () => {
    const message = decode(await buildRawMessage({
      ...base,
      subject: 'Hi\r\nBcc: evil@example.com',
      to: 'hr@acme.com\r\nBcc: evil2@example.com',
    }));
    const headers = headersOf(message);
    expect(headers.filter((h) => /^bcc:/i.test(h))).toEqual([]);
    expect(headers.filter((h) => /^subject:/i.test(h))).toHaveLength(1);
  });

  it('includes the message id and threading headers when given', async () => {
    const message = decode(await buildRawMessage({
      ...base,
      messageId: '<abc123@joblume.app>',
      inReplyTo: '<orig@joblume.app>',
      references: '<orig@joblume.app>',
    }));
    const headers = headersOf(message);
    expect(headers).toContain('Message-ID: <abc123@joblume.app>');
    expect(headers).toContain('In-Reply-To: <orig@joblume.app>');
    expect(headers).toContain('References: <orig@joblume.app>');
  });

  it('encodes a non-ASCII subject safely', async () => {
    const message = decode(await buildRawMessage({ ...base, subject: 'Application for Développeur' }));
    expect(headersOf(message).find((h) => /^subject:/i.test(h))).toMatch(/=\?UTF-8\?/i);
  });
});

describe('sanitizeHeader', () => {
  it('replaces line breaks and control characters with spaces and trims', () => {
    expect(sanitizeHeader('  a\r\nb\tc\u0000d  ')).toBe('a b c d');
  });
});

describe('safeFilename and cvAttachmentName', () => {
  it('removes path separators, quotes and other unsafe characters', () => {
    expect(safeFilename('a/b\\c:"d"*e?')).toBe('a b c d e');
    expect(safeFilename('   ')).toBe('CV');
  });

  it('limits the length to 100 characters', () => {
    expect(safeFilename('x'.repeat(300)).length).toBe(100);
  });

  it('names the CV after the role and always ends with .pdf', () => {
    expect(cvAttachmentName('Data Analyst')).toBe('CV - Data Analyst.pdf');
    expect(cvAttachmentName('Lead/Head: "Ops"')).toBe('CV - Lead Head Ops.pdf');
    expect(cvAttachmentName('x'.repeat(300)).endsWith('.pdf')).toBe(true);
    expect(cvAttachmentName('x'.repeat(300)).length).toBeLessThanOrEqual(104);
  });
});
