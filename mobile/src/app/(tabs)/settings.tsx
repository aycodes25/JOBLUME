import { useQueryClient } from '@tanstack/react-query';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { getSupabase } from '@/lib/supabase';

export default function SettingsTab() {
  const qc = useQueryClient();
  return (
    <SettingsScreen
      onSignOut={async () => {
        const { error } = await getSupabase().auth.signOut();
        if (error) throw error;
        qc.clear();
      }}
    />
  );
}
