import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { CvUpload } from '@/components/cv/CvUpload';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, Loading, Message } from '@/components/ui/States';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { displayCvName } from '@/lib/cv-name';
import { parseGmailReturn } from '@/lib/gmail-return';
import { profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';
import { useSession } from '@/lib/session';
import { colors, font } from '@/theme';
import { GmailCard } from './GmailCard';
import { useGmailConnection } from './useGmailConnection';

export interface SettingsScreenProps {
  /** Signs out of Supabase; the auth gate then shows /login. */
  onSignOut(): Promise<void>;
}

/** Settings tab: CV, Gmail, job preferences, apply mode and limits, and sign out. */
export function SettingsScreen({ onSignOut }: SettingsScreenProps) {
  const { email } = useSession();
  const params = useLocalSearchParams<{ gmail?: string; reason?: string }>();
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();
  const gmail = useGmailConnection(parseGmailReturn({ status: params.gmail, reason: params.reason }));
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (profile.isLoading) return <Loading />;
  if (!profile.data) return <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;
  const data = profile.data;

  async function signOut() {
    setSignOutError(null);
    try {
      await onSignOut();
    } catch {
      setSignOutError('Could not sign out. Please try again.');
    }
  }

  return (
    <Screen title="Settings" subtitle="Your CV, Gmail connection, job preferences and how applications are handled.">
      {profile.error ? <InlineError message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} /> : null}
      <Section title="Your CV" description="Replacing it finds matches for your latest CV. Applications already prepared keep the CV they were tailored from.">
        <CvUpload
          currentName={displayCvName(data)}
          onUpload={async (file) => {
            await uploadCv.mutateAsync(file);
          }}
        />
      </Section>

      <GmailCard {...gmail} />

      <Section title="Job preferences" description="Roles, location, skills and salary range.">
        <ProfileForm
          initial={profileToFormValues(data)}
          submitLabel="Save preferences"
          onSubmit={async (patch) => {
            await updateProfile.mutateAsync(patch);
          }}
        />
      </Section>

      <Section title="Applying" description="How applications are handled and how often.">
        <SettingsForm
          initial={profileToSettingsValues(data)}
          onSubmit={async (patch) => {
            await updateProfile.mutateAsync(patch);
          }}
        />
      </Section>

      <Section title="Account">
        {email ? <Text style={styles.text}>{`Signed in as ${email}`}</Text> : null}
        <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
        {signOutError ? <Message kind="error" text={signOutError} /> : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: font.body, color: colors.text },
});
