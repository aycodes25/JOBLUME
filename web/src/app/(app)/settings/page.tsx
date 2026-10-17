'use client';

import { CvUpload } from '@/components/cv/CvUpload';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';

const fileName = (path: string | null) => (path ? (path.split('/').pop() ?? path) : null);

export default function SettingsPage() {
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();

  if (!profile.data) return <PageSkeleton />;
  const data = profile.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your CV</CardTitle>
          <CardDescription>Replacing it finds matches for your latest CV. Applications already prepared keep the CV they were tailored from.</CardDescription>
        </CardHeader>
        <CardContent>
          <CvUpload currentName={fileName(data.base_cv_url)} onUpload={async (file) => { await uploadCv.mutateAsync(file); }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job preferences</CardTitle>
          <CardDescription>Roles, location, skills and salary range.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={profileToFormValues(data)}
            submitLabel="Save preferences"
            onSubmit={async (patch) => { await updateProfile.mutateAsync(patch); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applying</CardTitle>
          <CardDescription>How applications are handled and how often.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={profileToSettingsValues(data)}
            onSubmit={async (patch) => { await updateProfile.mutateAsync(patch); }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
