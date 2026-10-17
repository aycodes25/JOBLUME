/** Returns a normalised http(s) URL, or null for anything else (javascript:, data:, relative, garbage). */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
