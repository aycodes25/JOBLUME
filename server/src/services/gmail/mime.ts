// nodemailer is CommonJS without an exports map: import the file explicitly so Node ESM resolves it.
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachment?: { filename: string; content: Uint8Array; contentType: string };
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

/** Line breaks and control characters can never reach a header. */
export const sanitizeHeader = (v: string): string => v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim();

export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'CV').slice(0, 100);
}

export const cvAttachmentName = (role: string): string => `${safeFilename(`CV - ${role}`)}.pdf`;

/** Builds the RFC 822 message and returns it base64url encoded, as the Gmail API expects. */
export function buildRawMessage(email: OutgoingEmail): Promise<string> {
  const composer = new MailComposer({
    from: sanitizeHeader(email.from),
    to: sanitizeHeader(email.to),
    subject: sanitizeHeader(email.subject),
    text: email.text,
    messageId: email.messageId ? sanitizeHeader(email.messageId) : undefined,
    inReplyTo: email.inReplyTo ? sanitizeHeader(email.inReplyTo) : undefined,
    references: email.references ? sanitizeHeader(email.references) : undefined,
    attachments: email.attachment
      ? [{ filename: safeFilename(email.attachment.filename), content: Buffer.from(email.attachment.content), contentType: email.attachment.contentType }]
      : [],
  });
  return new Promise((resolve, reject) => {
    composer.compile().build((err, message) => (err ? reject(err) : resolve(message.toString('base64url'))));
  });
}
