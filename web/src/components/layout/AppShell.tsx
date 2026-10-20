'use client';

import { Bell, Briefcase, LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS, NavLinks } from './NavLinks';

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
        <Briefcase className="h-5 w-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">JobLume</span>
    </div>
  );
}

export interface AppShellProps {
  email: string | null;
  onSignOut(): void;
  /** Applications waiting for review, shown at the bottom of the sidebar. */
  pendingCount?: number;
  children: ReactNode;
}

export function AppShell({ email, onSignOut, pendingCount, children }: AppShellProps) {
  const pathname = usePathname();
  const section = NAV_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.label ?? 'Queue';
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <div className="mb-6 px-1 pt-1">
          <Logo />
        </div>
        <NavLinks />
        <div className="mt-auto border-t border-border pt-4">
          <div className="flex items-center justify-between px-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4" aria-hidden="true" />
              Pending
            </span>
            {pendingCount !== undefined && <span className="font-semibold text-foreground">{pendingCount}</span>}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 shadow-sm backdrop-blur md:px-8">
          <div className="md:hidden">
            <Logo />
          </div>
          <p className="hidden text-sm text-muted-foreground md:block">
            <span className="text-foreground">Dashboard</span> / {section}
          </p>
          <div className="flex items-center gap-3">
            {email && (
              <>
                <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground sm:block">{email}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold uppercase text-primary" aria-hidden="true">
                  {email.charAt(0)}
                </span>
              </>
            )}
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white shadow-[0_-2px_10px_rgb(15_23_42/0.06)] md:hidden">
        <NavLinks variant="bottom" label="Mobile" />
      </div>
    </div>
  );
}
