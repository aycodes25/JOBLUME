'use client';

import { canonicalJobUrl, type AddJobLinkResult, type JobFetch } from '@joblume/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRelative } from '@/lib/format';
import { addResultMessage, fetchSourceLabel, fetchStatusText, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';

export interface AddJobLinkProps {
  fetches: JobFetch[];
  pending: boolean;
  error: string | null;
  result: AddJobLinkResult | null;
  onAdd(url: string): void;
}

export function AddJobLink({ fetches, pending, error, result, onAdd }: AddJobLinkProps) {
  const [url, setUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (result) setUrl('');
  }, [result]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const link = canonicalJobUrl(url);
    if (!link) {
      setLocalError(INVALID_LINK_MESSAGE);
      return;
    }
    setLocalError(null);
    onAdd(link.url);
  };

  const shownError = localError ?? error;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <form onSubmit={submit} noValidate className="space-y-2">
          <Label htmlFor="job-link">Add a job link</Label>
          <p className="text-sm text-muted-foreground">
            Paste a LinkedIn or Indeed job link. We read that one page and prepare an application for you to review. You apply on the site yourself.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="job-link"
              type="url"
              inputMode="url"
              maxLength={2048}
              placeholder="https://www.linkedin.com/jobs/view/…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setLocalError(null);
              }}
              aria-invalid={shownError ? true : undefined}
            />
            <Button type="submit" disabled={pending || url.trim() === ''}>
              {pending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
        {shownError && <p role="alert" className="text-sm text-destructive">{shownError}</p>}
        {!shownError && result && <p role="status" className="text-sm text-muted-foreground">{addResultMessage(result)}</p>}
        {fetches.length > 0 && (
          <ul aria-label="Recent job links" className="divide-y divide-border/70 text-sm">
            {fetches.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{fetchSourceLabel(f.url)}</span> <span className="text-muted-foreground">{f.url}</span>
                </span>
                <span className={f.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                  {fetchStatusText(f)} · {formatRelative(f.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
