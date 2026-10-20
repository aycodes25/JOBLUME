jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

import { openExternalUrl } from '@/lib/external';
import { pdfFileName, shareCvPdf, type SharePdfDeps } from '@/lib/share-pdf';

describe('openExternalUrl', () => {
  it('opens http and https links', async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    expect(await openExternalUrl('https://example.com/job?id=1', open)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/job?id=1');
  });

  it.each(['javascript:alert(1)', 'intent://x#Intent;end', 'file:///etc/hosts', 'not a url', null, undefined, 42])('never opens %p', async (raw) => {
    const open = jest.fn();
    expect(await openExternalUrl(raw, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('pdfFileName', () => {
  it('names the file after the job, keeping safe characters only', () => {
    expect(pdfFileName({ title: 'Data Analyst', company: 'Acme' })).toBe('CV - Data Analyst - Acme.pdf');
    expect(pdfFileName({ title: 'C++ / Go Dev', company: 'Ünï Corp' })).toBe('CV - C Go Dev - n Corp.pdf');
    expect(pdfFileName(null)).toBe('CV.pdf');
  });
});

describe('shareCvPdf', () => {
  function deps(over: Partial<SharePdfDeps> = {}): SharePdfDeps & { [K in keyof SharePdfDeps]: jest.Mock } {
    return {
      isAvailable: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue('file:///cache/CV.pdf'),
      share: jest.fn().mockResolvedValue(undefined),
      ...over,
    } as never;
  }

  it('downloads the PDF and opens the share sheet', async () => {
    const d = deps();
    expect(await shareCvPdf('https://files.example.com/cv.pdf?token=x', 'CV.pdf', d)).toBe('shared');
    expect(d.download).toHaveBeenCalledWith('https://files.example.com/cv.pdf?token=x', 'CV.pdf');
    expect(d.share).toHaveBeenCalledWith('file:///cache/CV.pdf');
  });

  it('refuses a missing or non-http URL without downloading', async () => {
    const d = deps();
    expect(await shareCvPdf(null, 'CV.pdf', d)).toBe('invalid_url');
    expect(await shareCvPdf('javascript:alert(1)', 'CV.pdf', d)).toBe('invalid_url');
    expect(d.download).not.toHaveBeenCalled();
  });

  it('reports when sharing is not available on the device', async () => {
    const d = deps({ isAvailable: jest.fn().mockResolvedValue(false) });
    expect(await shareCvPdf('https://files.example.com/cv.pdf', 'CV.pdf', d)).toBe('unavailable');
    expect(d.download).not.toHaveBeenCalled();
  });

  it('lets a download failure reach the caller', async () => {
    const d = deps({ download: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(shareCvPdf('https://files.example.com/cv.pdf', 'CV.pdf', d)).rejects.toThrow('offline');
    expect(d.share).not.toHaveBeenCalled();
  });
});
