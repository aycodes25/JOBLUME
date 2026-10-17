'use client';

import type { GmailStatus } from '@joblume/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeGmailReason, type GmailReturn } from '@/lib/gmail-return';

export interface GmailCardProps {
  status: GmailStatus | undefined;
  connecting: boolean;
  disconnecting: boolean;
  error?: string | null;
  returned?: GmailReturn | null;
  onConnect(): void;
  onDisconnect(): void;
}

export function GmailCard({ status, connecting, disconnecting, error, returned, onConnect, onDisconnect }: GmailCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gmail</CardTitle>
        <CardDescription>
          Connect Gmail so JobLume can send your applications and follow-ups from your own address. It can only send email; it cannot read your mail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {returned?.kind === 'connected' && (
          <p role="status" className="text-sm text-emerald-400">
            Gmail connected.
          </p>
        )}
        {returned?.kind === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            {describeGmailReason(returned.reason)}
          </p>
        )}
        {!status ? (
          <p className="text-sm text-muted-foreground">Checking Gmail…</p>
        ) : !status.configured ? (
          <p className="text-sm text-muted-foreground">
            Gmail is not set up on this server yet. Follow docs/gmail-setup.md, then restart the server.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              Connected as <strong>{status.email}</strong>
            </p>
            <Button variant="outline" size="sm" onClick={onDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        ) : (
          <Button onClick={onConnect} disabled={connecting}>
            {connecting ? 'Opening Google…' : 'Connect Gmail'}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
