import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { keys, useConnectGmail, useDisconnectGmail, useGmailStatus } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { connectGmail } from '@/lib/gmail-connect';
import type { GmailReturn } from '@/lib/gmail-return';

/** Everything the Settings screen needs for the Gmail card. `returned` can also come from the gmail-return route. */
export function useGmailConnection(initialReturn: GmailReturn | null) {
  const qc = useQueryClient();
  const status = useGmailStatus();
  const start = useConnectGmail();
  const disconnect = useDisconnectGmail();
  const [returned, setReturned] = useState<GmailReturn | null>(initialReturn);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialKey = initialReturn ? JSON.stringify(initialReturn) : '';

  useEffect(() => {
    if (initialReturn) setReturned(initialReturn);
  }, [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setConnecting(true);
    setError(null);
    setReturned(null);
    try {
      const result = await connectGmail({
        start: () => start.mutateAsync(),
        openAuth: (url, returnUrl) => WebBrowser.openAuthSessionAsync(url, returnUrl),
        refresh: () => qc.invalidateQueries({ queryKey: keys.gmail }),
      });
      setReturned(result);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  return {
    status: status.data,
    connecting,
    disconnecting: disconnect.isPending,
    returned,
    error: error ?? (disconnect.error ? describeApiError(disconnect.error) : null),
    onConnect: () => void connect(),
    onDisconnect: () => disconnect.mutate(),
  };
}
