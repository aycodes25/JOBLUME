import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { detectCvType, extractCvText } from '../../src/services/cv/parse.js';

async function makePdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(text, { x: 50, y: 700, size: 12, font });
  return Buffer.from(await pdf.save());
}

describe('detectCvType', () => {
  it('detects PDF and DOCX by magic bytes', () => {
    expect(detectCvType(Buffer.from('%PDF-1.7 ...'))).toBe('pdf');
    expect(detectCvType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('docx');
  });
  it('rejects anything else', () => {
    expect(detectCvType(Buffer.from('MZ executable'))).toBeNull();
    expect(detectCvType(Buffer.alloc(0))).toBeNull();
  });
});

describe('extractCvText', () => {
  it('extracts text from a PDF', async () => {
    const text = await extractCvText(await makePdf('Senior Backend Engineer in Lagos'), 'pdf');
    expect(text).toContain('Senior Backend Engineer in Lagos');
  });
  it('extracts text from a PDF held in a Buffer view with a non-zero byteOffset', async () => {
    const bytes = await makePdf('Senior Backend Engineer in Lagos');
    const ab = new ArrayBuffer(bytes.length + 20);
    new Uint8Array(ab).set(bytes, 7);
    const view = Buffer.from(ab, 7, bytes.length);
    expect(view.byteOffset).toBe(7);
    expect(await extractCvText(view, 'pdf')).toContain('Senior Backend Engineer in Lagos');
  });
});
