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
  }
  if (err.status === 413) return 'That request is too large.';
  if (err.status === 429) return 'You are doing that too often. Try again later.';
  if (err.status >= 500) return 'The server had a problem. Please try again in a moment.';
  return 'The request could not be completed.';
}
