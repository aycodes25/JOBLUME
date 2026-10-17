import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parseSections, renderCvPdf, sanitize, wrapText } from '../../src/services/cv/pdf.js';

const CV = `JANE DOE
jane@example.com | Lagos

SUMMARY
Backend engineer with four years of experience.

SKILLS
- Node.js
- PostgreSQL

EXPERIENCE
Acme Ltd, Backend Engineer (2021-2024)
- Built payment APIs handling 2M requests a day
`;

describe('sanitize', () => {
  it('maps naira and smart punctuation and strips unsupported glyphs', () => {
    expect(sanitize('Earned ₦500 – “great” 🚀')).toBe('Earned N500 - "great" ');
  });
  it('keeps accented latin letters and bullets', () => {
    expect(sanitize('café • ok')).toBe('café • ok');
  });
});

describe('parseSections', () => {
  it('keeps a header block then splits on known headings', () => {
    const sections = parseSections(CV);
    expect(sections.map((s) => s.heading)).toEqual([null, 'SUMMARY', 'SKILLS', 'EXPERIENCE']);
    expect(sections[0]!.lines[0]).toBe('JANE DOE');
    expect(sections[2]!.lines.filter(Boolean)).toEqual(['- Node.js', '- PostgreSQL']);
  });

  it('accepts headings written as "Skills:" in any case', () => {
    expect(parseSections('Name\nskills:\n- a').map((s) => s.heading)).toEqual([null, 'SKILLS']);
  });

  it('drops an empty header block', () => {
    expect(parseSections('SUMMARY\ntext').map((s) => s.heading)).toEqual(['SUMMARY']);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length;
  it('wraps on word boundaries', () => {
    expect(wrapText('aaa bbb ccc ddd', measure, 7)).toEqual(['aaa bbb', 'ccc ddd']);
  });
  it('hard-splits a word longer than the line', () => {
    expect(wrapText('abcdefghij', measure, 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('renderCvPdf', () => {
  it('produces a loadable PDF', async () => {
    const bytes = await renderCvPdf(CV);
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('%PDF');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('paginates long content without dropping it', async () => {
    const long = 'EXPERIENCE\n' + Array.from({ length: 200 }, (_, i) => `- Delivered project number ${i}`).join('\n');
    expect((await PDFDocument.load(await renderCvPdf(long))).getPageCount()).toBeGreaterThan(1);
  });

  it('does not throw on characters outside the PDF font', async () => {
    await expect(renderCvPdf('SUMMARY\nEarned ₦5m 🚀 日本')).resolves.toBeInstanceOf(Uint8Array);
  });
});
