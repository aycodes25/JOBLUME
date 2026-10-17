import { describe, expect, it } from 'vitest';
import type { Application, Profile } from '@joblume/shared';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import type { ProfileRow } from '../../src/db/types.js';

describe('shared contract', () => {
  it('server rows are assignable to the shared API types (checked by the typecheck step)', () => {
    const application = (row: ApplicationWithJob): Application => row;
    const profile = (row: ProfileRow): Profile => row;
    expect(typeof application).toBe('function');
    expect(typeof profile).toBe('function');
  });
});
