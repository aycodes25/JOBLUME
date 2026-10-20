import { CHUNK_SIZE, createChunkedStorage, type KeyValueStore } from '@/lib/secure-storage';

function fakeStore() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: jest.fn(async (k: string) => data.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      if (v.length > 2048) throw new Error('value too large');
      data.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      data.delete(k);
    }),
  };
  return { data, store };
}

describe('createChunkedStorage', () => {
  it('round-trips a short value', async () => {
    const { store } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('sb-abc-auth-token', '{"a":1}');
    expect(await s.getItem('sb-abc-auth-token')).toBe('{"a":1}');
  });

  it('splits a long session into chunks under the SecureStore limit and joins them back', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    await s.setItem('session', value);
    expect(data.get('session.count')).toBe('3');
    expect([...data.values()].every((v) => v.length <= 2048)).toBe(true);
    expect(await s.getItem('session')).toBe(value);
  });

  it('removes old chunks when a shorter value replaces a longer one', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('session', 'y'.repeat(CHUNK_SIZE * 3));
    await s.setItem('session', 'short');
    expect(data.has('session.1')).toBe(false);
    expect(data.has('session.2')).toBe(false);
    expect(await s.getItem('session')).toBe('short');
  });

  it('returns null for a missing key, a bad count or a missing chunk', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    expect(await s.getItem('none')).toBeNull();
    data.set('bad.count', 'abc');
    expect(await s.getItem('bad')).toBeNull();
    data.set('gap.count', '2');
    data.set('gap.0', 'a');
    expect(await s.getItem('gap')).toBeNull();
  });

  it('removeItem deletes every chunk and the count', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('session', 'z'.repeat(CHUNK_SIZE + 1));
    await s.removeItem('session');
    expect(data.size).toBe(0);
    expect(await s.getItem('session')).toBeNull();
  });

  it('turns characters SecureStore refuses into underscores', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('a key:with/odd chars', 'v');
    expect(data.get('a_key_with_odd_chars.0')).toBe('v');
    expect(await s.getItem('a key:with/odd chars')).toBe('v');
  });
});
