import { vi } from 'vitest';
import type { AppDeps } from '../../src/api/deps.js';

/** Every AppDeps member stubbed with vi.fn(); tests pass only the members they care about. */
export function makeDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    webOrigin: 'http://localhost:3000',
    getUser: vi.fn(async (t: string) => (t === 'good' ? { id: 'u1', email: 'a@b.c' } : null)),
    profiles: { get: vi.fn(), update: vi.fn() },
    cv: { upload: vi.fn() },
    applications: { list: vi.fn(), get: vi.fn(), update: vi.fn(), setStatus: vi.fn(), analytics: vi.fn(), nextEmail: vi.fn(), setEmail: vi.fn() },
    jobs: { refresh: vi.fn(), rematch: vi.fn() },
    sending: { send: vi.fn() },
    gmail: { startConnect: vi.fn(), finishConnect: vi.fn(), status: vi.fn(), disconnect: vi.fn() },
    ...over,
  };
}
