'use client';

import { useEffect, useState } from 'react';
import { CvUpload } from '@/components/cv/CvUpload';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { ContactForm } from '@/components/profile/ContactForm';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { GmailCard } from '@/components/settings/GmailCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConnectGmail, useDisconnectGmail, useGmailStatus, useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { parseGmailReturn, type GmailReturn } from '@/lib/gmail-return';
import { displayCvName } from '@/lib/cv-name';
import { profileToContactValues, profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';

export default function SettingsPage() {
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();

  const gmail = useGmailStatus();
  const connect = useConnectGmail();
  const disconnect = useDisconnectGmail();
  const [returned, setReturned] = useState<GmailReturn | null>(null);

  useEffect(() => {
    const result = parseGmailReturn(window.location.search);
    if (result) {
      setReturned(result);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (!profile.data) return <PageSkeleton />;
  const data = profile.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Your CV, Gmail connection, job preferences and how applications are handled.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your CV</CardTitle>
          <CardDescription>Replacing it finds matches for your latest CV. Applications already prepared keep the CV they were tailored from.</CardDescription>
        </CardHeader>
        <CardContent>
          <CvUpload currentName={displayCvName(data)} onUpload={async (file) => { await uploadCv.mutateAsync(file); }} />
        </CardContent>
      </Card>

      <GmailCard
        status={gmail.data}
        connecting={connect.isPending}
        disconnecting={disconnect.isPending}
        returned={returned}
        error={connect.error || disconnect.error ? describeApiError(connect.error ?? disconnect.error) : null}
        onConnect={() => connect.mutate()}
        onDisconnect={() => disconnect.mutate()}
      />

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
          <CardTitle>Contact details for application forms</CardTitle>
          <CardDescription>Used by the JobLume browser extension to fill the standard fields of employer forms. Nothing is submitted for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm
            initial={profileToContactValues(data)}
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
