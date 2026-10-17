'use client';

import type { ApplicationStatus } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { SafeLink } from '@/components/common/SafeLink';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useApplication, useGmailStatus, useNextEmail, useSendApplication, useSetStatus, useUpdateApplicationText } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { buildTextPatch } from '@/lib/applications';
import { COLUMN_LABELS, sourceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AssistedApplyPanel } from './AssistedApplyPanel';
import { EmailSection } from './EmailSection';
import { ScoreRing } from './ScoreRing';

const APPLIED_FAMILY: ApplicationStatus[] = ['applied', 'interviewing', 'rejected', 'offer'];
const MOVE_OPTIONS = ['pending_review', 'applied', 'interviewing', 'rejected', 'offer'] as const;

export function ApplicationDetail({ id, onClose }: { id: string | null; onClose(): void }) {
  const detail = useApplication(id);
  const updateText = useUpdateApplicationText();
  const setStatus = useSetStatus();
  const gmail = useGmailStatus();
  const sendEmail = useSendApplication();
  const nextEmail = useNextEmail();
  const [notice, setNotice] = useState<string | null>(null);
  const data = detail.data;

  const [cv, setCv] = useState('');
  const [letter, setLetter] = useState('');

  useEffect(() => {
    setCv(data?.tailored_cv_text ?? '');
    setLetter(data?.cover_letter_text ?? '');
    updateText.reset();
    setStatus.reset();
    sendEmail.reset();
    nextEmail.reset();
    setNotice(null);
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = data ? buildTextPatch({ cv: data.tailored_cv_text, letter: data.cover_letter_text }, { cv, letter }) : null;
  const lockedReason = text?.dirty ? 'You have unsaved changes. Save them first so the copied letter and the PDF match.' : undefined;
  const emailError = sendEmail.error ?? nextEmail.error;
  const mutationError = updateText.error ?? setStatus.error;
  const move = (status: ApplicationStatus) => {
    if (id) setStatus.mutate({ id, status });
  };
  const showPanel = data !== undefined && data.status === 'approved';

  return (
    <Dialog open={id !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{data?.job?.title ?? 'Application'}</DialogTitle>
          <DialogDescription>
            {data?.job ? `${data.job.company}${data.job.location ? ` · ${data.job.location}` : ''}` : 'Loading application'}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && <PageSkeleton />}
        {detail.error && <ErrorState message={describeApiError(detail.error)} onRetry={() => void detail.refetch()} />}

        {data && text && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <ScoreRing score={data.match_score} />
              {data.job && <Badge variant="outline">{sourceLabel(data.job.source)}</Badge>}
              <Badge variant="secondary">{data.status === 'approved' ? 'Ready to apply' : data.status.replace('_', ' ')}</Badge>
              <SafeLink href={data.job?.url} className="text-sm text-primary hover:underline">
                View posting
              </SafeLink>
              <SafeLink href={data.cv_pdf_url} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                Download CV PDF
              </SafeLink>
            </div>

            {data.missing_keywords.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Keywords this CV does not support</p>
                <div className="flex flex-wrap gap-1">
                  {data.missing_keywords.map((k) => (
                    <Badge key={k} variant="warning">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {data.status === 'pending_review' && (
                <>
                  <Button disabled={text.dirty} onClick={() => move('approved')}>Approve &amp; Apply</Button>
                  {text.dirty && <span className="text-xs text-muted-foreground">Save your changes before approving.</span>}
                  <Button variant="outline" onClick={() => { move('skipped'); onClose(); }}>Skip</Button>
                </>
              )}
              {data.status === 'approved' && (
                <>
                  <Button variant="outline" onClick={() => { move('skipped'); onClose(); }}>Skip</Button>
                  <Button variant="ghost" onClick={() => move('pending_review')}>Back to pending</Button>
                </>
              )}
              {data.status === 'skipped' && <Button onClick={() => move('pending_review')}>Restore</Button>}
              {APPLIED_FAMILY.includes(data.status) && (
                <label className="flex items-center gap-2 text-sm">
                  Move to
                  <select
                    value={data.status}
                    onChange={(e) => move(e.target.value as ApplicationStatus)}
                    className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
                  >
                    {MOVE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {COLUMN_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {showPanel && (
              <>
                <EmailSection
                  app={data}
                  gmail={gmail.data}
                  lockedReason={lockedReason}
                  pending={sendEmail.isPending || nextEmail.isPending}
                  error={emailError ? describeApiError(emailError) : null}
                  notice={notice}
                  onSend={(body) => sendEmail.mutate({ id: data.id, body }, { onSuccess: () => onClose() })}
                  onNextEmail={() =>
                    nextEmail.mutate(data.id, {
                      onSuccess: (result) => setNotice(result.exhausted ? 'No more suggested addresses. Paste one yourself.' : null),
                    })
                  }
                />
                <AssistedApplyPanel
                  app={data}
                  pending={setStatus.isPending}
                  lockedReason={lockedReason}
                  onMarkApplied={() => setStatus.mutate({ id: data.id, status: 'applied' }, { onSuccess: () => onClose() })}
                />
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="cv-text">Tailored CV</Label>
              <Textarea id="cv-text" value={cv} onChange={(e) => setCv(e.target.value)} rows={14} aria-invalid={text.errors.cv ? true : undefined} />
              {text.errors.cv && <p className="text-sm text-destructive">{text.errors.cv}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="letter-text">Cover letter</Label>
              <Textarea id="letter-text" value={letter} onChange={(e) => setLetter(e.target.value)} rows={10} aria-invalid={text.errors.letter ? true : undefined} />
              {text.errors.letter && <p className="text-sm text-destructive">{text.errors.letter}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!text.dirty || Object.keys(text.errors).length > 0 || updateText.isPending}
                onClick={() => updateText.mutate({ id: data.id, patch: text.patch })}
              >
                {updateText.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <p className="text-xs text-muted-foreground">Saving a CV change rebuilds the PDF.</p>
              {updateText.isSuccess && !text.dirty && <span role="status" className="text-sm text-emerald-600">Saved.</span>}
            </div>

            {mutationError && <p role="alert" className="text-sm text-destructive">{describeApiError(mutationError)}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
