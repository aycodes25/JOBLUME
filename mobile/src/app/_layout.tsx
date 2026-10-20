import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '@/components/AppProviders';
import { AuthGate } from '@/components/auth/AuthGate';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <AuthGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="application/[id]" options={{ headerShown: true, title: 'Application', headerTintColor: colors.primary }} />
          </Stack>
        </AuthGate>
      </AppProviders>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
