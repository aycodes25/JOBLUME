import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';
import { useApplications } from '@/hooks/api';
import { splitQueue } from '@/lib/applications';

export default function ApplicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appId = String(id);
  const apps = useApplications();
  // The queue segment (same tab, same order) this application is in, so "open next job" follows it.
  const queue = useMemo(() => Object.values(splitQueue(apps.data ?? [])).find((list) => list.some((a) => a.id === appId)), [apps.data, appId]);
  return <ApplicationDetailScreen id={appId} queue={queue} />;
}
