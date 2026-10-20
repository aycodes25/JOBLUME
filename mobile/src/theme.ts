/** Web design tokens (web/src/app/globals.css) as plain values for React Native styles. */
export const colors = {
  background: '#F6F7F9',
  card: '#FFFFFF',
  text: '#171C26',
  muted: '#616875',
  border: '#DCDFE5',
  primary: '#3571F3',
  primaryText: '#FFFFFF',
  primarySoft: '#EAF1FE',
  secondary: '#EDEFF3',
  secondaryText: '#333B4D',
  success: '#047857',
  successSoft: '#ECFDF5',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  danger: '#DC2828',
  dangerSoft: '#FEF2F2',
} as const;

export const radius = { card: 16, input: 10, pill: 999 } as const;

/** 4-point spacing scale: space(4) is 16. */
export const space = (n: number): number => n * 4;

export const font = { title: 24, heading: 18, body: 15, small: 13, tiny: 11 } as const;

export const cardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
