import { useQueryClient } from '@tanstack/react-query';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { getSupabase } from '@/lib/supabase';

export default function SettingsTab() {
  const qc = useQueryClient();
  return (
    <SettingsScreen
      onSignOut={async () => {
        const auth = getSupabase().auth;
        const { error } = await auth.signOut();
        if (error) {
          // Offline or the server refused: still end this device's session so the user lands on /login.
          const local = await auth.signOut({ scope: 'local' });
          if (local.error) throw local.error;
        }
        qc.clear();
      }}
    />
  );
}
