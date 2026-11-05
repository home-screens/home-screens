import { describe, it, expect, afterEach } from 'vitest';
import {
  stocksUrl,
  cryptoUrl,
  newsUrl,
  newsEditorUrl,
  airQualityUrl,
  sportsUrl,
  sportsTeamUrl,
  standingsUrl,
  trafficUrl,
  todoistUrl,
  rainMapUrl,
  historyUrl,
  quoteUrl,
  dadJokeUrl,
  photoSlideshowUrl,
  isLibraryListUrl,
  videoModuleUrl,
  choresUrl,
  choreToggleUrl,
  choresDataUrl,
  mealsDataUrl,
  FETCH_KEY_REGISTRY,
  registerFetchKey,
} from '@/lib/fetch-keys';

// ── URL builders that return null when config is empty ──────────

describe('stocksUrl', () => {
  it('builds URL with encoded symbols and default day chart', () => {
    expect(stocksUrl({ symbols: 'AAPL,MSFT' })).toBe('/api/stocks?symbols=AAPL%2CMSFT&charts=day');
  });

  it('maps sparklineMode day to charts=day', () => {
    expect(stocksUrl({ symbols: 'AAPL', sparklineMode: 'day' })).toBe('/api/stocks?symbols=AAPL&charts=day');
  });

  it('maps sparklineMode week to charts=week', () => {
    expect(stocksUrl({ symbols: 'AAPL', sparklineMode: 'week' })).toBe('/api/stocks?symbols=AAPL&charts=week');
  });

  it('fetches only the day leg for views that never draw charts', () => {
    // The editor hides the chart selects outside cards but keeps the value.
    for (const view of ['ticker', 'table', 'compact']) {
      expect(stocksUrl({ symbols: 'AAPL', view, sparklineMode: 'both' })).toBe('/api/stocks?symbols=AAPL&charts=day');
    }
  });

  it('fetches only the day leg when the trend line is hidden', () => {
    expect(stocksUrl({ symbols: 'AAPL', view: 'cards', showSparkline: false, sparklineMode: 'week' }))
      .toBe('/api/stocks?symbols=AAPL&charts=day');
  });

  it('maps sparklineMode both to charts=day,week', () => {
    expect(stocksUrl({ symbols: 'AAPL', sparklineMode: 'both' })).toBe('/api/stocks?symbols=AAPL&charts=day,week');
  });

  it('single view fetches only the first configured symbol', () => {
    // The tile shows one symbol; fetching the rest would spend upstream calls
    // for nothing and let a failure on the first symbol swap in the second.
    expect(stocksUrl({ symbols: 'AAPL,GOOGL,MSFT', view: 'single' }))
      .toBe('/api/stocks?symbols=AAPL&charts=day');
    expect(stocksUrl({ symbols: ' AAPL , MSFT', view: 'single' }))
      .toBe('/api/stocks?symbols=AAPL&charts=day');
  });

  it('single view fetches the week leg its chart content asks for, with the trend line toggled off', () => {
    // The editor hides the trend-line toggle for the single view but keeps
    // its value; the tile always draws its charts, so it must not gate the legs.
    expect(stocksUrl({ symbols: 'AAPL', view: 'single', showSparkline: false, sparklineMode: 'week' }))
      .toBe('/api/stocks?symbols=AAPL&charts=week');
    expect(stocksUrl({ symbols: 'AAPL', view: 'single', showSparkline: false, sparklineMode: 'both' }))
      .toBe('/api/stocks?symbols=AAPL&charts=day,week');
  });

  it('single view defaults to the day leg', () => {
    expect(stocksUrl({ symbols: 'AAPL', view: 'single' })).toBe('/api/stocks?symbols=AAPL&charts=day');
  });

  it('blank symbols yield no URL', () => {
    expect(stocksUrl({ symbols: '   ', view: 'single' })).toBeNull();
  });

  it('treats unknown sparklineMode as day', () => {
    expect(stocksUrl({ symbols: 'AAPL', sparklineMode: 'nope' })).toBe('/api/stocks?symbols=AAPL&charts=day');
  });

  it('returns null when symbols is missing', () => {
    expect(stocksUrl({})).toBeNull();
  });

  it('returns null when symbols is empty string', () => {
    expect(stocksUrl({ symbols: '' })).toBeNull();
  });
});

describe('cryptoUrl', () => {
  it('builds URL with encoded ids', () => {
    expect(cryptoUrl({ ids: 'bitcoin,ethereum' })).toBe('/api/crypto?ids=bitcoin%2Cethereum');
  });

  it('returns null when ids is missing', () => {
    expect(cryptoUrl({})).toBeNull();
  });

  it('returns null when ids is empty string', () => {
    expect(cryptoUrl({ ids: '' })).toBeNull();
  });
});

describe('trafficUrl', () => {
  it('builds URL with JSON-encoded routes', () => {
    const routes = [{ origin: 'A', destination: 'B' }];
    const url = trafficUrl({ routes });
    expect(url).toBe(`/api/traffic?routes=${encodeURIComponent(JSON.stringify(routes))}`);
  });

  it('returns null when routes is missing', () => {
    expect(trafficUrl({})).toBeNull();
  });

  it('returns null when routes is empty array', () => {
    expect(trafficUrl({ routes: [] })).toBeNull();
  });

  it('leaves out a route still missing an address, so it is never looked up', () => {
    const home = { label: 'Home', origin: '1 Main St', destination: '2 Oak Ave' };
    const routes = [home, { label: 'New route', origin: '1 Main St', destination: '  ' }, { label: 'Gym', origin: '', destination: '' }];
    expect(trafficUrl({ routes })).toBe(`/api/traffic?routes=${encodeURIComponent(JSON.stringify([home]))}`);
  });

  it('returns null when no route has both addresses yet', () => {
    expect(trafficUrl({ routes: [{ label: 'New route', origin: '1 Main St', destination: '' }] })).toBeNull();
  });
});

// ── URL builders with defaults ──────────────────────────────────

describe('newsUrl', () => {
  it('builds URL with one encoded feed', () => {
    expect(newsUrl({ feeds: [{ url: 'https://example.com/feed.xml' }] }))
      .toBe('/api/news?feed=https%3A%2F%2Fexample.com%2Ffeed.xml');
  });

  it('joins several feeds as repeated feed= params in order', () => {
    expect(newsUrl({ feeds: [{ url: 'https://a.example/rss' }, { url: 'local' }, { url: 'topic:school board' }] }))
      .toBe('/api/news?feed=https%3A%2F%2Fa.example%2Frss&feed=local&feed=topic%3Aschool%20board');
  });

  it('returns null when there are no feeds', () => {
    expect(newsUrl({})).toBeNull();
    expect(newsUrl({ feeds: [] })).toBeNull();
    expect(newsUrl({ feeds: 'nope' })).toBeNull();
  });

  it('trims URLs and drops blank or malformed entries', () => {
    expect(newsUrl({ feeds: [{ url: '  https://a.example/rss  ' }, { url: '   ' }, {}, null, { url: 42 }] }))
      .toBe('/api/news?feed=https%3A%2F%2Fa.example%2Frss');
    expect(newsUrl({ feeds: [{ url: ' ' }] })).toBeNull();
  });

  it('dedupes repeated URLs so the prefetch key matches the module fetch', () => {
    expect(newsUrl({ feeds: [{ url: 'https://a.example/rss' }, { url: ' https://a.example/rss' }, { url: 'https://b.example/rss' }] }))
      .toBe('/api/news?feed=https%3A%2F%2Fa.example%2Frss&feed=https%3A%2F%2Fb.example%2Frss');
  });
});

describe('newsEditorUrl', () => {
  it('matches newsUrl when no feed is marked home-network', () => {
    const feeds = [{ url: 'https://a.example/rss' }, { url: 'local' }];
    expect(newsEditorUrl(feeds)).toBe(newsUrl({ feeds }));
  });

  it('names the home-network feeds so the route can check them before a save', () => {
    expect(newsEditorUrl([{ url: 'http://192.168.1.5/feed', homeNetwork: true }, { url: 'https://a.example/rss' }]))
      .toBe('/api/news?feed=http%3A%2F%2F192.168.1.5%2Ffeed&feed=https%3A%2F%2Fa.example%2Frss&lan=http%3A%2F%2F192.168.1.5%2Ffeed');
  });

  it('returns null when there is nothing to fetch', () => {
    expect(newsEditorUrl(undefined)).toBeNull();
    expect(newsEditorUrl([])).toBeNull();
    expect(newsEditorUrl([{ url: '   ' }])).toBeNull();
  });
});

describe('sportsUrl', () => {
  it('defaults leagues to nfl,nba', () => {
    expect(sportsUrl({})).toBe('/api/sports?leagues=nfl%2Cnba');
  });

  it('uses provided leagues', () => {
    expect(sportsUrl({ leagues: ['mlb', 'nhl'] })).toBe('/api/sports?leagues=mlb%2Cnhl');
  });
});

describe('sportsTeamUrl', () => {
  it('is null with no favorites, so the team view fetches nothing', () => {
    expect(sportsTeamUrl({})).toBeNull();
    expect(sportsTeamUrl({ favoriteTeams: [] })).toBeNull();
  });

  it('keeps the favorites in priority order and stops at the route cap', () => {
    expect(sportsTeamUrl({ leagues: ['nfl', 'ncaaf'], favoriteTeams: ['ncaaf:MINN', 'nfl:MIN'] })).toBe('/api/sports/team?teams=ncaaf%3AMINN%2Cnfl%3AMIN');
    const nine = Array.from({ length: 9 }, (_, i) => `nfl:T${i}`);
    expect(sportsTeamUrl({ leagues: ['nfl'], favoriteTeams: nine })).toBe(`/api/sports/team?teams=${encodeURIComponent(nine.slice(0, 8).join(','))}`);
  });

  it('leaves out favorites whose league is switched off', () => {
    const favoriteTeams = ['ncaaf:MINN', 'nfl:MIN', 'epl:ARS'];
    expect(sportsTeamUrl({ leagues: ['ncaaf'], favoriteTeams })).toBe('/api/sports/team?teams=ncaaf%3AMINN');
    // No leagues saved means the default NFL and NBA.
    expect(sportsTeamUrl({ favoriteTeams })).toBe('/api/sports/team?teams=nfl%3AMIN');
    expect(sportsTeamUrl({ leagues: ['nba'], favoriteTeams })).toBeNull();
  });

  it('caps after leaving out the switched-off leagues, so the eight shown teams are fetched', () => {
    const favoriteTeams = ['epl:ARS', ...Array.from({ length: 8 }, (_, i) => `nfl:T${i}`)];
    expect(sportsTeamUrl({ leagues: ['nfl'], favoriteTeams })).toBe(`/api/sports/team?teams=${encodeURIComponent(favoriteTeams.slice(1).join(','))}`);
  });
});

describe('standingsUrl', () => {
  /* The defaults have to be the registry's, not this builder's own: a URL
   * built with a different default than the module renders with asks for one
   * grouping and labels the answer as another. A meta ratchet holds the two
   * together; this pins the values the registry currently advertises. */
  it('defaults to the league and grouping the registry advertises', () => {
    expect(standingsUrl({})).toBe('/api/standings?league=nba&grouping=conference');
  });

  it('uses provided league and grouping', () => {
    expect(standingsUrl({ league: 'nba', grouping: 'conference' }))
      .toBe('/api/standings?league=nba&grouping=conference');
  });
});

describe('photoSlideshowUrl', () => {
  const MEDIA = '/api/photo-source/media';

  it('lists a library folder', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'library', folder: 'vacation/2026' } }))
      .toBe(`${MEDIA}?kind=library&folder=vacation%2F2026`);
  });

  it('lists the top level for a library source with no folder', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'library', folder: '' } })).toBe(`${MEDIA}?kind=library`);
  });

  it('falls back to the top level when the config has no usable source', () => {
    expect(photoSlideshowUrl({})).toBe(`${MEDIA}?kind=library`);
    expect(photoSlideshowUrl({ photoSource: { kind: 'dropbox' } })).toBe(`${MEDIA}?kind=library`);
  });

  it('never sends a count for a library folder, which plays all of itself', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'library', folder: 'a' }, count: 20 })).toBe(`${MEDIA}?kind=library&folder=a`);
  });

  it('carries every Immich filter and the count', () => {
    const url = photoSlideshowUrl({
      photoSource: { kind: 'immich', albumIds: ['abc-123', 'abc-124'], personIds: ['def-456'], excludePersonIds: ['abc-789'], favoritesOnly: true },
      count: 100,
    });
    expect(url).toBe(`${MEDIA}?kind=immich&albums=abc-123%2Cabc-124&people=def-456&exclude=abc-789&favorites=1&count=100`);
  });

  it('carries the iCloud link and the OneDrive folder', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0aG' } }))
      .toBe(`${MEDIA}?kind=icloud&link=${encodeURIComponent('https://www.icloud.com/sharedalbum/#B0aG')}`);
    expect(photoSlideshowUrl({ photoSource: { kind: 'onedrive', folderId: 'ABC!123', folderName: 'Family' }, count: 40 }))
      .toBe(`${MEDIA}?kind=onedrive&folderId=ABC%21123&count=40`);
  });

  it('holds an Unsplash count to one request, and names the search words', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'unsplash', query: 'mountains lake' }, count: 100 }))
      .toBe(`${MEDIA}?kind=unsplash&query=mountains+lake&count=30`);
  });

  it('asks for videos only from sources that can play them', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'library', folder: 'clips' }, mediaTypes: 'videos' }))
      .toBe(`${MEDIA}?kind=library&folder=clips&media=videos`);
    expect(photoSlideshowUrl({ photoSource: { kind: 'immich' }, mediaTypes: 'both' })).toBe(`${MEDIA}?kind=immich&media=both`);
    expect(photoSlideshowUrl({ photoSource: { kind: 'onedrive', folderId: 'A!1' }, mediaTypes: 'both' })).toBe(`${MEDIA}?kind=onedrive&folderId=A%211`);
    expect(photoSlideshowUrl({ photoSource: { kind: 'nasa' }, mediaTypes: 'videos' })).toBe(`${MEDIA}?kind=nasa`);
  });

  it('leaves media off for photos, the default', () => {
    expect(photoSlideshowUrl({ photoSource: { kind: 'library', folder: '' }, mediaTypes: 'photos' })).toBe(`${MEDIA}?kind=library`);
  });
});

describe('videoModuleUrl', () => {
  it('returns null for URL-sourced videos (no fetch needed)', () => {
    expect(videoModuleUrl({ source: 'url', url: 'https://example.com/a.mp4' })).toBeNull();
  });

  it('returns null when no file is selected yet', () => {
    expect(videoModuleUrl({ source: 'file' })).toBeNull();
  });

  it('builds a point lookup for a root file', () => {
    expect(videoModuleUrl({ source: 'file', file: 'family.mp4' }))
      .toBe('/api/backgrounds?media=videos&file=family.mp4');
  });

  it('URL-encodes a nested file path', () => {
    expect(videoModuleUrl({ source: 'file', file: 'clips/family.mp4' }))
      .toBe('/api/backgrounds?media=videos&file=clips%2Ffamily.mp4');
  });
});

describe('isLibraryListUrl', () => {
  it('is true for a library source\'s list', () => {
    expect(isLibraryListUrl('/api/photo-source/media?kind=library')).toBe(true);
    expect(isLibraryListUrl('/api/photo-source/media?kind=library&folder=a&media=both')).toBe(true);
  });

  it('is false for other sources, the video module\'s lookup and other routes', () => {
    expect(isLibraryListUrl('/api/photo-source/media?kind=immich')).toBe(false);
    expect(isLibraryListUrl('/api/backgrounds?file=a.mp4&media=videos')).toBe(false);
    expect(isLibraryListUrl('/api/backgrounds?directory=a')).toBe(false);
    expect(isLibraryListUrl('/api/weather')).toBe(false);
  });

  it('agrees with the URLs the slideshow and video modules build', () => {
    expect(isLibraryListUrl(photoSlideshowUrl({ photoSource: { kind: 'library', folder: 'Favorites' }, mediaTypes: 'both' }))).toBe(true);
    expect(isLibraryListUrl(photoSlideshowUrl({}))).toBe(true);
    expect(isLibraryListUrl(photoSlideshowUrl({ photoSource: { kind: 'immich', albumId: 'a1' } }))).toBe(false);
    expect(isLibraryListUrl(videoModuleUrl({ source: 'file', file: 'clips/a.mp4' })!)).toBe(false);
  });
});

// ── Static URL builders ─────────────────────────────────────────

describe('static URL builders', () => {
  it('airQualityUrl', () => expect(airQualityUrl()).toBe('/api/air-quality'));
  it('todoistUrl', () => expect(todoistUrl()).toBe('/api/todoist'));
  it('rainMapUrl', () => expect(rainMapUrl()).toBe('/api/rain-map'));
  it('historyUrl defaults both sources', () => expect(historyUrl({})).toBe('/api/history?sources=muffinlabs,wikipedia'));
  it('historyUrl with only wikipedia', () => expect(historyUrl({ sourceMuffinLabs: false })).toBe('/api/history?sources=wikipedia'));
  it('historyUrl names the household day when given, so the day turning refetches', () =>
    expect(historyUrl({}, { today: '2026-09-24' })).toBe('/api/history?sources=muffinlabs,wikipedia&day=2026-09-24'));
  it('historyUrl with only muffinlabs', () => expect(historyUrl({ sourceWikipedia: false })).toBe('/api/history?sources=muffinlabs'));
  it('quoteUrl', () => expect(quoteUrl()).toBe('/api/quote'));
  it('dadJokeUrl', () => expect(dadJokeUrl()).toBe('/api/jokes'));
  // A wall reads the recent history; a tick goes to the route itself.
  it('choresUrl', () => expect(choresUrl()).toBe('/api/chores?days=31'));
  it('choreToggleUrl', () => expect(choreToggleUrl()).toBe('/api/chores'));
  it('choresDataUrl', () => expect(choresDataUrl()).toBe('/api/chores/data'));
  it('mealsDataUrl', () => expect(mealsDataUrl()).toBe('/api/meals/data'));
});

// ── FETCH_KEY_REGISTRY ──────────────────────────────────────────

describe('FETCH_KEY_REGISTRY', () => {
  it('has entries for all data-fetching module types', () => {
    const expectedTypes = [
      'stock-ticker', 'crypto', 'news', 'air-quality', 'sports',
      'standings', 'traffic', 'todoist', 'rain-map', 'history',
      'quote', 'dad-joke', 'photo-slideshow', 'fullscreen-photo',
      'chore-chart', 'fullscreen-chore-chart',
      'meal-planner', 'fullscreen-meal-planner',
    ];
    for (const type of expectedTypes) {
      expect(FETCH_KEY_REGISTRY).toHaveProperty(type);
    }
  });

  it('every entry has a buildUrl function and positive ttlMs', () => {
    for (const [_type, entry] of Object.entries(FETCH_KEY_REGISTRY)) {
      expect(typeof entry.buildUrl).toBe('function');
      expect(entry.ttlMs).toBeGreaterThan(0);
      // Verify the function is callable with empty config
      expect(() => entry.buildUrl({})).not.toThrow();
    }
  });

  it('buildUrl references match the standalone URL builder functions', () => {
    expect(FETCH_KEY_REGISTRY['stock-ticker'].buildUrl).toBe(stocksUrl);
    expect(FETCH_KEY_REGISTRY.crypto.buildUrl).toBe(cryptoUrl);
    expect(FETCH_KEY_REGISTRY.news.buildUrl).toBe(newsUrl);
    expect(FETCH_KEY_REGISTRY['air-quality'].buildUrl).toBe(airQualityUrl);
    expect(FETCH_KEY_REGISTRY.sports.buildUrl).toBe(sportsUrl);
    expect(FETCH_KEY_REGISTRY.standings.buildUrl).toBe(standingsUrl);
    expect(FETCH_KEY_REGISTRY.traffic.buildUrl).toBe(trafficUrl);
    expect(FETCH_KEY_REGISTRY.todoist.buildUrl).toBe(todoistUrl);
    expect(FETCH_KEY_REGISTRY['rain-map'].buildUrl).toBe(rainMapUrl);
    expect(FETCH_KEY_REGISTRY.history.buildUrl).toBe(historyUrl);
    expect(FETCH_KEY_REGISTRY.quote.buildUrl).toBe(quoteUrl);
    expect(FETCH_KEY_REGISTRY['dad-joke'].buildUrl).toBe(dadJokeUrl);
    expect(FETCH_KEY_REGISTRY['photo-slideshow'].buildUrl).toBe(photoSlideshowUrl);
    expect(FETCH_KEY_REGISTRY['fullscreen-photo'].buildUrl).toBe(photoSlideshowUrl);
    expect(FETCH_KEY_REGISTRY.video.buildUrl).toBe(videoModuleUrl);
    expect(FETCH_KEY_REGISTRY['chore-chart'].buildUrl).toBe(choresUrl);
    expect(FETCH_KEY_REGISTRY['fullscreen-chore-chart'].buildUrl).toBe(choresUrl);
    expect(FETCH_KEY_REGISTRY['fullscreen-meal-planner'].buildUrl).toBe(mealsDataUrl);
  });
});

// ── registerFetchKey (plugin support) ─────────────────────────────

describe('registerFetchKey', () => {
  afterEach(() => {
    // Clean up test registrations
    delete FETCH_KEY_REGISTRY['plugin:test-widget'];
  });

  it('adds a new entry to the registry', () => {
    const builder = () => '/api/plugins/test';
    registerFetchKey('plugin:test-widget', { buildUrl: builder, ttlMs: 60_000 });
    expect(FETCH_KEY_REGISTRY['plugin:test-widget']).toBeDefined();
    expect(FETCH_KEY_REGISTRY['plugin:test-widget'].buildUrl).toBe(builder);
    expect(FETCH_KEY_REGISTRY['plugin:test-widget'].ttlMs).toBe(60_000);
  });

  it('overwrites an existing entry with the same key', () => {
    const builder1 = () => '/api/v1';
    const builder2 = () => '/api/v2';
    registerFetchKey('plugin:test-widget', { buildUrl: builder1, ttlMs: 30_000 });
    registerFetchKey('plugin:test-widget', { buildUrl: builder2, ttlMs: 60_000 });
    expect(FETCH_KEY_REGISTRY['plugin:test-widget'].buildUrl).toBe(builder2);
    expect(FETCH_KEY_REGISTRY['plugin:test-widget'].ttlMs).toBe(60_000);
  });
});
