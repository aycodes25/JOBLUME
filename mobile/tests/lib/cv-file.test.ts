import { CV_MIME_TYPES, MAX_CV_BYTES, toCvFile, validateCvAsset } from '@/lib/cv-file';

describe('validateCvAsset', () => {
  it('accepts a PDF or DOCX up to 5 MB, and a missing size', () => {
    expect(validateCvAsset({ name: 'cv.pdf', size: 1000 })).toBeNull();
    expect(validateCvAsset({ name: 'CV.DOCX', size: MAX_CV_BYTES })).toBeNull();
    expect(validateCvAsset({ name: 'cv.pdf' })).toBeNull();
    expect(validateCvAsset({ name: 'cv.pdf', size: null })).toBeNull();
  });

  it('rejects other types, empty files and files over 5 MB', () => {
    expect(validateCvAsset({ name: 'cv.doc', size: 10 })).toBe('Upload a PDF or DOCX file.');
    expect(validateCvAsset({ name: 'cv.pdf', size: 0 })).toBe('That file is empty.');
    expect(validateCvAsset({ name: 'cv.pdf', size: MAX_CV_BYTES + 1 })).toBe('That file is larger than 5 MB.');
  });
});

describe('toCvFile', () => {
  it('keeps the picked type, or derives it from the extension', () => {
    expect(toCvFile({ uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf' })).toEqual({
      uri: 'file:///a.pdf',
      name: 'a.pdf',
      mimeType: 'application/pdf',
    });
    expect(toCvFile({ uri: 'file:///b', name: 'b.docx' }).mimeType).toBe(CV_MIME_TYPES[1]);
    expect(toCvFile({ uri: 'file:///c', name: 'c.pdf', mimeType: null }).mimeType).toBe('application/pdf');
  });
});
