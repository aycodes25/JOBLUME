import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { createCvService } from '../../src/services/cv/upload.js';

async function makePdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  text.split('\n').forEach((line, i) => page.drawText(line, { x: 40, y: 780 - i * 14, size: 10, font }));
  return Buffer.from(await pdf.save());
}

const longText = Array.from({ length: 20 }, (_, i) => `Line ${i}: experienced engineer building reliable systems.`).join('\n');

describe('createCvService', () => {
  it('stores the file under the user folder and saves the parsed text', async () => {
    const deps = {
      upload: vi.fn().mockResolvedValue('user-1/base-cv.pdf'),
      setCv: vi.fn().mockResolvedValue(undefined),
    };
    const svc = createCvService(deps);
    const result = await svc.upload('user-1', { buffer: await makePdf(longText) });
    expect(deps.upload).toHaveBeenCalledWith('user-1/base-cv.pdf', expect.any(Buffer), 'application/pdf');
    expect(deps.setCv).toHaveBeenCalledWith('user-1', { text: expect.stringContaining('experienced engineer'), path: 'user-1/base-cv.pdf' });
    expect(result.characters).toBeGreaterThan(200);
  });

  it('rejects unsupported files with 400', async () => {
    const svc = createCvService({ upload: vi.fn(), setCv: vi.fn() });
    await expect(svc.upload('u', { buffer: Buffer.from('not a cv') })).rejects.toMatchObject({ status: 400, code: 'unsupported_file_type' });
  });

  it('rejects a CV with too little extractable text with 422', async () => {
    const svc = createCvService({ upload: vi.fn(), setCv: vi.fn() });
    await expect(svc.upload('u', { buffer: await makePdf('hi') })).rejects.toMatchObject({ status: 422, code: 'cv_text_too_short' });
  });
});
