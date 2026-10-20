const MAX_NAME = 120;

/** A safe display name for an uploaded file: no path, no control characters, at most 120 characters. */
export function cleanFilename(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  // Multipart parsers hand filenames over decoded as latin1; undo that when the bytes are really UTF-8.
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  let name = decoded.includes('�') ? raw : decoded;
  name = name.split(/[\\/]/).pop() ?? '';
  name = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length > MAX_NAME) {
    const ext = /(\.[A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? '';
    name = name.slice(0, MAX_NAME - ext.length) + ext;
  }
  return name || fallback;
}
