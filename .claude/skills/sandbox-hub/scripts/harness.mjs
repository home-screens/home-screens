/**
 * Browser harness for driving a sandbox hub by hand-written scenario scripts.
 * One call opens a page at a named device size and collects, for the whole
 * visit, console errors, page errors and failed or erroring requests, so a
 * finding comes with its evidence.
 *
 *   import { open } from '<repo>/.claude/skills/sandbox-hub/scripts/harness.mjs';
 *   const s = await open({ base: 'http://127.0.0.1:3140', device: 'phone', out: '<dir>/shots', stubs: 'all' });
 *   await s.goto('/remote');
 *   await s.page.getByRole('button', { name: 'Chores' }).click();
 *   await s.shot('chores');
 *   await s.done();   // closes the browser and prints the report as JSON
 *
 * `s.page` is a normal Playwright page. The scenario script can live anywhere
 * (a scratch folder is fine) as long as it imports this file by its path:
 * `@playwright/test` resolves from here, inside the repo.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FIXTURES = path.join(REPO, 'e2e', 'fixtures', 'module-data');

/**
 * Stub key -> [route glob, fixture file], the same table as
 * e2e/helpers/stubs.ts. Order matters: Playwright tries the newest route
 * first, so a narrower glob comes after the wider one it overlaps.
 */
export const STUBS = {
  weather: ['**/api/weather*', 'weather'],
  calendar: ['**/api/calendar*', 'calendar'],
  news: ['**/api/news*', 'news'],
  stocks: ['**/api/stocks*', 'stocks'],
  crypto: ['**/api/crypto*', 'crypto'],
  sports: ['**/api/sports*', 'sports'],
  'sports-team': ['**/api/sports/team*', 'sports-team'],
  'sports-teams': ['**/api/sports/teams*', 'sports-teams'],
  standings: ['**/api/standings*', 'standings'],
  traffic: ['**/api/traffic*', 'traffic'],
  todoist: ['**/api/todoist*', 'todoist'],
  'rain-map': ['**/api/rain-map*', 'rain-map'],
  history: ['**/api/history*', 'history'],
  quote: ['**/api/quote*', 'quote'],
  'dad-joke': ['**/api/jokes*', 'dad-joke'],
  'air-quality': ['**/api/air-quality*', 'air-quality'],
  backgrounds: ['**/api/backgrounds*', 'backgrounds'],
};

export const VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1512, height: 950, deviceScaleFactor: 1 },
  wall: { width: 1080, height: 1920, deviceScaleFactor: 1 },
  wallLandscape: { width: 1920, height: 1080, deviceScaleFactor: 1 },
};

/**
 * @param {object} o
 * @param {string} o.base      sandbox base URL, as printed by `hub.sh start`
 * @param {string} o.out       folder for screenshots (created if missing)
 * @param {keyof typeof VIEWPORTS} [o.device]  default 'desktop'
 * @param {string[] | 'all'} [o.stubs]  outside-service data to answer from the
 *   E2E fixtures, by stub key. Anything not listed reaches the sandbox's own
 *   route, which without an API key answers with an error or an empty state.
 * @param {boolean} [o.blockExternal]  abort every request that is not to the
 *   sandbox itself (map tiles, embedded pages). Default false.
 * @param {string} [o.timezone]  browser time zone; default is the machine's
 * @param {string} [o.locale]    browser language; default 'en-US'
 * @param {number} [o.slowMo]    milliseconds between actions, for watching
 */
export async function open({ base, out, device = 'desktop', stubs = [], blockExternal = false, timezone, locale = 'en-US', slowMo = 0 }) {
  if (!base || !out) throw new Error('open() needs base and out');
  const vp = VIEWPORTS[device];
  if (!vp) throw new Error(`unknown device '${device}'; use one of ${Object.keys(VIEWPORTS).join(', ')}`);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ slowMo });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
    ...(timezone ? { timezoneId: timezone } : {}),
    locale,
  });
  const page = await context.newPage();

  const blocked = [];
  if (blockExternal) {
    // Registered first so the fixture stubs below win over it.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.fallback();
      blocked.push(url.slice(0, 200));
      return route.abort();
    });
  }
  const wanted = stubs === 'all' ? Object.keys(STUBS) : stubs;
  for (const key of wanted) {
    const entry = STUBS[key];
    if (!entry) throw new Error(`unknown stub '${key}'; use one of ${Object.keys(STUBS).join(', ')}`);
    const body = readFileSync(path.join(FIXTURES, `${entry[1]}.json`), 'utf8');
    await page.route(entry[0], (route) => route.fulfill({ status: 200, contentType: 'application/json', body }));
  }

  const consoleErrors = [];
  const pageErrors = [];
  const badRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleErrors.push({ type: m.type(), text: m.text().slice(0, 400), url: page.url() });
    }
  });
  page.on('pageerror', (e) => pageErrors.push({ message: String(e).slice(0, 400), url: page.url() }));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    // A page prefetch dropped because the visit moved on or ended; not a fault.
    if (r.failure()?.errorText === 'net::ERR_ABORTED' && u.includes('_rsc=')) return;
    badRequests.push({ url: u.slice(0, 200), failure: r.failure()?.errorText, page: page.url() });
  });
  page.on('response', (r) => {
    if (r.status() >= 400) badRequests.push({ url: r.url().slice(0, 200), status: r.status(), page: page.url() });
  });

  let shotN = 0;
  const shots = [];

  const s = {
    page,
    context,
    browser,
    base,
    async goto(pathname, opts = {}) {
      await page.goto(base + pathname, { waitUntil: 'domcontentloaded', timeout: 30000, ...opts });
      await page.waitForTimeout(700);
    },
    /** Numbered screenshot into the out folder. `full: true` for the whole scrollable page. */
    async shot(name, { full = false, clip } = {}) {
      const file = path.join(out, `${String(++shotN).padStart(2, '0')}-${name}.png`);
      await page.screenshot({ path: file, fullPage: full, clip });
      shots.push(file);
      return file;
    },
    /** The text a person would read, with runs of blank lines collapsed. */
    async text(selector = 'body') {
      return (await page.locator(selector).first().innerText().catch(() => '')).replace(/\n{3,}/g, '\n\n').slice(0, 6000);
    },
    /** Everything a person could press or type into, with its name and size. */
    async controls(scope = 'body') {
      return page.locator(scope).first().evaluate((root) => {
        const found = [];
        const sel = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="switch"],[tabindex]:not([tabindex="-1"])';
        for (const el of root.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 60);
          found.push({
            tag: el.tagName.toLowerCase(),
            label,
            w: Math.round(r.width),
            h: Math.round(r.height),
            disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
          });
        }
        return found;
      });
    },
    /**
     * Controls smaller than `min` CSS px either way. Meant for the phone and
     * the wall; the editor is a mouse surface and is not held to this.
     */
    async smallTargets(scope = 'body', min = 44) {
      const all = await s.controls(scope);
      return all.filter((c) => !c.disabled && c.label && (c.w < min || c.h < min));
    },
    /** Whether the page is wider than the screen. */
    async horizontalOverflow() {
      return page.evaluate(() => {
        const de = document.documentElement;
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowing: de.scrollWidth > de.clientWidth + 1 };
      });
    },
    /** Hand back what was collected so far and start again, so the next step's errors are its own. */
    drain() {
      const snapshot = { consoleErrors: [...consoleErrors], pageErrors: [...pageErrors], badRequests: [...badRequests] };
      consoleErrors.length = 0; pageErrors.length = 0; badRequests.length = 0;
      return snapshot;
    },
    async done() {
      const report = { shots, consoleErrors, pageErrors, badRequests, ...(blockExternal ? { blocked } : {}) };
      await browser.close();
      console.log('\n===== HARNESS REPORT =====');
      console.log(JSON.stringify(report, null, 2));
      return report;
    },
  };
  return s;
}
