import { describe, it, expect, afterEach } from 'vitest';
import {
  stocksUrl,
  cryptoUrl,
  newsUrl,
  airQualityUrl,
  sportsUrl,
  standingsUrl,
  trafficUrl,
  todoistUrl,
  rainMapUrl,
  historyUrl,
  quoteUrl,
  dadJokeUrl,
  photoSlideshowUrl,
  videoModuleUrl,
  choresUrl,
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
});

// ── URL builders with defaults ──────────────────────────────────

describe('newsUrl', () => {
  it('builds URL with encoded feed', () => {
    expect(newsUrl({ feedUrl: 'https://example.com/feed.xml' }))
      .toBe('/api/news?feed=https%3A%2F%2Fexample.com%2Ffeed.xml');
  });

  it('uses empty string when feedUrl is missing', () => {
    expect(newsUrl({})).toBe('/api/news?feed=');
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

describe('standingsUrl', () => {
  it('defaults league to nfl and grouping to division', () => {
    expect(standingsUrl({})).toBe('/api/standings?league=nfl&grouping=division');
  });

  it('uses provided league and grouping', () => {
    expect(standingsUrl({ league: 'nba', grouping: 'conference' }))
      .toBe('/api/standings?league=nba&grouping=conference');
  });
});

describe('photoSlideshowUrl', () => {
  it('includes directory when provided', () => {
    expect(photoSlideshowUrl({ directory: 'vacation/2026' }))
      .toBe('/api/backgrounds?directory=vacation%2F2026');
  });

  it('uses bare endpoint when directory is missing', () => {
    expect(photoSlideshowUrl({})).toBe('/api/backgrounds');
  });

  it('returns local endpoint when source is local', () => {
    expect(photoSlideshowUrl({ source: 'local', directory: 'pics' }))
      .toBe('/api/backgrounds?directory=pics');
  });

  it('returns immich endpoint when source is immich', () => {
    const url = photoSlideshowUrl({ source: 'immich' });
    expect(url).toBe('/api/immich/photos?');
  });

  it('includes albumId for immich source', () => {
    const url = photoSlideshowUrl({ source: 'immich', immichAlbumId: 'abc-123' });
    expect(url).toContain('albumId=abc-123');
  });

  it('includes personId for immich source', () => {
    const url = photoSlideshowUrl({ source: 'immich', immichPersonId: 'xyz' });
    expect(url).toContain('personId=xyz');
  });

  it('includes favorites flag for immich source', () => {
    const url = photoSlideshowUrl({ source: 'immich', immichFavoritesOnly: true });
    expect(url).toContain('favorites=true');
  });

  it('includes count for immich source', () => {
    const url = photoSlideshowUrl({ source: 'immich', immichCount: 20 });
    expect(url).toContain('count=20');
  });

  it('combines multiple immich filters', () => {
    const url = photoSlideshowUrl({
      source: 'immich',
      immichAlbumId: 'album-1',
      immichPersonId: 'person-1',
      immichFavoritesOnly: true,
      immichCount: 100,
    });
    expect(url).toContain('albumId=album-1');
    expect(url).toContain('personId=person-1');
    expect(url).toContain('favorites=true');
    expect(url).toContain('count=100');
  });

  it('adds media=both to the local endpoint', () => {
    expect(photoSlideshowUrl({ mediaTypes: 'both' })).toBe('/api/backgrounds?media=both');
  });

  it('adds media=videos alongside a directory', () => {
    expect(photoSlideshowUrl({ directory: 'clips', mediaTypes: 'videos' }))
      .toBe('/api/backgrounds?directory=clips&media=videos');
  });

  it('omits media= for photo-only configs (legacy string[] back-compat)', () => {
    expect(photoSlideshowUrl({ mediaTypes: 'photos' })).toBe('/api/backgrounds');
    expect(photoSlideshowUrl({})).toBe('/api/backgrounds');
  });

  it('adds media= for immich sources', () => {
    expect(photoSlideshowUrl({ source: 'immich', mediaTypes: 'videos' }))
      .toBe('/api/immich/photos?media=videos');
    expect(photoSlideshowUrl({ source: 'immich', immichAlbumId: 'a1', mediaTypes: 'both' }))
      .toBe('/api/immich/photos?albumId=a1&media=both');
  });

  it('omits media= for photo-only immich configs (legacy string[] back-compat)', () => {
    expect(photoSlideshowUrl({ source: 'immich', mediaTypes: 'photos' }))
      .toBe('/api/immich/photos?');
  });

  it('returns icloud endpoint with the album link when source is icloud', () => {
    expect(photoSlideshowUrl({ source: 'icloud', icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC' }))
      .toBe(`/api/icloud/photos?album=${encodeURIComponent('https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC')}`);
  });

  it('adds media= for icloud sources', () => {
    expect(photoSlideshowUrl({ source: 'icloud', icloudAlbumUrl: 'B125ON9t3mbLNC', mediaTypes: 'both' }))
      .toBe('/api/icloud/photos?album=B125ON9t3mbLNC&media=both');
  });

  it('omits media= for photo-only icloud configs (legacy string[] back-compat)', () => {
    expect(photoSlideshowUrl({ source: 'icloud', icloudAlbumUrl: 'B125ON9t3mbLNC', mediaTypes: 'photos' }))
      .toBe('/api/icloud/photos?album=B125ON9t3mbLNC');
  });

  it('omits album= when the icloud link is unset', () => {
    expect(photoSlideshowUrl({ source: 'icloud' })).toBe('/api/icloud/photos?');
  });

  it('returns the onedrive endpoint for source onedrive', () => {
    expect(photoSlideshowUrl({ source: 'onedrive' })).toBe('/api/onedrive/photos');
  });

  it('includes folderId and count for onedrive source', () => {
    const url = photoSlideshowUrl({ source: 'onedrive', onedriveFolderId: 'fld!1', onedriveCount: 20 });
    // URLSearchParams form-encodes '!' — the route decodes it back to fld!1.
    expect(url).toBe('/api/onedrive/photos?folderId=fld%211&count=20');
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

// ── Static URL builders ─────────────────────────────────────────

describe('static URL builders', () => {
  it('airQualityUrl', () => expect(airQualityUrl()).toBe('/api/air-quality'));
  it('todoistUrl', () => expect(todoistUrl()).toBe('/api/todoist'));
  it('rainMapUrl', () => expect(rainMapUrl()).toBe('/api/rain-map'));
  it('historyUrl defaults both sources', () => expect(historyUrl({})).toBe('/api/history?sources=muffinlabs,wikipedia'));
  it('historyUrl with only wikipedia', () => expect(historyUrl({ sourceMuffinLabs: false })).toBe('/api/history?sources=wikipedia'));
  it('historyUrl with only muffinlabs', () => expect(historyUrl({ sourceWikipedia: false })).toBe('/api/history?sources=muffinlabs'));
  it('quoteUrl', () => expect(quoteUrl()).toBe('/api/quote'));
  it('dadJokeUrl', () => expect(dadJokeUrl()).toBe('/api/jokes'));
  it('choresUrl', () => expect(choresUrl()).toBe('/api/chores'));
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
