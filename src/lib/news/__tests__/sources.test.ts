import { describe, it, expect } from 'vitest';
import {
  extractYoutubeChannelId,
  googleNewsEdition,
  googleNewsSearchUrl,
  isVirtualSource,
  resolveSource,
  sourceKind,
  subredditFeedUrl,
  youtubeChannelFeedUrl,
} from '../sources';

const CHANNEL_ID = 'UCXuqSBlHAE6Xw-yeJA0Tunw';

describe('sourceKind / isVirtualSource', () => {
  it('classifies each shorthand, case-insensitively, ignoring surrounding whitespace', () => {
    expect(sourceKind('local')).toBe('local');
    expect(sourceKind('  local ')).toBe('local');
    expect(sourceKind('topic:school board')).toBe('topic');
    expect(sourceKind('TOPIC:x')).toBe('topic');
    expect(sourceKind('youtube:abc')).toBe('youtube');
    expect(sourceKind('Reddit:news')).toBe('reddit');
    expect(sourceKind('https://example.com/feed')).toBe('feed');
    expect(sourceKind('')).toBe('feed');
  });

  it('only real URLs are non-virtual', () => {
    expect(isVirtualSource('local')).toBe(true);
    expect(isVirtualSource('topic:x')).toBe(true);
    expect(isVirtualSource('https://example.com/rss')).toBe(false);
  });
});

describe('googleNewsEdition', () => {
  it.each([
    ['en-US', { hl: 'en-US', gl: 'US', ceid: 'US:en' }],
    ['de-DE', { hl: 'de', gl: 'DE', ceid: 'DE:de' }],
    ['fr-FR', { hl: 'fr', gl: 'FR', ceid: 'FR:fr' }],
    ['es-ES', { hl: 'es', gl: 'ES', ceid: 'ES:es' }],
    ['nl-NL', { hl: 'nl', gl: 'NL', ceid: 'NL:nl' }],
    ['pt-BR', { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' }],
    ['da-DK', { hl: 'da', gl: 'DK', ceid: 'DK:da' }],
  ])('maps %s to its Google News edition', (locale, expected) => {
    expect(googleNewsEdition(locale)).toEqual(expected);
  });

  it('falls back to the US edition for undefined, unknown, or odd tags', () => {
    const us = { hl: 'en-US', gl: 'US', ceid: 'US:en' };
    expect(googleNewsEdition(undefined)).toEqual(us);
    expect(googleNewsEdition('xx-YY')).toEqual(us);
    expect(googleNewsEdition('en-GB')).toEqual(us);
  });

  it('matches on the language alone, tolerating underscores and case', () => {
    expect(googleNewsEdition('de_AT')).toEqual({ hl: 'de', gl: 'DE', ceid: 'DE:de' });
    expect(googleNewsEdition('FR')).toEqual({ hl: 'fr', gl: 'FR', ceid: 'FR:fr' });
  });
});

describe('googleNewsSearchUrl', () => {
  it('URL-encodes the query and appends the edition', () => {
    expect(googleNewsSearchUrl('Prior Lake, MN', 'en-US'))
      .toBe('https://news.google.com/rss/search?q=Prior%20Lake%2C%20MN&hl=en-US&gl=US&ceid=US:en');
  });

  it('trims the query and uses the locale edition', () => {
    expect(googleNewsSearchUrl('  München & Umgebung ', 'de-DE'))
      .toBe('https://news.google.com/rss/search?q=M%C3%BCnchen%20%26%20Umgebung&hl=de&gl=DE&ceid=DE:de');
  });
});

describe('youtubeChannelFeedUrl', () => {
  it('builds the uploads feed for a valid channel id', () => {
    expect(youtubeChannelFeedUrl(CHANNEL_ID))
      .toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
    expect(youtubeChannelFeedUrl(`  ${CHANNEL_ID}  `)).toContain(CHANNEL_ID);
  });

  it('rejects anything that is not a channel id', () => {
    expect(youtubeChannelFeedUrl('')).toBeNull();
    expect(youtubeChannelFeedUrl('@handle')).toBeNull();
    expect(youtubeChannelFeedUrl('UCshort')).toBeNull();
    expect(youtubeChannelFeedUrl('XX' + 'a'.repeat(22))).toBeNull();
    expect(youtubeChannelFeedUrl(`${CHANNEL_ID}&x=1`)).toBeNull();
    expect(youtubeChannelFeedUrl('https://www.youtube.com/channel/' + CHANNEL_ID)).toBeNull();
  });
});

describe('subredditFeedUrl', () => {
  it('builds the newest-posts feed', () => {
    expect(subredditFeedUrl('minnesota')).toBe('https://www.reddit.com/r/minnesota/new/.rss');
  });

  it('accepts r/ and /r/ prefixes and trailing slashes', () => {
    expect(subredditFeedUrl('r/minnesota')).toBe('https://www.reddit.com/r/minnesota/new/.rss');
    expect(subredditFeedUrl('/r/minnesota/')).toBe('https://www.reddit.com/r/minnesota/new/.rss');
    expect(subredditFeedUrl('R/Minnesota')).toBe('https://www.reddit.com/r/Minnesota/new/.rss');
    expect(subredditFeedUrl('  r/space  ')).toBe('https://www.reddit.com/r/space/new/.rss');
  });

  it('rejects bad names', () => {
    expect(subredditFeedUrl('')).toBeNull();
    expect(subredditFeedUrl('a')).toBeNull();
    expect(subredditFeedUrl('a'.repeat(22))).toBeNull();
    expect(subredditFeedUrl('has space')).toBeNull();
    expect(subredditFeedUrl('with-dash')).toBeNull();
    expect(subredditFeedUrl('news/../etc')).toBeNull();
    expect(subredditFeedUrl('https://www.reddit.com/r/news')).toBeNull();
  });
});

describe('extractYoutubeChannelId', () => {
  it('accepts a bare id', () => {
    expect(extractYoutubeChannelId(CHANNEL_ID)).toBe(CHANNEL_ID);
    expect(extractYoutubeChannelId(`  ${CHANNEL_ID}\n`)).toBe(CHANNEL_ID);
  });

  it('pulls the id out of a channel URL', () => {
    expect(extractYoutubeChannelId(`https://www.youtube.com/channel/${CHANNEL_ID}`)).toBe(CHANNEL_ID);
    expect(extractYoutubeChannelId(`https://www.youtube.com/channel/${CHANNEL_ID}/videos?x=1`)).toBe(CHANNEL_ID);
  });

  it('pulls the id out of a feed URL', () => {
    expect(extractYoutubeChannelId(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`)).toBe(CHANNEL_ID);
  });

  it('returns null for handles and other pastes', () => {
    expect(extractYoutubeChannelId('@veritasium')).toBeNull();
    expect(extractYoutubeChannelId('https://www.youtube.com/@veritasium')).toBeNull();
    expect(extractYoutubeChannelId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractYoutubeChannelId('')).toBeNull();
  });
});

describe('resolveSource', () => {
  it('local with a location builds a Google News search for that place', () => {
    const r = resolveSource('local', { locale: 'en-US', locationName: 'Prior Lake, MN' });
    expect(r.kind).toBe('local');
    expect(r.argument).toBe('Prior Lake, MN');
    expect(r.url).toBe('https://news.google.com/rss/search?q=Prior%20Lake%2C%20MN&hl=en-US&gl=US&ceid=US:en');
  });

  it('local without a location cannot be built', () => {
    expect(resolveSource('local', { locale: 'en-US' })).toEqual({ kind: 'local', url: null, argument: undefined });
    expect(resolveSource('local', { locationName: '   ' }).url).toBeNull();
  });

  it('topic: searches the keywords in the locale edition', () => {
    const r = resolveSource('topic: school board ', { locale: 'de-DE' });
    expect(r).toEqual({
      kind: 'topic',
      argument: 'school board',
      url: 'https://news.google.com/rss/search?q=school%20board&hl=de&gl=DE&ceid=DE:de',
    });
  });

  it('topic: with no keywords cannot be built', () => {
    expect(resolveSource('topic:', {})).toEqual({ kind: 'topic', url: null, argument: '' });
  });

  it('youtube: and reddit: delegate to their validators', () => {
    expect(resolveSource(`youtube:${CHANNEL_ID}`, {})).toEqual({
      kind: 'youtube',
      argument: CHANNEL_ID,
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    });
    expect(resolveSource('youtube:@handle', {}).url).toBeNull();
    expect(resolveSource('reddit:r/space', {})).toEqual({
      kind: 'reddit',
      argument: 'r/space',
      url: 'https://www.reddit.com/r/space/new/.rss',
    });
    expect(resolveSource('reddit:bad name', {}).url).toBeNull();
  });

  it('a real URL passes through trimmed; an empty string yields no URL', () => {
    expect(resolveSource('  https://example.com/rss ', {})).toEqual({ kind: 'feed', url: 'https://example.com/rss' });
    expect(resolveSource('', {})).toEqual({ kind: 'feed', url: null });
  });
});
