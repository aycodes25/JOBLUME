import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES, KANBAN_COLUMNS, columnForStatus, isApplicationStatus } from '../src/index.js';

describe('statuses', () => {
  it('lists the seven statuses the database allows', () => {
    expect([...APPLICATION_STATUSES]).toEqual([
      'pending_review', 'approved', 'applied', 'interviewing', 'rejected', 'offer', 'skipped',
    ]);
  });

  it('the type guard accepts only known statuses', () => {
    expect(isApplicationStatus('applied')).toBe(true);
    expect(isApplicationStatus('done')).toBe(false);
    expect(isApplicationStatus(5)).toBe(false);
    expect(isApplicationStatus(undefined)).toBe(false);
  });

  it('maps statuses to kanban columns', () => {
    expect([...KANBAN_COLUMNS]).toEqual(['pending_review', 'applied', 'interviewing', 'rejected', 'offer']);
    expect(columnForStatus('approved')).toBe('pending_review');
    expect(columnForStatus('skipped')).toBeNull();
    for (const column of KANBAN_COLUMNS) expect(columnForStatus(column)).toBe(column);
  });
});
