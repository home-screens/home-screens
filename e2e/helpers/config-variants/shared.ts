import { expect, type Locator } from '@playwright/test';

// --- Shared assertion helpers ----------------------------------------------

/** Module text contains the substring. */
export const has = (needle: string) => async (mod: Locator): Promise<void> => {
  await expect(mod).toContainText(needle);
};

/** Module text does NOT contain the substring (waits for a stable render first). */
export const lacks = (present: string, absent: string) => async (mod: Locator): Promise<void> => {
  await expect(mod).toContainText(present);
  await expect(mod).not.toContainText(absent);
};

/**
 * Module textContent matches the regex (polls so async content can settle).
 * Uses textContent, not innerText — innerText applies CSS `text-transform`, so
 * a row styled `uppercase` would surface as "WEEK 28" and defeat a `/Week/` match.
 */
export const matches = (re: RegExp) => async (mod: Locator): Promise<void> => {
  await expect.poll(async () => re.test((await mod.evaluate((el) => el.textContent)) || '')).toBe(true);
};

/** Module textContent does NOT match the regex. */
export const notMatches = (re: RegExp) => async (mod: Locator): Promise<void> => {
  // First wait for the module to actually render text, so an empty first paint
  // can't satisfy the negation vacuously.
  await expect.poll(async () => ((await mod.evaluate((el) => el.textContent)) || '').trim().length).toBeGreaterThan(0);
  // Auto-retrying negation (symmetric with `matches`): Playwright polls the
  // element text against the regex and holds the not-match over the timeout
  // window, so text that paints a beat later still fails the assertion. Default
  // matching uses textContent, not innerText, so CSS text-transform is ignored.
  await expect(mod).not.toContainText(re);
};

/** A descendant matching the selector is attached to the DOM. */
export const child = (selector: string) => async (mod: Locator): Promise<void> => {
  await expect(mod.locator(selector).first()).toBeAttached();
};

/** Exactly `n` descendants match the selector. */
export const count = (selector: string, n: number) => async (mod: Locator): Promise<void> => {
  await expect(mod.locator(selector)).toHaveCount(n);
};

/** The first element matching `selector` has a computed background-color of red-ish `255,0,0`. */
export const redBackground = (selector: string) => async (mod: Locator): Promise<void> => {
  await expect(mod.locator(selector).first()).toBeAttached();
  const bg = await mod.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
};

/** The first element matching `selector` has a computed color/property of red-ish `255,0,0`. */
export const redStyle = (selector: string, property: string) => async (mod: Locator): Promise<void> => {
  await expect(mod.locator(selector).first()).toBeAttached();
  const value = await mod
    .locator(selector)
    .first()
    .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
  expect(value.replace(/\s/g, '')).toMatch(/rgba?\(255,0,0/);
};

// --- Shared fixture bodies (inline; never touch the shared JSON fixtures) ---

/** 1×1 transparent GIF — renders verbatim through useAuthImage (no external fetch). */
export const TINY_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** A second distinguishable 1×1 GIF (opaque black) for slideshow-advance rows. */
export const TINY_GIF_2 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Weather body with wind on the forecast days so the daily view renders a wind unit. */
export const WEATHER_WIND = {
  hourly: [
    { time: '2099-07-07T12:00:00Z', temp: 20, feelsLike: 19, humidity: 55, icon: 'sun', description: 'Clear', windSpeed: 12, precipProbability: 10 },
  ],
  forecast: [
    { date: '2099-07-07', high: 22, low: 14, icon: 'sun', description: 'Sunny', windSpeed: 12 },
    { date: '2099-07-08', high: 23, low: 15, icon: 'cloud-sun', description: 'Cloudy', windSpeed: 14 },
  ],
};

/** Weather body with a DEFINED-but-empty alerts array so hideWhenNoAlerts can hide the module. */
export const WEATHER_NO_ALERTS = {
  hourly: [{ time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'sun', description: 'Clear', windSpeed: 8, precipProbability: 10 }],
  forecast: [{ date: '2099-07-07', high: 78, low: 61, icon: 'sun', description: 'Sunny' }],
  alerts: [],
};

/** An 8-team NFL division group so rank 7 exists and gets the playoff-line divider. */
export const STANDINGS_8 = {
  groups: [{
    name: 'AFC East',
    league: 'NFL',
    entries: Array.from({ length: 8 }, (_, i) => ({
      rank: i + 1,
      team: `Team ${i + 1}`,
      teamAbbr: `T${i + 1}`,
      teamShort: `Team${i + 1}`,
      teamLogo: '',
      teamColor: '888888',
      wins: 8 - i,
      losses: i,
      winPct: (8 - i) / 8,
      streak: 'W1',
      pointsFor: 300,
      pointsAgainst: 250,
      differential: 50,
    })),
  }],
};

/** Two due-dated Todoist tasks; the first carries a label. */
export const TODOIST_2 = {
  tasks: [
    { id: '1', content: 'FIRST TASK', description: '', priority: 1, due: { date: '2099-01-15', datetime: null, isRecurring: false }, labels: ['errands'], labelColors: {}, projectId: 'p1', projectName: 'Inbox', projectColor: '#808080', sectionId: '', sectionName: '', parentId: null, order: 1, commentCount: 0 },
    { id: '2', content: 'SECOND TASK', description: '', priority: 1, due: { date: '2099-01-16', datetime: null, isRecurring: false }, labels: [], labelColors: {}, projectId: 'p1', projectName: 'Inbox', projectColor: '#808080', sectionId: '', sectionName: '', parentId: null, order: 2, commentCount: 0 },
  ],
  projects: [{ id: 'p1', name: 'Inbox', color: '#808080', order: 1 }],
};

// --- Shared local-naive date builders ----------------------------------------
// Stamped at row-definition (import) time, close to the test run. Local-naive
// ISO strings (no zone suffix) so the display parses the literal wall clock.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `today + offsetDays` as a Date (a fresh copy each call). */
export function dayAt(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

/** Local `YYYY-MM-DDTHH:mm:00` for `today + offsetDays` at `hour:minute`. */
export function localIso(offsetDays: number, hour: number, minute = 0): string {
  const d = dayAt(offsetDays);
  d.setHours(hour, minute, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

/** Local `YYYY-MM-DD` for `today + offsetDays` (date-only ⇒ all-day bounds). */
export function localDate(offsetDays: number): string {
  const d = dayAt(offsetDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
