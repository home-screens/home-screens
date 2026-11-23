import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { PNG_1X1 } from './library';

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

/** The picture every radar tile stub answers with. */
const TILE_PNG = PNG_1X1;

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
  // The sports module's team view and the editor's team picker. A single `*`
  // never crosses a slash, so the scoreboard glob above leaves these alone;
  // `teams` is registered after `team` so its narrower URL wins.
  'sports-team':  { glob: '**/api/sports/team*',  file: 'sports-team' },
  'sports-teams': { glob: '**/api/sports/teams*', file: 'sports-teams' },
  standings:    { glob: '**/api/standings*',    file: 'standings' },
  traffic:      { glob: '**/api/traffic*',      file: 'traffic' },
  todoist:      { glob: '**/api/todoist*',      file: 'todoist' },
  'rain-map':   { glob: '**/api/rain-map*',     file: 'rain-map' },
  history:      { glob: '**/api/history*',      file: 'history' },
  quote:        { glob: '**/api/quote*',        file: 'quote' },
  'dad-joke':   { glob: '**/api/jokes*',        file: 'dad-joke' },
  'air-quality':{ glob: '**/api/air-quality*',  file: 'air-quality' },
  backgrounds:  { glob: '**/api/backgrounds*',  file: 'backgrounds' },
  // Typed video list for the video module. Registered after `backgrounds` so
  // this more specific glob wins for the media=videos query (page.route
  // matches most-recently-added handlers first).
  'backgrounds-videos': { glob: '**/api/backgrounds?media=videos*', file: 'backgrounds-videos' },
  // School and public holidays for the timetable module, one German region's
  // school year, keyed by region the way the route answers. The glob is narrow
  // on purpose: `**/api/timetables*` would
  // swallow the timetable store itself, which is an app-host request that has
  // to reach the sandbox server. The module only asks for this once a region
  // is set on a school, and the route's handler is the one thing in the
  // timetable that talks to the internet, so a spec that renders a region
  // without this stub would make a real upstream call from Node, invisible to
  // `externalHits`, which only sees what the browser asked for.
  'timetable-holidays': { glob: '**/api/timetables/holidays*', file: 'school-holidays-de-nw' },
};

/**
 * The photo modules' one list route, `/api/photo-source/media`, answers by
 * the source's `kind`, so each kind keeps its own stub key (and override).
 * Every kind answers the typed MediaListItem[] shape. A library folder shares
 * the `backgrounds` key with the library's own listing above.
 */
const PHOTO_MEDIA_STUBS: Record<string, { key: string; file: string }> = {
  library: { key: 'backgrounds', file: 'backgrounds' },
  // Real Immich and iCloud lists carry hub serve URLs;
  // data: URLs keep the render fully offline under blockExternal.
  immich: { key: 'immich', file: 'backgrounds' },
  icloud: { key: 'icloud', file: 'backgrounds' },
  onedrive: { key: 'onedrive', file: 'onedrive' },
  // Unsplash items carry the photographer, which the slideshow credits.
  unsplash: { key: 'unsplash', file: 'unsplash' },
  nasa: { key: 'nasa', file: 'nasa' },
  art: { key: 'art', file: 'art' },
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
  /**
   * Answer `/api/calendar` the way the hub does: only the events inside the
   * window the display asked for (`timeMin` / `timeMax`, or today through the
   * next seven days when it sent none). Off, the stub hands back every event
   * whatever was asked, which hides a view drawing days nobody fetched.
   */
  calendarWindow?: boolean;
}

export interface StubHandle {
  /** Hosts that were blocked because blockExternal aborted them. */
  externalHits: string[];
}

/**
 * Radar tile URLs served by the tile stub, newest last. Reset on every
 * `stubModuleData` call. The rain-map module renders tiles as blob URLs, so
 * config fields that only affect the tile URL (color scheme, smoothing, snow)
 * are asserted against these served URLs instead of the DOM.
 */
let radarTileUrls: string[] = [];
export function getRadarTileUrls(): readonly string[] {
  return radarTileUrls;
}

function isAppHost(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url);
}

export async function stubModuleData(page: Page, opts: StubOptions = {}): Promise<StubHandle> {
  const { overrides = {}, blockExternal = true, calendarWindow = false } = opts;
  const handle: StubHandle = { externalHits: [] };
  radarTileUrls = [];

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
      const whole = override !== undefined ? override : fixture(file);
      const body = key === 'calendar' && calendarWindow ? insideCalendarWindow(whole, route.request().url()) : whole;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  await page.route('**/api/photo-source/media*', (route: Route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind') ?? 'library';
    const stub = PHOTO_MEDIA_STUBS[kind];
    if (!stub) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Unknown photo source"}' });
    const info = new URL(route.request().url()).searchParams.get('info');
    if (info === 'count') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 3200 }) });
    const override = overrides[stub.key];
    if (override !== undefined && isStatusOverride(override)) {
      return route.fulfill({ status: override.status, contentType: 'application/json', body: JSON.stringify(override.body ?? {}) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(override !== undefined ? override : fixture(stub.file)) });
  });

  // Radar tiles: the rain-map module fetches these cross-origin (through its
  // rate-bounded tile store) and renders them as blob URLs, so a spec can only
  // see a populated radar layer if the tiles resolve. Serve a 1×1 PNG so the
  // store succeeds; added after the catch-all so it takes precedence and the
  // request never escapes to the real CDN. Served URLs are recorded for
  // variant rows that assert URL-encoded config fields.
  await page.route('**/v2/radar/**/*/*.png', (route: Route) => {
    radarTileUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG });
  });

  return handle;
}

/**
 * The hub's own window rule for `/api/calendar`: an event is sent when it
 * overlaps `timeMin` to `timeMax`; with no `timeMin` the window opens at the
 * start of today, and with no `timeMax` it closes seven days after today
 * (the fixtures' `daysAhead`). Handles both answers the route gives, a bare
 * list and `{ events }`.
 */
function insideCalendarWindow(body: unknown, url: string): unknown {
  const params = new URL(url).searchParams;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const at = (name: string, fallback: number) => {
    const ms = Date.parse(params.get(name) ?? '');
    return Number.isFinite(ms) ? ms : fallback;
  };
  const min = at('timeMin', today.getTime());
  const max = at('timeMax', today.getTime() + 8 * 86_400_000);
  const inside = (events: unknown[]) => events.filter((e) => {
    const { start, end } = e as { start: string; end: string };
    return Date.parse(end) > min && Date.parse(start) < max;
  });
  if (Array.isArray(body)) return inside(body);
  if (body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)) {
    return { ...(body as object), events: inside((body as { events: unknown[] }).events) };
  }
  return body;
}

function isStatusOverride(o: Override): o is { status: number; body?: unknown } {
  return !!o && typeof o === 'object' && 'status' in (o as Record<string, unknown>)
    && typeof (o as { status: unknown }).status === 'number';
}
