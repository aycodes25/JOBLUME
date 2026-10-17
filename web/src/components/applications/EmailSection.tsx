'use client';

import type { ApplicationDetail, GmailStatus } from '@joblume/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { previewText } from '@/lib/applications';
import { recipientInfo, sendDisabledReason } from '@/lib/email-send';

export interface EmailSectionProps {
  app: ApplicationDetail;
  gmail: GmailStatus | undefined;
  lockedReason?: string;
  pending: boolean;
  error?: string | null;
  notice?: string | null;
  onSend(input: { to?: string; confirmGuess?: boolean }): void;
  onNextEmail(): void;
}

export function EmailSection({ app, gmail, lockedReason, pending, error, notice, onSend, onNextEmail }: EmailSectionProps) {
  const stored = app.hiring_manager_email ?? '';
  const [email, setEmail] = useState(stored);
  const [guessConfirmed, setGuessConfirmed] = useState(false);

  useEffect(() => {
    setEmail(stored);
    setGuessConfirmed(false);
  }, [stored, app.id]);

  const info = recipientInfo(app, email);
  const gmailConnected = gmail?.connected === true;
  const reason = sendDisabledReason({ gmailConnected, email, isGuess: info.isGuess, guessConfirmed, locked: lockedReason });
  const changed = email.trim().toLowerCase() !== stored.toLowerCase();

  function submit() {
    onSend({
      ...(changed ? { to: email.trim() } : {}),
      ...(info.isGuess && guessConfirmed ? { confirmGuess: true } : {}),
    });
  }

  return (
    <section aria-label="Send by email" className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <h3 className="font-semibold">Send by email</h3>

      {!gmailConnected && (
        <p className="text-sm text-muted-foreground">
          Gmail is not connected.{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Connect Gmail
          </Link>{' '}
          to send this application from your own address.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="recipient">Recipient</Label>
          {info.badge && <Badge variant={info.badge.tone}>{info.badge.label}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input id="recipient" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-sm" />
          <Button variant="outline" size="sm" onClick={onNextEmail} disabled={pending}>
            Find another email
          </Button>
        </div>
        {info.isGuess && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={guessConfirmed} onChange={(e) => setGuessConfirmed(e.target.checked)} />
            Send to this guessed address
          </label>
        )}
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{`Subject: Application for ${app.job?.title ?? 'the role'}`}</p>
        <p>{previewText(app.cover_letter_text, 240)}</p>
        <p>Your tailored CV (PDF) is attached.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={pending || reason !== null}>
          {pending ? 'Sending…' : 'Send application'}
        </Button>
        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
      </div>

      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
