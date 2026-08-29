import { describe, it, expect } from 'vitest';
import { decodeFeedBody, FeedParseError, parseFeed } from '../parse-feed';

/** Wrap items in a minimal RSS 2.0 envelope. */
function rss(items: string, channelExtra = '<title>Example Feed</title>'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>${channelExtra}${items}</channel></rss>`;
}

function atom(entries: string, feedTitle = 'Example Atom'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<title>${feedTitle}</title>${entries}</feed>`;
}

describe('parseFeed: RSS 2.0', () => {
  it('parses title, link, guid, description, pubDate and categories', () => {
    const feed = parseFeed(rss(`
      <item>
        <title>Hello World</title>
        <link>https://example.com/a</link>
        <guid isPermaLink="false">a-1</guid>
        <description>Plain body</description>
        <pubDate>Mon, 24 Aug 2026 09:00:00 GMT</pubDate>
        <category>World</category>
        <category>Politics</category>
      </item>`));

    expect(feed.format).toBe('rss');
    expect(feed.title).toBe('Example Feed');
    expect(feed.items).toHaveLength(1);
    const item = feed.items[0];
    expect(item).toMatchObject({
      id: 'a-1',
      title: 'Hello World',
      link: 'https://example.com/a',
      description: 'Plain body',
      timestamp: Date.UTC(2026, 7, 24, 9),
      imageUrl: null,
      categories: ['World', 'Politics'],
    });
    expect(item.publisher).toBeUndefined();
  });

  it('id falls back to link, then title, when there is no guid', () => {
    const feed = parseFeed(rss(`
      <item><title>Linked</title><link>https://example.com/l</link></item>
      <item><title>Only a title</title></item>`));
    expect(feed.items[0].id).toBe('https://example.com/l');
    expect(feed.items[1].id).toBe('Only a title');
  });

  it('handles CDATA titles and descriptions', () => {
    const feed = parseFeed(rss(`
      <item>
        <title><![CDATA[Markets rally & bonds fall]]></title>
        <description><![CDATA[<p>Stocks rose <b>sharply</b></p>]]></description>
      </item>`));
    expect(feed.items[0].title).toBe('Markets rally & bonds fall');
    expect(feed.items[0].description).toBe('Stocks rose sharply');
  });

  it('reduces HTML descriptions to text and extracts the first image', () => {
    const feed = parseFeed(rss(`
      <item>
        <title>Pictures</title>
        <description><![CDATA[<img src="https://img.example.com/one.jpg" alt=""><p>First para</p><p>Second para</p><img src="https://img.example.com/two.jpg">]]></description>
      </item>`));
    expect(feed.items[0].description).toBe('First para Second para');
    expect(feed.items[0].imageUrl).toBe('https://img.example.com/one.jpg');
  });

  it('falls back to content:encoded when description is missing', () => {
    const feed = parseFeed(rss(`
      <item>
        <title>Encoded</title>
        <content:encoded><![CDATA[<div>Full <i>story</i> text</div>]]></content:encoded>
      </item>`));
    expect(feed.items[0].description).toBe('Full story text');
  });

  it('reads dc:date when pubDate is absent', () => {
    const feed = parseFeed(rss(`
      <item><title>Dated</title><dc:date>2026-08-24T10:30:00Z</dc:date></item>`));
    expect(feed.items[0].timestamp).toBe(Date.UTC(2026, 7, 24, 10, 30));
  });

  it('returns a null timestamp for a mangled date', () => {
    const feed = parseFeed(rss(`
      <item><title>Undated</title><pubDate>not a date</pubDate></item>`));
    expect(feed.items[0].timestamp).toBeNull();
  });

  it('parses the "UT" zone spelling some feeds use', () => {
    const feed = parseFeed(rss(`
      <item><title>UT</title><pubDate>Mon, 24 Aug 2026 09:00:00 UT</pubDate></item>`));
    expect(feed.items[0].timestamp).toBe(Date.UTC(2026, 7, 24, 9));
  });

  describe('image precedence', () => {
    it('media:thumbnail wins over media:content, enclosure and the body image', () => {
      const feed = parseFeed(rss(`
        <item>
          <title>Thumb</title>
          <description><![CDATA[<img src="https://img.example.com/body.jpg">]]></description>
          <enclosure url="https://img.example.com/enc.jpg" type="image/jpeg" length="1"/>
          <media:content url="https://img.example.com/content.jpg" type="image/jpeg"/>
          <media:thumbnail url="https://img.example.com/thumb.jpg"/>
        </item>`));
      expect(feed.items[0].imageUrl).toBe('https://img.example.com/thumb.jpg');
    });

    it('media:content with an image type or medium wins over enclosure', () => {
      const byType = parseFeed(rss(`
        <item><title>T</title>
          <enclosure url="https://img.example.com/enc.jpg" type="image/jpeg"/>
          <media:content url="https://img.example.com/content.jpg" type="image/png"/>
        </item>`));
      expect(byType.items[0].imageUrl).toBe('https://img.example.com/content.jpg');

      const byMedium = parseFeed(rss(`
        <item><title>T</title>
          <media:content url="https://img.example.com/medium.jpg" medium="image"/>
        </item>`));
      expect(byMedium.items[0].imageUrl).toBe('https://img.example.com/medium.jpg');
    });

    it('ignores non-image media:content and enclosures', () => {
      const feed = parseFeed(rss(`
        <item><title>Video</title>
          <media:content url="https://cdn.example.com/clip.mp4" type="video/mp4"/>
          <enclosure url="https://cdn.example.com/audio.mp3" type="audio/mpeg"/>
        </item>`));
      expect(feed.items[0].imageUrl).toBeNull();
    });

    it('uses an image enclosure', () => {
      const feed = parseFeed(rss(`
        <item><title>Enc</title>
          <enclosure url="https://img.example.com/enc.jpg" type="image/jpeg" length="1"/>
        </item>`));
      expect(feed.items[0].imageUrl).toBe('https://img.example.com/enc.jpg');
    });

    it('uses itunes:image href', () => {
      const feed = parseFeed(rss(`
        <item><title>Pod</title>
          <itunes:image href="https://img.example.com/pod.jpg"/>
        </item>`));
      expect(feed.items[0].imageUrl).toBe('https://img.example.com/pod.jpg');
    });

    it('descends into media:group', () => {
      const feed = parseFeed(rss(`
        <item><title>Group</title>
          <media:group>
            <media:content url="https://img.example.com/grouped.jpg" type="image/jpeg"/>
          </media:group>
        </item>`));
      expect(feed.items[0].imageUrl).toBe('https://img.example.com/grouped.jpg');
    });

    it('skips protocol-relative and non-http image URLs and keeps looking', () => {
      const feed = parseFeed(rss(`
        <item><title>Rel</title>
          <media:thumbnail url="//img.example.com/rel.jpg"/>
          <media:content url="data:image/png;base64,AAAA" type="image/png"/>
          <enclosure url="https://img.example.com/enc.jpg" type="image/jpeg"/>
        </item>`));
      expect(feed.items[0].imageUrl).toBe('https://img.example.com/enc.jpg');
    });

    it('falls back to the first body image when no media element carries one', () => {
      const feed = parseFeed(rss(`
        <item><title>Body</title>
          <media:thumbnail url="//img.example.com/rel.jpg"/>
          <description><![CDATA[<img src='https://img.example.com/body.jpg'> text]]></description>
        </item>`));
      expect(feed.items[0].imageUrl).toBe('https://img.example.com/body.jpg');
    });
  });

  it('Google News: <source> becomes publisher and the " - Publisher" suffix is stripped', () => {
    const feed = parseFeed(rss(`
      <item>
        <title>Council approves new park - Prior Lake American</title>
        <link>https://news.google.com/rss/articles/abc</link>
        <source url="https://plamerican.com">Prior Lake American</source>
      </item>`, '<title>"local news" - Google News</title>'));
    expect(feed.items[0].publisher).toBe('Prior Lake American');
    expect(feed.items[0].title).toBe('Council approves new park');
  });

  it('strips a trailing " - Feed Title" suffix', () => {
    const feed = parseFeed(rss(`
      <item><title>Big story | Example Feed</title></item>`));
    expect(feed.items[0].title).toBe('Big story');
  });

  it('strips leading [VIDEO] style prefixes', () => {
    const feed = parseFeed(rss(`
      <item><title>[VIDEO] Rocket launch succeeds</title></item>
      <item><title>(Photos) Festival returns: crowds</title></item>`));
    expect(feed.items[0].title).toBe('Rocket launch succeeds');
    expect(feed.items[1].title).toBe('Festival returns: crowds');
  });

  it('decodes numeric entities, including astral code points', () => {
    const feed = parseFeed(rss(`
      <item><title>Smile &#128512; and &#169; caf&#233;</title></item>`));
    expect(feed.items[0].title).toBe('Smile 😀 and © café');
  });

  it('decodes double-encoded entities so literal tags stay visible as text', () => {
    const feed = parseFeed(rss(`
      <item>
        <title>Tom &amp;amp; Jerry</title>
        <description>Use &amp;lt;b&amp;gt; for bold</description>
      </item>`));
    expect(feed.items[0].title).toBe('Tom & Jerry');
    expect(feed.items[0].description).toBe('Use <b> for bold');
  });

  it('reads an atom:link href when <link> is an element with attributes', () => {
    const feed = parseFeed(rss(`
      <item>
        <title>Atom link</title>
        <atom:link href="https://example.com/via-atom" rel="alternate"/>
      </item>`));
    expect(feed.items[0].link).toBe('https://example.com/via-atom');
  });

  it('drops items with neither a title nor a body', () => {
    const feed = parseFeed(rss(`
      <item><link>https://example.com/empty</link></item>
      <item><title></title><description></description></item>
      <item><description>Body only</description></item>`));
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].description).toBe('Body only');
    expect(feed.items[0].title).toBe('');
  });

  it('caps categories at eight', () => {
    const cats = Array.from({ length: 12 }, (_, i) => `<category>c${i}</category>`).join('');
    const feed = parseFeed(rss(`<item><title>Many</title>${cats}</item>`));
    expect(feed.items[0].categories).toHaveLength(8);
  });

  it('parses a bare <channel> root', () => {
    const feed = parseFeed(`<channel><title>Bare</title><item><title>One</title></item></channel>`);
    expect(feed.format).toBe('rss');
    expect(feed.title).toBe('Bare');
    expect(feed.items.map((i) => i.title)).toEqual(['One']);
  });

  it('tolerates a leading BOM and whitespace', () => {
    const feed = parseFeed(`﻿  \n${rss('<item><title>BOM</title></item>')}`);
    expect(feed.items[0].title).toBe('BOM');
  });
});

describe('parseFeed: RSS 1.0 (RDF)', () => {
  it('finds items at the root level next to the channel', () => {
    const feed = parseFeed(`<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.org/">
    <title>RDF Feed</title>
    <link>https://example.org/</link>
  </channel>
  <item rdf:about="https://example.org/one">
    <title>RDF item one</title>
    <link>https://example.org/one</link>
    <dc:date>2026-08-20T08:00:00Z</dc:date>
  </item>
  <item rdf:about="https://example.org/two">
    <title>RDF item two</title>
    <link>https://example.org/two</link>
  </item>
</rdf:RDF>`);
    expect(feed.format).toBe('rdf');
    expect(feed.title).toBe('RDF Feed');
    expect(feed.items.map((i) => i.title)).toEqual(['RDF item one', 'RDF item two']);
    expect(feed.items[0].link).toBe('https://example.org/one');
    expect(feed.items[0].timestamp).toBe(Date.UTC(2026, 7, 20, 8));
  });
});

describe('parseFeed: Atom 1.0', () => {
  it('parses entries with id, links, summary, published and categories', () => {
    const feed = parseFeed(atom(`
      <entry>
        <id>tag:example.com,2026:1</id>
        <title>Atom entry</title>
        <link rel="self" href="https://example.com/self"/>
        <link rel="alternate" href="https://example.com/entry-1"/>
        <summary>Summary text</summary>
        <published>2026-08-22T12:00:00Z</published>
        <updated>2026-08-23T12:00:00Z</updated>
        <category term="tech" label="Technology"/>
      </entry>`));
    expect(feed.format).toBe('atom');
    expect(feed.title).toBe('Example Atom');
    expect(feed.items[0]).toMatchObject({
      id: 'tag:example.com,2026:1',
      title: 'Atom entry',
      link: 'https://example.com/entry-1',
      description: 'Summary text',
      timestamp: Date.UTC(2026, 7, 22, 12),
      categories: ['tech'],
    });
  });

  it('prefers a rel-less link when there is no explicit alternate', () => {
    const feed = parseFeed(atom(`
      <entry>
        <title>Links</title>
        <link rel="self" href="https://example.com/self"/>
        <link href="https://example.com/plain"/>
      </entry>`));
    expect(feed.items[0].link).toBe('https://example.com/plain');
  });

  it('falls back to the first link when none is alternate', () => {
    const feed = parseFeed(atom(`
      <entry>
        <title>Only self</title>
        <link rel="self" href="https://example.com/self"/>
      </entry>`));
    expect(feed.items[0].link).toBe('https://example.com/self');
  });

  it('reduces <title type="html"> to text', () => {
    const feed = parseFeed(atom(`
      <entry>
        <title type="html">&lt;b&gt;Bold&lt;/b&gt; headline &amp;amp; more</title>
      </entry>`));
    expect(feed.items[0].title).toBe('Bold headline & more');
  });

  it('uses <content> when there is no summary and picks up its first image', () => {
    const feed = parseFeed(atom(`
      <entry>
        <title>Content</title>
        <content type="html">&lt;p&gt;Body copy&lt;/p&gt;&lt;img src="https://img.example.com/c.jpg"&gt;</content>
      </entry>`));
    expect(feed.items[0].description).toBe('Body copy');
    expect(feed.items[0].imageUrl).toBe('https://img.example.com/c.jpg');
  });

  it('reads an image enclosure link and media:thumbnail', () => {
    const viaLink = parseFeed(atom(`
      <entry>
        <title>Enclosure</title>
        <link rel="enclosure" type="image/jpeg" href="https://img.example.com/enc.jpg"/>
      </entry>`));
    expect(viaLink.items[0].imageUrl).toBe('https://img.example.com/enc.jpg');

    const viaMedia = parseFeed(atom(`
      <entry>
        <title>Thumb</title>
        <media:group><media:thumbnail url="https://img.example.com/yt.jpg"/></media:group>
      </entry>`));
    expect(viaMedia.items[0].imageUrl).toBe('https://img.example.com/yt.jpg');
  });

  it('falls back to updated when published is missing, and id to link', () => {
    const feed = parseFeed(atom(`
      <entry>
        <title>Updated only</title>
        <link href="https://example.com/u"/>
        <updated>2026-08-21T00:00:00Z</updated>
      </entry>`));
    expect(feed.items[0].timestamp).toBe(Date.UTC(2026, 7, 21));
    expect(feed.items[0].id).toBe('https://example.com/u');
  });

  it('strips the feed title suffix from entry titles', () => {
    const feed = parseFeed(atom(`<entry><title>Story – Example Atom</title></entry>`));
    expect(feed.items[0].title).toBe('Story');
  });
});

describe('parseFeed: JSON Feed', () => {
  it('parses a JSON Feed with plain text content', () => {
    const feed = parseFeed(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'JSON Feed',
      items: [{
        id: 42,
        url: 'https://example.com/42',
        title: 'JSON item',
        content_text: 'Plain text body',
        image: 'https://img.example.com/42.jpg',
        date_published: '2026-08-22T12:00:00Z',
        tags: ['a', 'b'],
      }],
    }));
    expect(feed.format).toBe('json');
    expect(feed.title).toBe('JSON Feed');
    expect(feed.items[0]).toMatchObject({
      id: '42',
      link: 'https://example.com/42',
      title: 'JSON item',
      description: 'Plain text body',
      imageUrl: 'https://img.example.com/42.jpg',
      timestamp: Date.UTC(2026, 7, 22, 12),
      categories: ['a', 'b'],
    });
  });

  it('uses content_html when it is the only body, stripping tags and taking its first image', () => {
    const feed = parseFeed(JSON.stringify({
      version: 'https://jsonfeed.org/version/1',
      items: [{
        id: 'h',
        content_html: '<p>Rich <em>body</em></p><img src="https://img.example.com/h.png">',
      }],
    }));
    expect(feed.items[0].description).toBe('Rich body');
    expect(feed.items[0].imageUrl).toBe('https://img.example.com/h.png');
    // No title: derived from the body.
    expect(feed.items[0].title).toBe('Rich body');
  });

  it('does not treat plain-text fields as markup', () => {
    const feed = parseFeed(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      items: [{ id: 'p', title: 'Use <b> tags', content_text: 'a < b && c > d' }],
    }));
    expect(feed.items[0].title).toBe('Use <b> tags');
    expect(feed.items[0].description).toBe('a < b && c > d');
  });

  it('prefers summary over content_text, external_url as a link fallback, banner_image as image fallback', () => {
    const feed = parseFeed(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      items: [{
        title: 'Fallbacks',
        summary: 'Short',
        content_text: 'Long',
        external_url: 'https://elsewhere.example.com/x',
        banner_image: 'https://img.example.com/banner.jpg',
        date_modified: '2026-08-01T00:00:00Z',
      }],
    }));
    expect(feed.items[0].description).toBe('Short');
    expect(feed.items[0].link).toBe('https://elsewhere.example.com/x');
    expect(feed.items[0].id).toBe('https://elsewhere.example.com/x');
    expect(feed.items[0].imageUrl).toBe('https://img.example.com/banner.jpg');
    expect(feed.items[0].timestamp).toBe(Date.UTC(2026, 7, 1));
  });

  it('drops items with neither title nor body', () => {
    const feed = parseFeed(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      items: [{ id: 'empty', url: 'https://example.com/e' }, { id: 'ok', title: 'Kept' }],
    }));
    expect(feed.items.map((i) => i.id)).toEqual(['ok']);
  });

  it('throws FeedParseError for JSON that is not a JSON Feed', () => {
    expect(() => parseFeed('{"hello":"world"}')).toThrow(FeedParseError);
    expect(() => parseFeed('{not json')).toThrow(FeedParseError);
  });
});

describe('parseFeed: rejection', () => {
  it('throws FeedParseError for empty input', () => {
    expect(() => parseFeed('')).toThrow(FeedParseError);
    expect(() => parseFeed('   \n')).toThrow(FeedParseError);
  });

  it('throws FeedParseError for an HTML page', () => {
    expect(() => parseFeed('<!DOCTYPE html><html><head><title>Login</title></head><body>Nope</body></html>'))
      .toThrow(FeedParseError);
  });

  it('throws FeedParseError for an unrelated XML document', () => {
    expect(() => parseFeed('<?xml version="1.0"?><sitemap><url>x</url></sitemap>')).toThrow(FeedParseError);
  });
});

describe('decodeFeedBody', () => {
  const latin1 = (s: string): ArrayBuffer => {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return bytes.buffer;
  };
  const utf8 = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

  it('decodes UTF-8 by default', () => {
    const text = decodeFeedBody(utf8('<rss><channel><title>Café ☕</title></channel></rss>'), null);
    expect(text).toContain('Café ☕');
  });

  it('honours the Content-Type charset', () => {
    const text = decodeFeedBody(latin1('<rss><channel><title>Café</title></channel></rss>'), 'text/xml; charset=ISO-8859-1');
    expect(text).toContain('Café');
  });

  it('honours the XML prolog encoding when the header has none', () => {
    const body = '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>München</title></channel></rss>';
    const text = decodeFeedBody(latin1(body), 'application/rss+xml');
    expect(text).toContain('München');
    expect(parseFeed(text).title).toBe('München');
  });

  it('would mangle latin-1 bytes without the charset hint', () => {
    const text = decodeFeedBody(latin1('<rss><channel><title>Café</title></channel></rss>'), null);
    expect(text).not.toContain('Café');
  });

  it('falls back to UTF-8 for an unknown charset label', () => {
    const text = decodeFeedBody(utf8('<rss><channel><title>Ünïcode</title></channel></rss>'), 'text/xml; charset=x-not-a-charset');
    expect(text).toContain('Ünïcode');
  });
});
