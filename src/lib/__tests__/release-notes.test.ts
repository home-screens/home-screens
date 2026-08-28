import { describe, it, expect } from 'vitest';
import { parseInline, parseReleaseNotes } from '@/lib/release-notes';

describe('parseInline', () => {
  it('splits emphasis, code, and links out of surrounding text', () => {
    expect(parseInline('a **bold** and `code` and [docs](https://example.com/x) end')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'strong', value: 'bold' },
      { type: 'text', value: ' and ' },
      { type: 'code', value: 'code' },
      { type: 'text', value: ' and ' },
      { type: 'link', value: 'docs', href: 'https://example.com/x' },
      { type: 'text', value: ' end' },
    ]);
  });

  it('linkifies bare http(s) URLs', () => {
    expect(parseInline('see https://example.com/a')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com/a', href: 'https://example.com/a' },
    ]);
  });

  it('renders a non-http link target as plain text', () => {
    expect(parseInline('[x](javascript:alert)')).toEqual([{ type: 'text', value: 'x' }]);
  });

  it('leaves emphasis markers inside code spans alone', () => {
    expect(parseInline('`a **b** c`')).toEqual([{ type: 'code', value: 'a **b** c' }]);
  });
});

describe('parseReleaseNotes', () => {
  it('parses the heading + bullets shape release bodies actually use', () => {
    const blocks = parseReleaseNotes(
      ['## New', '', '- First item', '- Second item', '', '## Fixed', '', '- A fix'].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list', 'heading', 'list']);
    expect(blocks[0]).toMatchObject({ level: 2, content: [{ type: 'text', value: 'New' }] });
    expect(blocks[1]).toMatchObject({
      ordered: false,
      items: [[{ type: 'text', value: 'First item' }], [{ type: 'text', value: 'Second item' }]],
    });
  });

  it('joins wrapped paragraph lines and separates paragraphs on blank lines', () => {
    const blocks = parseReleaseNotes('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', content: [{ value: 'one two' }] });
    expect(blocks[1]).toMatchObject({ type: 'paragraph', content: [{ value: 'three' }] });
  });

  it('folds an indented continuation line into its list item', () => {
    const blocks = parseReleaseNotes('- item start\n  item rest');
    expect(blocks[0]).toMatchObject({
      type: 'list',
      items: [[{ type: 'text', value: 'item start item rest' }]],
    });
  });

  it('keeps ordered and unordered runs as separate lists', () => {
    const blocks = parseReleaseNotes('1. one\n2. two\n- bullet');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'list']);
    expect(blocks[0]).toMatchObject({ ordered: true });
    expect(blocks[1]).toMatchObject({ ordered: false });
  });

  it('keeps fenced code verbatim', () => {
    const blocks = parseReleaseNotes('```\nnpm run build\n# not a heading\n```');
    expect(blocks).toEqual([{ type: 'code', value: 'npm run build\n# not a heading' }]);
  });

  it('drops horizontal rules and returns nothing for an empty body', () => {
    expect(parseReleaseNotes('---')).toEqual([]);
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes('   \n\n')).toEqual([]);
  });

  it('handles CRLF bodies', () => {
    expect(parseReleaseNotes('## New\r\n\r\n- item')).toMatchObject([
      { type: 'heading' },
      { type: 'list' },
    ]);
  });
});
