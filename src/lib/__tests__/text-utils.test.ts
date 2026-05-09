import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml, parseMarkdown, resolveTemplateVariables, splitRotationContent } from '../text-utils';

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('class="foo"')).toBe('class=&quot;foo&quot;');
  });

  it('handles all special chars in one string', () => {
    expect(escapeHtml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('passes through normal text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple occurrences', () => {
    expect(escapeHtml('a&b&c')).toBe('a&amp;b&amp;c');
  });
});

// ---------------------------------------------------------------------------
// parseMarkdown
// ---------------------------------------------------------------------------

describe('parseMarkdown', () => {
  it('renders bold text', () => {
    expect(parseMarkdown('hello **world**')).toBe('hello <strong>world</strong>');
  });

  it('renders italic text', () => {
    expect(parseMarkdown('hello *world*')).toBe('hello <em>world</em>');
  });

  it('renders strikethrough', () => {
    expect(parseMarkdown('~~removed~~')).toBe('<s>removed</s>');
  });

  it('renders inline code', () => {
    const result = parseMarkdown('use `npm install`');
    expect(result).toContain('<code');
    expect(result).toContain('npm install');
    expect(result).toContain('</code>');
  });

  it('converts newlines to <br/>', () => {
    expect(parseMarkdown('line1\nline2')).toBe('line1<br/>line2');
  });

  it('escapes HTML before applying markdown', () => {
    const result = parseMarkdown('**<script>alert("xss")</script>**');
    expect(result).toBe('<strong>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</strong>');
    expect(result).not.toContain('<script>');
  });

  it('handles multiple formats in one string', () => {
    const result = parseMarkdown('**bold** and *italic* and ~~strike~~');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<s>strike</s>');
  });

  it('passes through plain text unchanged', () => {
    expect(parseMarkdown('just text')).toBe('just text');
  });

  it('handles empty string', () => {
    expect(parseMarkdown('')).toBe('');
  });

  it('uses non-greedy matching (stops at first closing)', () => {
    expect(parseMarkdown('**a** and **b**')).toBe('<strong>a</strong> and <strong>b</strong>');
  });

  it('does not create empty bold tags from ****', () => {
    // **** has no content between ** pairs, but italic regex matches *(*)*
    const result = parseMarkdown('a **** b');
    expect(result).not.toContain('<strong></strong>');
    expect(result).not.toContain('<em></em>');
  });
});

// ---------------------------------------------------------------------------
// resolveTemplateVariables
// ---------------------------------------------------------------------------

describe('resolveTemplateVariables', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns text unchanged when no {{ present (fast path)', () => {
    expect(resolveTemplateVariables('Hello World')).toBe('Hello World');
  });

  it('replaces {{greeting}} with morning greeting', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0)); // 9 AM
    expect(resolveTemplateVariables('{{greeting}}')).toBe('Good morning');
  });

  it('replaces {{greeting}} with afternoon greeting', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 14, 0, 0)); // 2 PM
    expect(resolveTemplateVariables('{{greeting}}')).toBe('Good afternoon');
  });

  it('replaces {{greeting}} with evening greeting', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 19, 0, 0)); // 7 PM
    expect(resolveTemplateVariables('{{greeting}}')).toBe('Good evening');
  });

  it('replaces {{greeting}} with night greeting', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 2, 0, 0)); // 2 AM
    expect(resolveTemplateVariables('{{greeting}}')).toBe('Good night');
  });

  it('replaces {{year}}', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(resolveTemplateVariables('Year: {{year}}')).toBe('Year: 2026');
  });

  it('replaces {{month}}', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // January
    expect(resolveTemplateVariables('{{month}}')).toBe('January');
  });

  it('replaces {{day}}', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 12, 0, 0)); // Thursday
    expect(resolveTemplateVariables('{{day}}')).toBe('Thursday');
  });

  it('replaces {{date}}', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 12, 0, 0));
    expect(resolveTemplateVariables('{{date}}')).toBe('March 12, 2026');
  });

  it('replaces {{time}} with 24h format', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 14, 30, 0));
    expect(resolveTemplateVariables('{{time}}')).toBe('14:30');
  });

  it('replaces {{time12}} with 12h format', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 14, 30, 0));
    const result = resolveTemplateVariables('{{time12}}');
    expect(result).toMatch(/2:30\s*PM/);
  });

  it('replaces multiple variables in one string', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0));
    const result = resolveTemplateVariables('{{greeting}}, today is {{day}}');
    expect(result).toBe('Good morning, today is Thursday');
  });

  it('replaces multiple occurrences of the same variable', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0));
    const result = resolveTemplateVariables('{{year}} and {{year}}');
    expect(result).toBe('2026 and 2026');
  });

  it('leaves unknown templates untouched', () => {
    vi.setSystemTime(new Date(2026, 2, 12, 12, 0, 0));
    expect(resolveTemplateVariables('{{unknown}}')).toBe('{{unknown}}');
  });

  it('handles timezone parameter', () => {
    // Set to midnight UTC — in Tokyo (UTC+9) it should be 9 AM (morning)
    vi.setSystemTime(new Date('2026-03-12T00:00:00Z'));
    const result = resolveTemplateVariables('{{greeting}}', 'Asia/Tokyo');
    expect(result).toBe('Good morning');
  });

  it('honors the locale argument for {{day}} (German weekday name)', () => {
    // Regression guard for the en-US literal cutover: passing a non-en
    // locale must surface in the Intl-formatted weekday output.
    vi.setSystemTime(new Date(2026, 2, 12, 12, 0, 0)); // Thursday
    const result = resolveTemplateVariables('{{day}}', undefined, 'de-DE');
    expect(result).toBe('Donnerstag');
  });
});

// ---------------------------------------------------------------------------
// splitRotationContent
// ---------------------------------------------------------------------------

describe('splitRotationContent', () => {
  it('splits by default --- separator', () => {
    expect(splitRotationContent('Hello---World', '---')).toEqual(['Hello', 'World']);
  });

  it('trims whitespace around items', () => {
    expect(splitRotationContent('  Hello  ---  World  ', '---')).toEqual(['Hello', 'World']);
  });

  it('filters out empty items', () => {
    expect(splitRotationContent('Hello------World', '---')).toEqual(['Hello', 'World']);
  });

  it('handles single item (no separator)', () => {
    expect(splitRotationContent('Hello World', '---')).toEqual(['Hello World']);
  });

  it('handles custom separator', () => {
    expect(splitRotationContent('a|b|c', '|')).toEqual(['a', 'b', 'c']);
  });

  it('handles multiline content with separator', () => {
    const content = 'Slide 1\n---\nSlide 2\n---\nSlide 3';
    expect(splitRotationContent(content, '---')).toEqual(['Slide 1', 'Slide 2', 'Slide 3']);
  });

  it('handles empty string', () => {
    expect(splitRotationContent('', '---')).toEqual([]);
  });

  it('handles only separators', () => {
    expect(splitRotationContent('------', '---')).toEqual([]);
  });

  it('handles whitespace-only items', () => {
    expect(splitRotationContent('hello---   ---world', '---')).toEqual(['hello', 'world']);
  });
});
