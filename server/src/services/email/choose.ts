import type { EmailCandidate } from '@joblume/shared';

export function nextCandidateChanges(app: {
  email_candidates: EmailCandidate[];
  hiring_manager_email: string | null;
}): { exhausted: true } | { exhausted: false; changes: Record<string, unknown> } {
  const current = app.hiring_manager_email?.toLowerCase();
  const index = current ? app.email_candidates.findIndex((c) => c.email.toLowerCase() === current) : -1;
  const next = app.email_candidates[index + 1];
  if (!next) return { exhausted: true };
  return {
    exhausted: false,
    changes: { hiring_manager_email: next.email, email_confidence: next.confidence, email_source: next.source },
  };
}

export function manualEmailChanges(email: string) {
  return { hiring_manager_email: email, email_confidence: null, email_source: 'manual' as const };
}
