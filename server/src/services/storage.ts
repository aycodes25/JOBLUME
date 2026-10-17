import type { Db } from '../lib/supabase.js';

export const BUCKET = 'cvs';

export async function uploadFile(db: Db, path: string, bytes: Uint8Array | Buffer, contentType: string): Promise<string> {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function createSignedUrl(db: Db, path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error('Could not sign URL');
  return data.signedUrl;
}
