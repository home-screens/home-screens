import { describe, it, expect } from 'vitest';
import { cleanText, htmlToText, httpUrl, normalizeWhitespace, stripTitleTags } from '../sanitize';

describe('normalizeWhitespace', () => {
  it('collapses runs of whitespace, newlines and nbsp into one space', () => {
    expect(normalizeWhitespace('  a \n\n b\t\tc  ')).toBe('a b c');
    expect(normalizeWhitespace('a  b')).toBe('a b');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeWhitespace(' \n\t ')).toBe('');
  });
});

describe('httpUrl', () => {
  it('accepts http and https URLs and trims them', () => {
    expect(httpUrl('  https://example.com/a  ')).toBe('https://example.com/a');
    expect(httpUrl('HTTP://example.com')).toBe('HTTP://example.com');
  });

  it('rejects everything else', () => {
    expect(httpUrl('//example.com/protocol-relative.jpg')).toBeNull();
    expect(httpUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(httpUrl('javascript:alert(1)')).toBeNull();
    expect(httpUrl('ftp://example.com')).toBeNull();
    expect(httpUrl('')).toBeNull();
    expect(httpUrl(null)).toBeNull();
    expect(httpUrl(undefined)).toBeNull();
  });
});

describe('htmlToText', () => {
  it('returns empty text and no image for empty input', () => {
    expect(htmlToText('')).toEqual({ text: '', firstImage: null });
  });

  it('strips tags and decodes entities', () => {
    expect(htmlToText('<p>Tom &amp; <b>Jerry</b> &copy; 2026</p>').text).toBe('Tom & Jerry © 2026');
  });

  it('separates block-level tags with spaces so paragraphs do not fuse', () => {
    expect(htmlToText('<p>Headline</p><p>Body</p>').text).toBe('Headline Body');
    expect(htmlToText('Line<br/>Break<div>Block</div>').text).toBe('Line Break Block');
    expect(htmlToText('<ul><li>One</li><li>Two</li></ul>').text).toBe('One Two');
  });

  it('does not add spaces for inline tags', () => {
    expect(htmlToText('re<b>bold</b>ed').text).toBe('rebolded');
  });

  it('removes script and style blocks and comments entirely', () => {
    expect(htmlToText('<style>p{color:red}</style>Visible<script>alert(1)</script><!-- hidden -->').text)
      .toBe('Visible');
  });

  it('decodes entities after stripping so a literal &lt;b&gt; stays visible', () => {
    expect(htmlToText('Use &lt;b&gt; for bold').text).toBe('Use <b> for bold');
    expect(htmlToText('&amp;lt;script&amp;gt;').text).toBe('&lt;script&gt;');
  });

  it('extracts the first image src in double, single, or no quotes', () => {
    expect(htmlToText('<img src="https://a.example/1.jpg"><img src="https://a.example/2.jpg">').firstImage)
      .toBe('https://a.example/1.jpg');
    expect(htmlToText("<img alt='x' src='https://a.example/s.jpg'>").firstImage).toBe('https://a.example/s.jpg');
    expect(htmlToText('<img src=https://a.example/bare.jpg>').firstImage).toBe('https://a.example/bare.jpg');
  });

  it('decodes entities inside the image src and rejects non-http sources', () => {
    expect(htmlToText('<img src="https://a.example/i?x=1&amp;y=2">').firstImage).toBe('https://a.example/i?x=1&y=2');
    expect(htmlToText('<img src="//a.example/rel.jpg">').firstImage).toBeNull();
    expect(htmlToText('<img src="data:image/gif;base64,R0lG">').firstImage).toBeNull();
  });

  it('collapses whitespace in the result', () => {
    expect(htmlToText('<p>\n  Spaced   out\n</p>\n').text).toBe('Spaced out');
  });
});

describe('cleanText', () => {
  it('returns an empty string for empty input', () => {
    expect(cleanText('')).toBe('');
  });

  it('only normalizes whitespace when there is no markup or entity', () => {
    expect(cleanText('  plain   title \n')).toBe('plain title');
  });

  it('strips markup and decodes entities when present', () => {
    expect(cleanText('<b>Bold</b> &amp; loud')).toBe('Bold & loud');
    expect(cleanText('&#128512; &#233;')).toBe('😀 é');
  });
});

describe('stripTitleTags', () => {
  it('drops leading bracket and paren tags with optional separators', () => {
    expect(stripTitleTags('[VIDEO] Rocket launch', [])).toBe('Rocket launch');
    expect(stripTitleTags('(Photos): Festival returns', [])).toBe('Festival returns');
    expect(stripTitleTags('[LIVE] [UPDATE] - Storm nears', [])).toBe('Storm nears');
  });

  it('leaves long bracketed prefixes alone (they are content, not tags)', () => {
    const title = '[This is a very long bracketed phrase that is clearly content] Real';
    expect(stripTitleTags(title, [])).toBe(title);
  });

  it('strips a trailing known suffix with any of the usual separators, case-insensitively', () => {
    expect(stripTitleTags('Story - BBC News', ['BBC News'])).toBe('Story');
    expect(stripTitleTags('Story | bbc news', ['BBC News'])).toBe('Story');
    expect(stripTitleTags('Story – BBC News', ['BBC News'])).toBe('Story');
    expect(stripTitleTags('Story — BBC News', ['BBC News'])).toBe('Story');
  });

  it('tries each known suffix and skips empty or undefined ones', () => {
    expect(stripTitleTags('Story - Publisher', [undefined, '', '  ', 'Publisher'])).toBe('Story');
  });

  it('never strips a title that is only the suffix', () => {
    expect(stripTitleTags(' - BBC News', ['BBC News'])).toBe('- BBC News');
  });

  it('keeps a suffix that does not match a known name', () => {
    expect(stripTitleTags('Story - Someone Else', ['BBC News'])).toBe('Story - Someone Else');
  });

  it('trims surrounding whitespace', () => {
    expect(stripTitleTags('  Story  ', [])).toBe('Story');
  });
});
