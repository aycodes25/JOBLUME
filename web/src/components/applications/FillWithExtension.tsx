'use client';

import type { ApplicationDetail, AutofillPayload } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { describeApiError } from '@/lib/api/errors';
import { createExtensionBridge, type ExtensionBridge, type FillResult } from '@/lib/extension-bridge';

export interface FillWithExtensionProps {
  app: Pick<ApplicationDetail, 'id' | 'job'>;
  /** Fetches the autofill payload for an application (GET /applications/:id/autofill). */
  loadPayload(id: string): Promise<AutofillPayload>;
  /** Injected in tests; the real window bridge by default. */
  bridge?: ExtensionBridge;
}

type Install = 'checking' | 'installed' | 'missing';
type Progress =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'sent' }
  | { kind: 'filled'; count: number }
  | { kind: 'error'; message: string };

const REFUSALS: Record<Exclude<FillResult, { ok: true }>['error'], string> = {
  invalid_payload: 'The extension refused the data. A link may not start with https://. Use "Open job link" below instead.',
  not_allowed: 'The extension does not trust this site yet. Rebuild it with this address, as described in the setup guide.',
  tab_failed: 'The extension could not open a new tab. Use "Open job link" below instead.',
  no_reply: 'The extension did not answer. Reload this page and try again.',
  unknown: 'The extension did not accept the data. Reload this page and try again.',
};

export function FillWithExtension({ app, loadPayload, bridge }: FillWithExtensionProps) {
  const [api] = useState<ExtensionBridge>(() => bridge ?? createExtensionBridge());
  const [install, setInstall] = useState<Install>('checking');
  const [progress, setProgress] = useState<Progress>({ kind: 'idle' });

  useEffect(() => {
    let live = true;
    void api.ping().then((ok) => {
      if (live) setInstall(ok ? 'installed' : 'missing');
    });
    const stop = api.onFilled((count) => {
      if (live) setProgress({ kind: 'filled', count });
    });
    return () => {
      live = false;
      stop();
    };
  }, [api]);

  async function start() {
    setProgress({ kind: 'working' });
    try {
      const payload = await loadPayload(app.id);
      const result = await api.fill(payload, { title: app.job?.title ?? '', company: app.job?.company ?? '' });
      setProgress(result.ok ? { kind: 'sent' } : { kind: 'error', message: REFUSALS[result.error] });
    } catch (err) {
      setProgress({ kind: 'error', message: describeApiError(err) });
    }
  }

  if (install === 'checking') return null;

  if (install === 'missing') {
    return (
      <p className="text-sm text-muted-foreground">
        Want the form filled for you?{' '}
        <a href="/extension-setup.html" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
          Install the extension
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={() => void start()} disabled={progress.kind === 'working'}>
        {progress.kind === 'working' ? 'Preparing…' : 'Fill the form with the JobLume extension'}
      </Button>
      <p className="text-xs text-muted-foreground">Opens the job in a new tab and fills the standard fields. It never submits. You review every answer.</p>
      {progress.kind === 'sent' && (
        <p role="status" className="text-sm text-emerald-600">
          Opened the job in a new tab. When its form appears, the extension fills it.
        </p>
      )}
      {progress.kind === 'filled' && (
        <p role="status" className="text-sm text-emerald-600">
          JobLume filled {progress.count} {progress.count === 1 ? 'field' : 'fields'}. Review every answer, then submit yourself. Come back here and press Mark as applied when you have.
        </p>
      )}
      {progress.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {progress.message}
        </p>
      )}
    </div>
  );
}
