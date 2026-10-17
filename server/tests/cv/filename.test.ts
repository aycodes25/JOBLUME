import { describe, expect, it } from 'vitest';
import { cleanFilename } from '../../src/services/cv/filename.js';

describe('cleanFilename', () => {
  it('keeps a normal name', () => {
    expect(cleanFilename('Tominiyi_Ayomide_Cv.pdf', 'base-cv.pdf')).toBe('Tominiyi_Ayomide_Cv.pdf');
  });

  it('drops any directory part, with either slash style', () => {
    expect(cleanFilename('C:\\Users\\me\\cv.pdf', 'x.pdf')).toBe('cv.pdf');
    expect(cleanFilename('../../etc/cv.pdf', 'x.pdf')).toBe('cv.pdf');
  });

  it('removes control characters and trims', () => {
    expect(cleanFilename('  cv\u0000\u001f.pdf ', 'x.pdf')).toBe('cv.pdf');
  });

  it('repairs a UTF-8 name that arrived decoded as latin1', () => {
    expect(cleanFilename('R\u00c3\u00a9sum\u00c3\u00a9.pdf', 'x.pdf')).toBe('R\u00e9sum\u00e9.pdf');
  });

  it('keeps a name that already contains real accented characters', () => {
    expect(cleanFilename('R\u00e9sum\u00e9.pdf', 'x.pdf')).toBe('R\u00e9sum\u00e9.pdf');
  });

  it('shortens very long names but keeps the extension', () => {
    const out = cleanFilename(`${'a'.repeat(300)}.docx`, 'x.pdf');
    expect(out.length).toBe(120);
    expect(out.endsWith('.docx')).toBe(true);
  });

  it('falls back when there is nothing usable', () => {
    expect(cleanFilename(undefined, 'base-cv.pdf')).toBe('base-cv.pdf');
    expect(cleanFilename('', 'base-cv.pdf')).toBe('base-cv.pdf');
    expect(cleanFilename('///', 'base-cv.pdf')).toBe('base-cv.pdf');
  });
});
