import type { Adapter } from '../fill/engine';
import { greenhouse } from './greenhouse';
import { lever } from './lever';

export const ADAPTERS: readonly Adapter[] = [greenhouse, lever];

export function adapterForHost(host: string): Adapter | null {
  const h = host.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.includes(h)) ?? null;
}
