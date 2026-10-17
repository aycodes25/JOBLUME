import { safeHttpUrl } from '@joblume/shared';
import type { ReactNode } from 'react';

export interface SafeLinkProps {
  href: string | null | undefined;
  className?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/** External link that only renders for http(s) URLs. Anything else shows `fallback`. */
export function SafeLink({ href, className, children, fallback = null }: SafeLinkProps) {
  const url = safeHttpUrl(href);
  if (!url) return <>{fallback}</>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
