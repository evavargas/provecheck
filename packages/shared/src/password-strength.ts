export type PasswordStrength = 'weak' | 'medium' | 'strong';

/** Rough indicator for the first-login form (M-04). The only hard rule is the minimum length (RN-26). */
export function passwordStrength(password: string): PasswordStrength {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length < 10 || classes < 2) return 'weak';
  if (password.length >= 14 && classes >= 3) return 'strong';
  return 'medium';
}
