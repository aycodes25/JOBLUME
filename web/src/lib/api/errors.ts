import { ApiRequestError } from './client';

/** Plain-language message for an error from the API client. */
export function describeApiError(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return 'Something went wrong. Please try again.';
  switch (err.code) {
    case 'network_error':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'unsupported_file_type':
      return 'That file type is not supported. Upload a PDF or DOCX.';
    case 'cv_text_too_short':
      return 'We could not read enough text from that file. Scanned images are not supported; upload a PDF or DOCX with selectable text.';
    case 'unreadable_file':
      return 'We could not open that file. Re-export it as a PDF or DOCX and try again.';
    case 'file_required':
      return 'Choose a file to upload.';
    case 'limit_file_size':
      return 'That file is larger than 5 MB.';
    case 'payload_too_large':
      return 'That request is too large. Shorten the text and try again.';
    case 'invalid_json':
      return 'The request could not be read. Reload the page and try again.';
    case 'profile_not_found':
      return 'Your profile could not be found. Sign out and back in, then try again.';
    case 'bad_response':
      return 'The server sent an unexpected response. Please try again.';
    case 'rate_limited':
      return 'You are doing that too often. Try again later.';
    case 'application_not_found':
      return 'That application no longer exists.';
    case 'invalid_request':
      return 'Some fields are invalid. Check the form and try again.';
    case 'gmail_not_connected':
      return 'Connect Gmail in Settings first.';
    case 'gmail_not_configured':
      return 'Gmail is not set up on this server yet. Follow the Gmail setup guide, then restart the server.';
    case 'gmail_reauth_required':
      return 'Google needs you to reconnect Gmail. Open Settings and connect it again.';
    case 'guess_not_confirmed':
      return 'Tick the box to confirm you want to send to a guessed address.';
    case 'daily_cap_reached':
      return 'You have reached today\'s limit. Try again tomorrow, or change the limit in Settings (maximum 20).';
    case 'already_sent':
      return 'This was already sent or is no longer pending.';
    case 'no_recipient':
      return 'Add a contact email first.';
    case 'send_failed':
      return 'Gmail could not send that email. Please try again.';
    case 'not_applicable':
      return 'That is no longer applicable because the application has moved on.';
    case 'empty_message':
      return 'The cover letter is empty. Write it before sending.';
    case 'cv_not_ready':
      return 'The tailored CV is not ready yet. Try again in a moment.';
    case 'follow_up_not_found':
      return 'That follow-up no longer exists.';
    case 'auto_disabled':
      return 'Automatic follow-ups are turned off. Turn them on in Settings first.';
    case 'not_auto_eligible':
      return 'Automatic sending no longer applies to this application. Review it and send it yourself.';
    case 'unsupported_job_link':
      return 'That is not a LinkedIn or Indeed job link. Open the job itself and copy the address from your browser.';
  }
  if (err.status === 413) return 'That request is too large.';
  if (err.status === 429) return 'You are doing that too often. Try again later.';
  if (err.status >= 500) return 'The server had a problem. Please try again in a moment.';
  return 'The request could not be completed.';
}
