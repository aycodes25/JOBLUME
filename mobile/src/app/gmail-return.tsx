import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { keys } from '@/hooks/api';

/**
 * joblume://gmail-return?status=...&reason=... lands here when the phone opens the app from the Gmail callback.
 * It refreshes the Gmail status and hands the result to Settings, which shows it.
 */
export default function GmailReturnRoute() {
  const qc = useQueryClient();
  const { status, reason } = useLocalSearchParams<{ status?: string; reason?: string }>();

  useEffect(() => {
    void qc.invalidateQueries({ queryKey: keys.gmail });
  }, [qc]);

  return <Redirect href={{ pathname: '/settings', params: { gmail: status ?? '', reason: reason ?? '' } }} />;
}
