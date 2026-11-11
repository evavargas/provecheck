const SETS = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKMNPQRSTUVWXYZ', '23456789', '!#$%&*+-=?@'];

// Uniform pick without modulo bias.
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % max;
}

/** Temporary password for the admin to hand over: ambiguous characters left out, one of each class guaranteed. */
export function generateTemporaryPassword(length = 14): string {
  const all = SETS.join('');
  const chars = SETS.map((set) => set[randomIndex(set.length)]!);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
