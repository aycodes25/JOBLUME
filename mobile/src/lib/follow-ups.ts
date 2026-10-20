export function buildFollowUpPatch(
  original: { subject: string; body: string },
  current: { subject: string; body: string },
): {
  patch: { subject?: string; body?: string };
  errors: { subject?: string; body?: string };
  dirty: boolean;
} {
  const patch: { subject?: string; body?: string } = {};
  const errors: { subject?: string; body?: string } = {};

  if (current.subject !== original.subject) {
    const subject = current.subject.trim();
    patch.subject = subject;
    if (subject.length < 3) errors.subject = 'The subject must be at least 3 characters.';
    else if (subject.length > 200) errors.subject = 'The subject is too long.';
  }
  if (current.body !== original.body) {
    const body = current.body.trim();
    patch.body = body;
    if (body.length < 40) errors.body = 'The message must be at least 40 characters.';
    else if (body.length > 2000) errors.body = 'The message is too long.';
  }
  return { patch, errors, dirty: Object.keys(patch).length > 0 };
}
