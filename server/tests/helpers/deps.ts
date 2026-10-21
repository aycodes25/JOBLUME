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
    autofill: { get: vi.fn() },
    jobs: { refresh: vi.fn(), rematch: vi.fn() },
    scan: { status: vi.fn() },
    jobLinks: { addFromUrl: vi.fn(), listFetches: vi.fn() },
    sending: { send: vi.fn() },
    followUps: { list: vi.fn(), update: vi.fn(), send: vi.fn(), dismiss: vi.fn() },
    gmail: { startConnect: vi.fn(), finishConnect: vi.fn(), returnTarget: vi.fn(() => 'web' as const), status: vi.fn(), disconnect: vi.fn() },
    ...over,
  };
}
