import type { Application } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import {
  applyStatusLocal, buildTextPatch, groupByColumn, previewText, queueTab, resolveDrop, scoreTone, sortByScore, splitQueue,
} from '@/lib/applications';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'letter',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, apply_method: null,
  status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z', job: null, ...over,
});

describe('sortByScore', () => {
  it('orders by score descending, nulls last, ties newest first, without mutating', () => {
    const input = [
      app({ id: 'low', match_score: 40 }),
      app({ id: 'none', match_score: null }),
      app({ id: 'old90', match_score: 90, created_at: '2026-10-01T00:00:00.000Z' }),
      app({ id: 'new90', match_score: 90, created_at: '2026-10-05T00:00:00.000Z' }),
    ];
    const copy = [...input];
    expect(sortByScore(input).map((a) => a.id)).toEqual(['new90', 'old90', 'low', 'none']);
    expect(input).toEqual(copy);
  });
});

describe('queue tabs', () => {
  it('maps statuses to tabs', () => {
    expect(queueTab('pending_review')).toBe('pending');
    expect(queueTab('approved')).toBe('ready');
    expect(queueTab('skipped')).toBe('skipped');
    expect(queueTab('applied')).toBeNull();
  });

  it('splits and sorts applications into tabs and ignores the applied family', () => {
    const groups = splitQueue([
      app({ id: 'p1', match_score: 50 }),
      app({ id: 'p2', match_score: 80 }),
      app({ id: 'r1', status: 'approved' }),
      app({ id: 's1', status: 'skipped' }),
      app({ id: 'x', status: 'applied' }),
    ]);
    expect(groups.pending.map((a) => a.id)).toEqual(['p2', 'p1']);
    expect(groups.ready.map((a) => a.id)).toEqual(['r1']);
    expect(groups.skipped.map((a) => a.id)).toEqual(['s1']);
  });
});

describe('groupByColumn', () => {
  it('puts approved in Pending Review, drops skipped, keeps every column key', () => {
    const groups = groupByColumn([
      app({ id: 'a', status: 'pending_review' }),
      app({ id: 'b', status: 'approved' }),
      app({ id: 'c', status: 'skipped' }),
      app({ id: 'd', status: 'applied' }),
      app({ id: 'e', status: 'offer' }),
    ]);
    expect(Object.keys(groups)).toEqual(['pending_review', 'applied', 'interviewing', 'rejected', 'offer']);
    expect(groups.pending_review.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(groups.applied.map((x) => x.id)).toEqual(['d']);
    expect(groups.interviewing).toEqual([]);
    expect(groups.offer.map((x) => x.id)).toEqual(['e']);
  });
});

describe('applyStatusLocal', () => {
  const now = new Date('2026-10-20T10:00:00.000Z');

  it('mirrors the server: applied stamps times and assisted', () => {
    const [out] = applyStatusLocal([app()], 'a1', 'applied', now);
    expect(out).toMatchObject({
      status: 'applied', applied_at: '2026-10-20T10:00:00.000Z', follow_up_at: '2026-10-23T10:00:00.000Z', apply_method: 'assisted',
    });
  });

  it('keeps the original timestamps between applied-family statuses', () => {
    const applied = app({ status: 'applied', applied_at: '2026-10-18T00:00:00.000Z', follow_up_at: '2026-10-21T00:00:00.000Z', apply_method: 'assisted' });
    const [out] = applyStatusLocal([applied], 'a1', 'interviewing', now);
    expect(out).toMatchObject({ status: 'interviewing', applied_at: '2026-10-18T00:00:00.000Z', follow_up_at: '2026-10-21T00:00:00.000Z' });
  });

  it('clears the timestamps when moving back to pending, approved or skipped', () => {
    const applied = app({ status: 'applied', applied_at: '2026-10-18T00:00:00.000Z', follow_up_at: '2026-10-21T00:00:00.000Z' });
    expect(applyStatusLocal([applied], 'a1', 'pending_review', now)[0]).toMatchObject({ status: 'pending_review', applied_at: null, follow_up_at: null });
    expect(applyStatusLocal([applied], 'a1', 'skipped', now)[0]).toMatchObject({ applied_at: null, follow_up_at: null });
  });

  it('leaves other applications alone and does not mutate the input', () => {
    const input = [app({ id: 'a1' }), app({ id: 'a2' })];
    const out = applyStatusLocal(input, 'a1', 'applied', now);
    expect(out[1]).toBe(input[1]);
    expect(input[0]!.status).toBe('pending_review');
  });
});

describe('resolveDrop', () => {
  const apps = [app({ id: 'a1', status: 'pending_review' }), app({ id: 'a2', status: 'approved' }), app({ id: 'a3', status: 'applied' })];

  it('returns the target column status when dropped on a different column', () => {
    expect(resolveDrop(apps, 'a1', 'applied')).toBe('applied');
    expect(resolveDrop(apps, 'a3', 'offer')).toBe('offer');
  });

  it('returns null when dropped on its own column (approved counts as Pending Review)', () => {
    expect(resolveDrop(apps, 'a3', 'applied')).toBeNull();
    expect(resolveDrop(apps, 'a2', 'pending_review')).toBeNull();
  });

  it('returns null for a missing drop target, an unknown card or a non-column target', () => {
    expect(resolveDrop(apps, 'a1', null)).toBeNull();
    expect(resolveDrop(apps, 'nope', 'applied')).toBeNull();
    expect(resolveDrop(apps, 'a1', 'a3')).toBeNull();
    expect(resolveDrop(apps, 'a1', 'skipped')).toBeNull();
  });
});

describe('previewText', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(previewText('  one\n\n two   three ')).toBe('one two three');
    expect(previewText('abcdefghij', 5)).toBe('abcde…');
    expect(previewText('abcde', 5)).toBe('abcde');
    expect(previewText(null)).toBe('');
  });
});

describe('scoreTone', () => {
  it('buckets scores', () => {
    expect(scoreTone(null)).toBe('none');
    expect(scoreTone(75)).toBe('high');
    expect(scoreTone(74)).toBe('mid');
    expect(scoreTone(50)).toBe('mid');
    expect(scoreTone(49)).toBe('low');
  });
});

describe('buildTextPatch', () => {
  const original = { cv: 'x'.repeat(60), letter: 'Dear team' };

  it('is not dirty when nothing changed', () => {
    expect(buildTextPatch(original, { cv: original.cv, letter: original.letter })).toEqual({ patch: {}, errors: {}, dirty: false });
  });

  it('patches only the changed fields', () => {
    const r = buildTextPatch(original, { cv: original.cv, letter: 'Hello team' });
    expect(r.patch).toEqual({ cover_letter_text: 'Hello team' });
    expect(r.dirty).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('flags a changed CV that is too short and a changed letter that is blank', () => {
    const r = buildTextPatch(original, { cv: 'short', letter: '   ' });
    expect(r.errors.cv).toMatch(/at least 50/);
    expect(r.errors.letter).toMatch(/cannot be empty/);
  });

  it('flags text over the server limits', () => {
    const r = buildTextPatch(original, { cv: 'x'.repeat(30_001), letter: 'y'.repeat(10_001) });
    expect(r.errors.cv).toMatch(/too long/);
    expect(r.errors.letter).toMatch(/too long/);
  });

  it('treats null originals as empty text', () => {
    const r = buildTextPatch({ cv: null, letter: null }, { cv: '', letter: 'Hi' });
    expect(r.patch).toEqual({ cover_letter_text: 'Hi' });
  });
});
