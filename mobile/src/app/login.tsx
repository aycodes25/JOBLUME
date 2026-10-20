import { StyleSheet, Text } from 'react-native';
import { AuthForm } from '@/components/auth/AuthForm';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { getSupabase } from '@/lib/supabase';
import { colors, font } from '@/theme';

/** After a successful sign-in the session listener flips to signed in and the auth gate moves on to /queue. */
export default function LoginScreen() {
  async function onSignIn(email: string, password: string) {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function onSignUp(email: string, password: string) {
    const { data, error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.brand}>
        JobLume
      </Text>
      <Text style={styles.tagline}>AI-tailored applications that you approve before anything is sent.</Text>
      <Card>
        <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 32, fontWeight: '700', color: colors.primary, marginTop: 48 },
  tagline: { fontSize: font.body, color: colors.muted },
});
