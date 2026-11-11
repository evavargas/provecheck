import { z } from 'zod';

// The service record allows bold and bullets only (RN-17). The shape has no room for anything else,
// and the HTML is built here from escaped text, so there is nothing to sanitize afterwards.
const segment = z
  .object({ text: z.string().min(1).max(2000), bold: z.boolean().optional() })
  .strict();
const block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), content: z.array(segment).min(1).max(100) }).strict(),
  z
    .object({
      type: z.literal('bullets'),
      items: z.array(z.array(segment).min(1).max(100)).min(1).max(100),
    })
    .strict(),
]);
const reportBase = z.object({ blocks: z.array(block).min(1).max(200) }).strict();
export type ReportContent = z.infer<typeof reportBase>;
export const reportContentSchema = reportBase.refine((c) => reportTextLength(c) <= 10_000, {
  message: 'report too long',
});
type Segment = z.infer<typeof segment>;

export function reportTextLength(c: { blocks: ReportContent['blocks'] }): number {
  const len = (s: Segment[]) => s.reduce((n, x) => n + x.text.length, 0);
  return c.blocks.reduce(
    (n, b) =>
      n + (b.type === 'paragraph' ? len(b.content) : b.items.reduce((m, i) => m + len(i), 0)),
    0,
  );
}

const inline = (line: string): Segment[] =>
  line
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part },
    );

/** Plain text as typed on the phone: `**bold**` and lines starting with "- " become the record's structure. */
export function parseReportText(text: string): ReportContent {
  const blocks: ReportContent['blocks'] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (bullet?.[1]) {
      const item = inline(bullet[1]);
      if (last?.type === 'bullets') last.items.push(item);
      else blocks.push({ type: 'bullets', items: [item] });
    } else {
      blocks.push({ type: 'paragraph', content: inline(line) });
    }
  }
  return { blocks };
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const spans = (s: Segment[]) =>
  s.map((x) => (x.bold ? `<strong>${escapeHtml(x.text)}</strong>` : escapeHtml(x.text))).join('');

export function renderReportHtml(c: ReportContent): string {
  return c.blocks
    .map((b) =>
      b.type === 'paragraph'
        ? `<p>${spans(b.content)}</p>`
        : `<ul>${b.items.map((i) => `<li>${spans(i)}</li>`).join('')}</ul>`,
    )
    .join('');
}
