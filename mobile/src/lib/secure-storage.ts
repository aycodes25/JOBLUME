/** The part of expo-secure-store this adapter uses (a fake in tests). */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The storage interface Supabase JS accepts for its session. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** SecureStore may refuse values over 2048 bytes, and a Supabase session is often larger, so values are split. */
export const CHUNK_SIZE = 1800;

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function createChunkedStorage(store: KeyValueStore): AsyncStorageLike {
  async function readCount(base: string): Promise<number | null> {
    const raw = await store.getItemAsync(`${base}.count`);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  async function remove(base: string): Promise<void> {
    const count = await readCount(base);
    if (count !== null) {
      for (let i = 0; i < count; i += 1) await store.deleteItemAsync(`${base}.${i}`);
    }
    await store.deleteItemAsync(`${base}.count`);
  }

  return {
    async getItem(key) {
      const base = safeKey(key);
      const count = await readCount(base);
      if (count === null) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await store.getItemAsync(`${base}.${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const base = safeKey(key);
      await remove(base);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i += 1) {
        await store.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // Written last, so a half-written value reads as "no session" instead of a corrupt one.
      await store.setItemAsync(`${base}.count`, String(count));
    },

    async removeItem(key) {
      await remove(safeKey(key));
    },
  };
}
