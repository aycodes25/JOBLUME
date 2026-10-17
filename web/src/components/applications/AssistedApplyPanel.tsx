'use client';

import { safeHttpUrl, type ApplicationDetail } from '@joblume/shared';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AssistedApplyPanelProps {
  app: ApplicationDetail;
  onMarkApplied(): void;
  pending?: boolean;
}

export function AssistedApplyPanel({ app, onMarkApplied, pending = false }: AssistedApplyPanelProps) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const jobUrl = safeHttpUrl(app.job?.url);
  const pdfUrl = safeHttpUrl(app.cv_pdf_url);
  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }));

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(app.cover_letter_text ?? '');
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section aria-label="Apply" className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <h3 className="font-semibold">Apply on the employer's site</h3>
      <p className="text-sm text-muted-foreground">Nothing is sent for you. Open the job, upload your tailored CV, paste the cover letter, then mark it as applied here.</p>
      <ol className="space-y-3 text-sm">
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">1.</span>
          {jobUrl ? (
            <a href={jobUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Open job link
            </a>
          ) : (
            <span className="text-muted-foreground">This job has no valid link.</span>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">2.</span>
          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Download CV PDF
            </a>
          ) : (
            <span className="text-muted-foreground">The tailored CV PDF is not available yet.</span>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">3.</span>
          <Button variant="outline" size="sm" onClick={() => void copyLetter()}>
            Copy cover letter
          </Button>
          {copy === 'copied' && <span role="status" className="text-emerald-400">Copied.</span>}
          {copy === 'failed' && <span role="alert" className="text-destructive">Could not copy. Select the text in the editor below and copy it yourself.</span>}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">4.</span>
          <Button size="sm" onClick={onMarkApplied} disabled={pending}>
            Mark as applied
          </Button>
        </li>
      </ol>
    </section>
  );
}
