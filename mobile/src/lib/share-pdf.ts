import { safeHttpUrl } from '@joblume/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface SharePdfDeps {
  isAvailable(): Promise<boolean>;
  /** Downloads the URL into the app cache under `fileName` and returns the local file uri. */
  download(url: string, fileName: string): Promise<string>;
  share(uri: string): Promise<void>;
}

export type SharePdfResult = 'shared' | 'invalid_url' | 'unavailable';

/** "CV - Data Analyst - Acme.pdf", keeping only safe characters. */
export function pdfFileName(job: { title: string; company: string } | null): string {
  const raw = job ? `CV - ${job.title} - ${job.company}` : 'CV';
  const clean = raw.replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'CV'}.pdf`;
}

export const defaultSharePdfDeps: SharePdfDeps = {
  isAvailable: () => Sharing.isAvailableAsync(),
  download: async (url, fileName) => {
    const file = await File.downloadFileAsync(url, new File(Paths.cache, fileName), { idempotent: true });
    return file.uri;
  },
  share: (uri) => Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your tailored CV', UTI: 'com.adobe.pdf' }),
};

/** Downloads the tailored CV PDF (a signed https URL from the API) and opens the share sheet. Download errors are thrown. */
export async function shareCvPdf(rawUrl: unknown, fileName: string, deps: SharePdfDeps = defaultSharePdfDeps): Promise<SharePdfResult> {
  const url = safeHttpUrl(rawUrl);
  if (!url) return 'invalid_url';
  if (!(await deps.isAvailable())) return 'unavailable';
  const uri = await deps.download(url, fileName);
  await deps.share(uri);
  return 'shared';
}
