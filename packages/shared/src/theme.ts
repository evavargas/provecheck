// Design tokens from docs/provecheck-documentacion-desarrollo.md section 16.1.
export const lightTheme = {
  primary: '#0F4C5C',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DCEBEF',
  success: '#1F7A4A',
  warning: '#E0A100',
  onWarning: '#1B2528',
  error: '#C0392B',
  background: '#F6F8F9',
  surface: '#FFFFFF',
  text: '#1B2528',
  textSecondary: '#5C6B70',
  border: '#D9E1E4',
} as const;

export const darkTheme = {
  primary: '#4FB3C8',
  onPrimary: '#0E1518',
  primaryContainer: '#172125',
  success: '#4CC38A',
  warning: '#E0A100',
  onWarning: '#1B2528',
  error: '#FF7A6B',
  background: '#0E1518',
  surface: '#172125',
  text: '#E6ECEE',
  textSecondary: '#9FB0B6',
  border: '#2A383D',
} as const;

export type Theme = { [K in keyof typeof lightTheme]: string };
