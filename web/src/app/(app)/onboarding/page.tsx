'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CvUpload } from '@/components/cv/CvUpload';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { initialStep } from '@/lib/onboarding';
import { profileToFormValues } from '@/lib/profile-form';

const STEPS = ['Upload your CV', 'Tell us what you want', 'All set'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    if (profile.data && step === null) setStep(initialStep(profile.data));
  }, [profile.data, step]);

  if (!profile.data || step === null) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? 'step' : undefined}
            className={`flex items-center gap-2 ${step === i + 1 ? 'font-semibold text-foreground' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                step === i + 1 ? 'border-primary bg-white text-primary' : step > i + 1 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white'
              }`}
            >
              {i + 1}
            </span>
            <span className="sr-only">{i + 1}. </span>
            {label}
            {i < STEPS.length - 1 && <span aria-hidden="true" className="ml-1 hidden h-px w-8 bg-border sm:block" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload your CV</CardTitle>
            <CardDescription>We tailor a copy of this CV for each job. We never invent experience you do not have.</CardDescription>
          </CardHeader>
          <CardContent>
            <CvUpload
              onUpload={async (file) => {
                await uploadCv.mutateAsync(file);
                setStep(2);
              }}
            />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>What are you looking for?</CardTitle>
            <CardDescription>We only prepare applications for jobs that match these roles and your location.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initial={profileToFormValues(profile.data)}
              requireRoles
              submitLabel="Save and continue"
              onSubmit={async (patch) => {
                await updateProfile.mutateAsync(patch);
                setStep(3);
              }}
            />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>You are ready</CardTitle>
            <CardDescription>
              We are matching your profile against current jobs. The first prepared applications usually appear within a few minutes. Nothing is ever sent without your approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/queue')}>Go to my queue</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
