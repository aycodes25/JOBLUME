import { colors, radius, space } from '@/theme';

describe('theme', () => {
  it('uses the web tokens: blue primary, light grey background, white cards, pill badges', () => {
    expect(colors.primary).toBe('#3571F3');
    expect(colors.background).toBe('#F6F7F9');
    expect(colors.card).toBe('#FFFFFF');
    expect(radius.pill).toBe(999);
  });

  it('spaces in steps of 4', () => {
    expect(space(0)).toBe(0);
    expect(space(4)).toBe(16);
  });
});
