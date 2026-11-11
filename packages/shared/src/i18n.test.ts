import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import en from '../i18n/en.json';
import { ERROR_CODES } from './errors';

const keys = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v as Record<string, unknown>, `${p}${k}.`)
      : [`${p}${k}`],
  );

describe('i18n', () => {
  it('has the same keys in es and en', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
  it('has a message for every error code', () => {
    for (const code of ERROR_CODES) expect(keys(es)).toContain(`errors.${code}`);
  });
});
