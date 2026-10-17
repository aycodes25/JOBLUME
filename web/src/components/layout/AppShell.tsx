'use client';

import { Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { NavLinks } from './NavLinks';

export function AppShell({ email, onSignOut, children }: { email: string | null; onSignOut(): void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border p-4 md:block">
        <p className="mb-6 px-3 text-lg font-semibold">JobLume</p>
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3">
            {email && <span className="max-w-[160px] truncate text-sm text-muted-foreground">{email}</span>}
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </header>
        {open && (
          <div id="mobile-nav" className="border-b border-border p-4 md:hidden">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        )}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
