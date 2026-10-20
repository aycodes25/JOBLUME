/**
 * Where the Gmail callback sends the phone back to. This is the only non-web target the server accepts:
 * the app asks for it by name and the server never redirects to a URL taken from a request.
 */
export const MOBILE_GMAIL_RETURN = 'joblume://gmail-return';

/** Which screen the Gmail callback returns to: the web Settings page or the phone app. */
export type GmailReturnTarget = 'web' | 'app';
