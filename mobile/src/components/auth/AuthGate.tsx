import { useRouter, useSegments } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Loading } from '@/components/ui/States';
import { decideAuthRedirect } from '@/lib/auth-redirect';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/**
 * Keeps signed-out users on /login and signed-in users off it. The navigator (children) always stays mounted,
 * because Expo Router can only navigate once the root layout has rendered it; a loading cover hides it meanwhile.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const target = decideAuthRedirect(segments[0], status);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  const covered = status === 'loading' || target !== null;
  return (
    <View style={styles.fill}>
      {children}
      {covered ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          <Loading />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { backgroundColor: colors.background },
});
