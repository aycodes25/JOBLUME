import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CvUpload, type PickedDocument } from '@/components/cv/CvUpload';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, Loading } from '@/components/ui/States';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { initialStep } from '@/lib/onboarding';
import { profileToFormValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

const STEPS = ['Upload your CV', 'Tell us what you want', 'All set'] as const;

/** Three steps, as on the web: CV upload, preferences (at least one role), then on to the queue. */
export function OnboardingScreen({ pick }: { pick?: () => Promise<PickedDocument | null> }) {
  const router = useRouter();
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    if (profile.data && step === null) setStep(initialStep(profile.data));
  }, [profile.data, step]);

  if (profile.error) return <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;
  if (!profile.data || step === null) return <Loading />;

  return (
    <Screen title="Welcome to JobLume">
      <View accessibilityLabel="Progress" style={styles.steps}>
        {STEPS.map((label, i) => (
          <Text key={label} style={[styles.step, step === i + 1 && styles.current]}>{`${i + 1}. ${label}`}</Text>
        ))}
      </View>

      {step === 1 ? (
        <Section title="Upload your CV" description="We tailor a copy of this CV for each job. We never invent experience you do not have.">
          <CvUpload
            pick={pick}
            onUpload={async (file) => {
              await uploadCv.mutateAsync(file);
              setStep(2);
            }}
          />
        </Section>
      ) : null}

      {step === 2 ? (
        <Section title="What are you looking for?" description="We only prepare applications for jobs that match these roles and your location.">
          <ProfileForm
            initial={profileToFormValues(profile.data)}
            requireRoles
            submitLabel="Save and continue"
            onSubmit={async (patch) => {
              await updateProfile.mutateAsync(patch);
              setStep(3);
            }}
          />
        </Section>
      ) : null}

      {step === 3 ? (
        <Section
          title="You are ready"
          description="We are matching your profile against current jobs. The first prepared applications usually appear within a few minutes. Nothing is ever sent without your approval."
        >
          <Button label="Go to my queue" onPress={() => router.replace('/queue')} />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space(1) },
  step: { fontSize: font.small, color: colors.muted },
  current: { color: colors.text, fontWeight: '700' },
});
