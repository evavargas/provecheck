import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it.each([
    ['', 'weak'],
    ['short1A!', 'weak'],
    ['aaaaaaaaaaaa', 'weak'],
    ['abcdefghi1', 'medium'],
    ['Abcdefghij12', 'medium'],
    ['Abcdefghij1234!', 'strong'],
  ])('%s -> %s', (pw, expected) => expect(passwordStrength(pw)).toBe(expected));
});
