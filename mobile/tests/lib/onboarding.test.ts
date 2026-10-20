import { initialStep, needsOnboarding } from '@/lib/onboarding';

describe('needsOnboarding', () => {
  it('is true without a CV or without desired roles', () => {
    expect(needsOnboarding({ base_cv_url: null, desired_roles: ['analyst'] })).toBe(true);
    expect(needsOnboarding({ base_cv_url: 'u/base-cv.pdf', desired_roles: [] })).toBe(true);
    expect(needsOnboarding({ base_cv_url: null, desired_roles: [] })).toBe(true);
  });

  it('is false once there is a CV and at least one role', () => {
    expect(needsOnboarding({ base_cv_url: 'u/base-cv.pdf', desired_roles: ['analyst'] })).toBe(false);
  });
});

describe('initialStep', () => {
  it('starts at the CV step without a CV and at the profile step with one', () => {
    expect(initialStep({ base_cv_url: null })).toBe(1);
    expect(initialStep({ base_cv_url: 'u/base-cv.pdf' })).toBe(2);
  });
});
