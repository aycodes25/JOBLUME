import { useLocalSearchParams } from 'expo-router';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';

export default function ApplicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ApplicationDetailScreen id={String(id)} />;
}
