export class GmailSendError extends Error {
  constructor(public readonly kind: 'unauthorized' | 'rejected' | 'rate_limited' | 'failed', message?: string) {
    super(message ?? kind);
    this.name = 'GmailSendError';
  }
}

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded']);

export async function sendGmailMessage(
  args: { accessToken: string; raw: string; threadId?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; threadId: string }> {
  let res: Response;
  try {
    res = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${args.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: args.raw, ...(args.threadId ? { threadId: args.threadId } : {}) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new GmailSendError('failed', 'Could not reach Gmail');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { errors?: Array<{ reason?: string }> } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? '';
    if (res.status === 401) throw new GmailSendError('unauthorized');
    if (res.status === 400) throw new GmailSendError('rejected');
    if (res.status === 429 || (res.status === 403 && RATE_LIMIT_REASONS.has(reason))) throw new GmailSendError('rate_limited');
    if (res.status === 403) throw new GmailSendError('unauthorized');
    throw new GmailSendError('failed');
  }

  const data = (await res.json().catch(() => null)) as { id?: unknown; threadId?: unknown } | null;
  if (typeof data?.id !== 'string' || typeof data.threadId !== 'string') throw new GmailSendError('failed', 'Gmail sent no message id');
  return { id: data.id, threadId: data.threadId };
}
