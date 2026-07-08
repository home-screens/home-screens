import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Network stubbing for display-module data. All module data is fetched
 * client-side (useSharedDisplayData + useFetchData), so `page.route`
 * intercepts every request at the browser boundary — the app is left
 * unmodified and no request escapes to a real upstream.
 *
 * Each stub key maps to a fixture JSON file under e2e/fixtures/module-data/
 * and an API route glob. Weather is matched regardless of its `?provider=`
 * query so all 9 providers resolve to the same fixture.
 */

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'module-data');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}

/** Stub key → { glob, fixture file }. The key is what specs pass in `overrides`. */
const STUBS: Record<string, { glob: string; file: string }> = {
  weather:      { glob: '**/api/weather*',      file: 'weather' },
  calendar:     { glob: '**/api/calendar*',     file: 'calendar' },
  news:         { glob: '**/api/news*',         file: 'news' },
  stocks:       { glob: '**/api/stocks*',       file: 'stocks' },
  crypto:       { glob: '**/api/crypto*',       file: 'crypto' },
  sports:       { glob: '**/api/sports*',       file: 'sports' },
  standings:    { glob: '**/api/standings*',    file: 'standings' },
  traffic:      { glob: '**/api/traffic*',      file: 'traffic' },
  todoist:      { glob: '**/api/todoist*',      file: 'todoist' },
  'rain-map':   { glob: '**/api/rain-map*',     file: 'rain-map' },
  history:      { glob: '**/api/history*',      file: 'history' },
  quote:        { glob: '**/api/quote*',        file: 'quote' },
  'dad-joke':   { glob: '**/api/jokes*',        file: 'dad-joke' },
  'air-quality':{ glob: '**/api/air-quality*',  file: 'air-quality' },
  backgrounds:  { glob: '**/api/backgrounds*',  file: 'backgrounds' },
};

type Override =
  | unknown // a replacement body (200 JSON)
  | { status: number; body?: unknown }; // an explicit status (e.g. 500 error, [] empty)

export interface StubOptions {
  /** Replace or error individual stubs, keyed by stub key (e.g. { news: { status: 500 } }). */
  overrides?: Record<string, Override>;
  /**
   * Abort requests to any non-app host (anything not on 127.0.0.1 / localhost)
   * so a real upstream — rain-map tiles, an <iframe> src — never loads and the
   * test proves the module made no external call. Default: true. Aborted hosts
   * are collected in the returned handle's `externalHits`.
   */
  blockExternal?: boolean;
}

export interface StubHandle {
  /** Hosts that were blocked because blockExternal aborted them. */
  externalHits: string[];
}

function isAppHost(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url);
}

export async function stubModuleData(page: Page, opts: StubOptions = {}): Promise<StubHandle> {
  const { overrides = {}, blockExternal = true } = opts;
  const handle: StubHandle = { externalHits: [] };

  // Register the external-block catch-all FIRST so the specific /api stubs
  // added afterwards take precedence (Playwright matches most-recently-added
  // handlers first).
  if (blockExternal) {
    await page.route('**/*', (route: Route) => {
      const url = route.request().url();
      if (isAppHost(url) || url.startsWith('data:') || url.startsWith('blob:')) {
        return route.fallback();
      }
      try {
        handle.externalHits.push(new URL(url).host);
      } catch { /* unparseable — still block */ }
      return route.abort();
    });
  }

  for (const [key, { glob, file }] of Object.entries(STUBS)) {
    const override = overrides[key];
    await page.route(glob, (route: Route) => {
      if (override !== undefined && isStatusOverride(override)) {
        return route.fulfill({
          status: override.status,
          contentType: 'application/json',
          body: JSON.stringify(override.body ?? {}),
        });
      }
      const body = override !== undefined ? override : fixture(file);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  return handle;
}

function isStatusOverride(o: Override): o is { status: number; body?: unknown } {
  return !!o && typeof o === 'object' && 'status' in (o as Record<string, unknown>)
    && typeof (o as { status: unknown }).status === 'number';
}
