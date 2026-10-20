import { describe, expect, it } from 'vitest';
import { MOBILE_GMAIL_RETURN } from '../src/index.js';

describe('MOBILE_GMAIL_RETURN', () => {
  it('is the joblume app deep link for the Gmail return screen', () => {
    expect(MOBILE_GMAIL_RETURN).toBe('joblume://gmail-return');
    const u = new URL(MOBILE_GMAIL_RETURN);
    expect(u.protocol).toBe('joblume:');
    expect(u.host).toBe('gmail-return');
  });
});
