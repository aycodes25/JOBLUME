import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../../src/lib/crypto.js';

const key = 'ab'.repeat(32);

describe('crypto', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('refresh-token-123', key), key)).toBe('refresh-token-123');
  });

  it('produces a different payload each time (random IV)', () => {
    expect(encrypt('x', key)).not.toBe(encrypt('x', key));
  });

  it('fails with the wrong key', () => {
    const payload = encrypt('secret', key);
    expect(() => decrypt(payload, 'cd'.repeat(32))).toThrow();
  });

  it('fails when the payload is tampered with', () => {
    const [iv, tag, data] = encrypt('secret', key).split('.');
    const flipped = Buffer.from(data!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decrypt([iv, tag, flipped.toString('base64')].join('.'), key)).toThrow();
  });
});

describe('crypto auth tag length', () => {
  it('rejects a payload with a truncated tag', () => {
    const [iv, tag, data] = encrypt('secret', key).split('.');
    const short = Buffer.from(tag!, 'base64').subarray(0, 8).toString('base64');
    expect(() => decrypt([iv, short, data].join('.'), key)).toThrow();
  });
});
