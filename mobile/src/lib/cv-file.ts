export const MAX_CV_BYTES = 5 * 1024 * 1024;

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** What the document picker is asked to offer. */
export const CV_MIME_TYPES = [PDF, DOCX];

/** A picked file as React Native's FormData expects it: a local uri plus a name and type. */
export interface CvFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** Same rules and messages as the web upload. `size` can be missing on some Android providers; the server still enforces 5 MB. */
export function validateCvAsset(asset: { name: string; size?: number | null }): string | null {
  if (!/\.(pdf|docx)$/i.test(asset.name)) return 'Upload a PDF or DOCX file.';
  if (asset.size === 0) return 'That file is empty.';
  if (typeof asset.size === 'number' && asset.size > MAX_CV_BYTES) return 'That file is larger than 5 MB.';
  return null;
}

export function toCvFile(asset: { uri: string; name: string; mimeType?: string | null }): CvFile {
  const mimeType = asset.mimeType || (/\.docx$/i.test(asset.name) ? DOCX : PDF);
  return { uri: asset.uri, name: asset.name, mimeType };
}
