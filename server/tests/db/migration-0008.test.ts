import { readFileSync } from 'node:fs';
import { JOB_SOURCES } from '@joblume/shared';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0008_jsearch_source.sql', import.meta.url), 'utf8');

describe('migration 0008_jsearch_source.sql', () => {
  it('lets the jobs table accept every shared job source, including jsearch', () => {
    const m = sql.match(/add constraint jobs_source_check\s+check \(source in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    expect([...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1])).toEqual([...JOB_SOURCES]);
  });
});
