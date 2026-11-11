import { MIN_PASSWORD_LENGTH, passwordStrength } from '@provecheck/shared';
import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword } from './password';

describe('generateTemporaryPassword', () => {
  it('meets the minimum length and is strong', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      expect(pw.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
      expect(passwordStrength(pw)).toBe('strong');
      expect(pw).not.toMatch(/[Il1O0o]/);
    }
  });
  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 100 }, () => generateTemporaryPassword())).size).toBe(100);
  });
});
