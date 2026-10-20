import { displayCvName } from '@/lib/cv-name';

describe('displayCvName', () => {
  it('prefers the original file name', () => {
    expect(displayCvName({ base_cv_filename: 'My CV.pdf', base_cv_url: 'u1/base-cv.pdf' })).toBe('My CV.pdf');
  });

  it('falls back to the stored file name for older uploads', () => {
    expect(displayCvName({ base_cv_filename: null, base_cv_url: 'u1/base-cv.pdf' })).toBe('base-cv.pdf');
  });

  it('is null when there is no CV', () => {
    expect(displayCvName({ base_cv_filename: null, base_cv_url: null })).toBeNull();
  });
});
