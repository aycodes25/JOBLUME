import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from '../src/index.js';

describe('safeHttpUrl', () => {
  it('accepts http and https URLs and returns the normalised string', () => {
    expect(safeHttpUrl('https://example.com/job/1')).toBe('https://example.com/job/1');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it.each([
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['file scheme', 'file:///etc/passwd'],
    ['relative path', '/jobs/1'],
    ['empty string', ''],
    ['garbage', 'not a url'],
  ])('rejects %s', (_name, raw) => {
    expect(safeHttpUrl(raw)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
  });
});
