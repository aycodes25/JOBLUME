import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { ErrorState, Loading } from '@/components/ui/States';
import { useApplications, useProfile } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { needsOnboarding } from '@/lib/onboarding';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

/** Bottom tabs as in the mockups. A user without a CV or roles is sent to onboarding first, like the web layout. */
export default function TabsLayout() {
  const profile = useProfile();
  const apps = useApplications();
  const pending = apps.data?.filter((a) => a.status === 'pending_review').length ?? 0;

  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;
  if (profile.data && needsOnboarding(profile.data)) return <Redirect href="/onboarding" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted }}>
      <Tabs.Screen
        name="queue"
        options={{ title: 'Queue', tabBarIcon: icon('file-tray-outline'), tabBarBadge: pending > 0 ? pending : undefined }}
      />
      <Tabs.Screen name="tracker" options={{ title: 'Tracker', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: icon('bar-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
