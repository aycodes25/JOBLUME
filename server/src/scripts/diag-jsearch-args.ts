import type { JSearchPath, JSearchProvider } from '../scrapers/jsearch-client.js';

export interface DiagArgs {
  query: string;
  onsite: boolean;
  provider: JSearchProvider;
  path: JSearchPath;
}

/** Reads the diagnostic script's arguments. --path and --provider override the env defaults; a bad value throws. */
export function parseDiagArgs(args: string[], defaults: { provider?: JSearchProvider; path?: JSearchPath }): DiagArgs {
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const path = flag('path') ?? defaults.path ?? '/search-v2';
  if (path !== '/search' && path !== '/search-v2') throw new Error('--path must be /search or /search-v2');
  const provider = flag('provider') ?? defaults.provider ?? 'rapidapi';
  if (provider !== 'rapidapi' && provider !== 'openwebninja') throw new Error('--provider must be rapidapi or openwebninja');
  return {
    query: args.find((a) => !a.startsWith('--')) ?? 'full stack developer remote',
    onsite: args.includes('--onsite'),
    provider,
    path,
  };
}

/** Names only: the keys of a value when it is a plain object, else an empty list. Never values. */
export function keyNames(value: unknown): string[] {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
}
