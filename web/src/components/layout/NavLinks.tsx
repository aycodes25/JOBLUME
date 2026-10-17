'use client';

import { BarChart3, Inbox, KanbanSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { href: '/queue', label: 'Queue', icon: Inbox },
  { href: '/tracker', label: 'Tracker', icon: KanbanSquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function NavLinks({
  onNavigate,
  variant = 'sidebar',
  label = 'Main',
}: {
  onNavigate?: () => void;
  variant?: 'sidebar' | 'bottom';
  label?: string;
}) {
  const pathname = usePathname();
  const bottom = variant === 'bottom';
  return (
    <nav aria-label={label}>
      <ul className={bottom ? 'grid grid-cols-4' : 'space-y-1'}>
        {NAV_ITEMS.map(({ href, label: text, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'transition-colors',
                  bottom
                    ? 'flex flex-col items-center gap-1 py-2 text-[11px] font-medium'
                    : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  active
                    ? bottom
                      ? 'text-primary'
                      : 'bg-blue-100 text-primary'
                    : bottom
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
                )}
              >
                <Icon className={bottom ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
