import { connectGmail, type GmailConnectDeps } from '@/lib/gmail-connect';

const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=s';

function deps(over: Partial<GmailConnectDeps> = {}) {
  return {
    start: jest.fn().mockResolvedValue({ url: GOOGLE }),
    openAuth: jest.fn().mockResolvedValue({ type: 'success', url: 'joblume://gmail-return?status=connected' }),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('connectGmail', () => {
  it('opens Google with the app return link and reports a connection', async () => {
    const d = deps();
    expect(await connectGmail(d)).toEqual({ kind: 'connected' });
    expect(d.openAuth).toHaveBeenCalledWith(GOOGLE, 'joblume://gmail-return');
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports the reason Google or the server gave', async () => {
    const d = deps({ openAuth: jest.fn().mockResolvedValue({ type: 'success', url: 'joblume://gmail-return?status=error&reason=denied' }) });
    expect(await connectGmail(d)).toEqual({ kind: 'error', reason: 'denied' });
  });

  it('returns null but still refreshes when the browser is closed without a redirect (Expo Go)', async () => {
    const d = deps({ openAuth: jest.fn().mockResolvedValue({ type: 'dismiss' }) });
    expect(await connectGmail(d)).toBeNull();
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['http://accounts.google.com/o/oauth2/v2/auth', 'https://evil.example/o/oauth2', 'javascript:alert(1)', 'nonsense'])(
    'never opens %s',
    async (url) => {
      const d = deps({ start: jest.fn().mockResolvedValue({ url }) });
      expect(await connectGmail(d)).toEqual({ kind: 'error', reason: 'unknown' });
      expect(d.openAuth).not.toHaveBeenCalled();
    },
  );

  it('refreshes even when the browser fails, and lets the error through', async () => {
    const d = deps({ openAuth: jest.fn().mockRejectedValue(new Error('no browser')) });
    await expect(connectGmail(d)).rejects.toThrow('no browser');
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });
});
