'use client';

import type { FollowUpWithJob } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatShortDate } from '@/lib/format';
import { buildFollowUpPatch } from '@/lib/follow-ups';

export interface FollowUpCardProps {
  followUp: FollowUpWithJob;
  pending: boolean;
  error?: string | null;
  onSave(patch: { subject?: string; body?: string }): void;
  onSend(): void;
  onDismiss(): void;
}

export function FollowUpCard({ followUp, pending, error, onSave, onSend, onDismiss }: FollowUpCardProps) {
  const [subject, setSubject] = useState(followUp.subject);
  const [body, setBody] = useState(followUp.body);

  useEffect(() => {
    setSubject(followUp.subject);
    setBody(followUp.body);
  }, [followUp.id, followUp.subject, followUp.body]);

  const edit = buildFollowUpPatch({ subject: followUp.subject, body: followUp.body }, { subject, body });
  const hasErrors = Object.keys(edit.errors).length > 0;
  const subjectId = `fu-subject-${followUp.id}`;
  const bodyId = `fu-body-${followUp.id}`;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="font-semibold">{followUp.job ? `${followUp.job.title} at ${followUp.job.company}` : 'Application'}</p>
          <p className="text-xs text-muted-foreground">Draft created {formatShortDate(followUp.created_at)}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={subjectId}>Subject</Label>
          <Input id={subjectId} value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={edit.errors.subject ? true : undefined} />
          {edit.errors.subject && <p className="text-sm text-destructive">{edit.errors.subject}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={bodyId}>Message</Label>
          <Textarea id={bodyId} rows={8} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={edit.errors.body ? true : undefined} />
          {edit.errors.body && <p className="text-sm text-destructive">{edit.errors.body}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={!edit.dirty || hasErrors || pending} onClick={() => onSave(edit.patch)}>
            Save changes
          </Button>
          <Button disabled={edit.dirty || pending} onClick={onSend}>
            Send follow-up
          </Button>
          <Button variant="ghost" disabled={pending} onClick={onDismiss}>
            Dismiss
          </Button>
          {edit.dirty && <span className="text-xs text-muted-foreground">Save your changes first.</span>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
