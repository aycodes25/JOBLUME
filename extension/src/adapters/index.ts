import type { Adapter } from '../fill/engine';
import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { workable } from './workable';

export const ADAPTERS: readonly Adapter[] = [greenhouse, lever, ashby, workable];

export function adapterForHost(host: string): Adapter | null {
  const h = host.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.includes(h)) ?? null;
}
