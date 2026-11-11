import { describe, expect, it } from 'vitest';
import { parseReportText, renderReportHtml, reportContentSchema } from './report';

describe('report text', () => {
  it('turns bold and bullets into structure', () => {
    const c = parseReportText('Done **all** rooms\n- floors\n- windows\n\nBye');
    expect(c.blocks).toHaveLength(3);
    expect(renderReportHtml(c)).toBe(
      '<p>Done <strong>all</strong> rooms</p><ul><li>floors</li><li>windows</li></ul><p>Bye</p>',
    );
  });

  it('escapes markup instead of passing it through', () => {
    const html = renderReportHtml(parseReportText('<script>alert(1)</script> & **<b>**'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>&lt;b&gt;</strong>');
  });

  it('rejects empty and unknown shapes', () => {
    expect(reportContentSchema.safeParse(parseReportText('  \n ')).success).toBe(false);
    expect(
      reportContentSchema.safeParse({ blocks: [{ type: 'html', content: 'x' }] }).success,
    ).toBe(false);
    expect(reportContentSchema.safeParse(parseReportText('ok')).success).toBe(true);
  });
});
