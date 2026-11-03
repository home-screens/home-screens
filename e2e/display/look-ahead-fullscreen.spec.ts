import { test, expect } from '../fixtures';
import type { APIRequestContext, Page, Route } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { formatDayRange } from '@/i18n/formatters';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';

/**
 * Look-ahead arrows on the full-screen calendar: with taps on, ‹ and › sit
 * on the header's right, where a longer title or the tag never moves them;
 * › steps the view a week (a month on the month grid), the title names the
 * dates, a tag names the step ("Next week"), and Back to this week, just
 * before the arrows, comes straight back. A
 * minute untouched slides back by itself. The first step widens the shared
 * calendar fetch to all the arrows can reach, so a week past the usual
 * window has its events. With taps off the header is as it always was.
 */

/** Wednesday of this week at 9:41, local time: the week (Sunday start) runs from three days back. */
function wednesday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 2);
  d.setHours(9, 41, 0, 0);
  return d;
}
const NOW = wednesday();
const DAYS_AHEAD = 14;

function at(offsetDays: number, hour = 0, minute = 0): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays, hour, minute);
}

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function event(id: string, title: string, offsetDays: number, hour: number) {
  return {
    id, title, start: localIso(at(offsetDays, hour)), end: localIso(at(offsetDays, hour + 1)), allDay: false,
    calendarColor: '#4073ff', sourceId: 'cal-primary', sourceName: 'Family',
  };
}

const EVENTS = [
  event('la-this', 'Piano lesson', 1, 17),
  event('la-next', 'Soccer camp', 5, 9),
  // Thursday of the week three ahead: past the 15 days the hub reads by default.
  event('la-far', 'Science fair', 22, 18),
];

const SUNDAY = at(-3);
const weekTitle = (weeks: number) => formatDayRange(at(-3 + weeks * 7), at(3 + weeks * 7), 'en-US');
const monthTitle = (d: Date) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);

/**
 * The calendar feed as the hub answers it: only events inside the window
 * asked for, and without one, today to `DAYS_AHEAD` days on. Every URL asked
 * for is kept, to show the window widened.
 */
async function stubCalendarWindow(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('**/api/calendar*', (route: Route) => {
    const url = new URL(route.request().url());
    asked.push(url.search);
    const todayStart = at(0).getTime();
    const from = url.searchParams.get('timeMin') ? Date.parse(url.searchParams.get('timeMin')!) : todayStart;
    const to = url.searchParams.get('timeMax') ? Date.parse(url.searchParams.get('timeMax')!) : todayStart + (DAYS_AHEAD + 1) * 86_400_000;
    const inWindow = EVENTS.filter((ev) => new Date(ev.end).getTime() > from && new Date(ev.start).getTime() < to);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inWindow) });
  });
  return asked;
}

async function show(page: Page, request: APIRequestContext, config: Record<string, unknown>) {
  const mod = buildModuleInstance('fullscreen-calendar', config);
  mod.id = 'fsc';
  mod.size = { w: 1080, h: 1920 };
  mod.position = { x: 0, y: 0 };
  const settings = matrixSettings();
  settings.calendar = { ...(settings.calendar as Record<string, unknown>), daysAhead: DAYS_AHEAD };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings }));
  await page.goto('/display');
  await expect(page.locator('[data-module-id="fsc"] .fsc-header-title')).toBeVisible();
}

async function weekList(page: Page, request: APIRequestContext, config: Record<string, unknown> = {}, time = NOW) {
  await page.clock.install({ time });
  await stubModuleData(page);
  const asked = await stubCalendarWindow(page);
  await show(page, request, { view: 'week-list', eventTapDetails: true, ...config });
  return asked;
}

test.describe('Full-screen calendar look-ahead', () => {
  test('the week list rests with ‹ and › on the header\'s right, and they stay put as it steps', async ({ page, request }) => {
    await weekList(page, request);
    const title = page.locator('.fsc-header-title');
    await expect(title).toHaveText(weekTitle(0));
    const bar = page.getByTestId('look-ahead-bar');
    await expect(bar).toHaveAttribute('data-offset', '0');
    const [titleBox, barBox, forwardBox] = await Promise.all([title.boundingBox(), bar.boundingBox(), page.getByTestId('look-ahead-forward').boundingBox()]);
    if (!titleBox || !barBox || !forwardBox) throw new Error('the header has no boxes');
    // On the right half of the header, clear of the title.
    expect(barBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
    expect(barBox.x).toBeGreaterThan(540);
    expect(forwardBox.width).toBeGreaterThanOrEqual(44);
    expect(forwardBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('look-ahead-back')).toBeEnabled();
    await expect(page.getByTestId('look-ahead-words')).toHaveCount(0);
    await expect(page.getByTestId('look-ahead-home')).toHaveCount(0);
    await expect(page.locator('[data-event-id="la-this"]')).toBeVisible();

    // Testers tapped the same spot twice and the arrow had moved under them.
    const forward = page.getByTestId('look-ahead-forward');
    const back = page.getByTestId('look-ahead-back');
    const backBox = await back.boundingBox();
    for (const words of ['Next week', 'In 2 weeks', 'In 3 weeks', 'In 4 weeks']) {
      await page.mouse.click(forwardBox.x + forwardBox.width / 2, forwardBox.y + forwardBox.height / 2);
      await expect(page.getByTestId('look-ahead-words')).toHaveText(words);
      expect(await forward.boundingBox()).toEqual(forwardBox);
      expect(await back.boundingBox()).toEqual(backBox);
    }
  });

  /* Sam stepped back a week with "collapse past days" on and saw seven bare day names. */
  test('a week stepped back to is drawn whole, not collapsed or faded', async ({ page, request }) => {
    await weekList(page, request, { weekCollapsePastDays: true, dimPastEvents: true }, at(8, 9, 41));
    // At rest (a week on), the days before today collapse.
    await page.getByTestId('look-ahead-back').click();
    await expect(page.getByTestId('look-ahead-words')).toHaveText('Last week');
    const piano = page.locator('[data-event-id="la-this"]');
    await expect(piano).toBeVisible();
    // The fade sits on the day's block around the event.
    await expect(piano.locator('..')).toHaveCSS('opacity', '1');
  });

  test('› shows next week: its dates, the Next week tag, This week, and its events; This week comes back', async ({ page, request }) => {
    await weekList(page, request);
    await page.getByTestId('look-ahead-forward').click();

    await expect(page.locator('.fsc-header-title')).toHaveText(weekTitle(1));
    await expect(page.getByTestId('look-ahead-words')).toHaveText('Next week');
    await expect(page.getByTestId('look-ahead-words')).toHaveCSS('text-transform', 'uppercase');
    await expect(page.getByTestId('look-ahead-home')).toHaveText('Back to this week');
    await expect(page.getByTestId('look-ahead-bar')).toHaveAttribute('data-offset', '1');
    await expect(page.locator('[data-event-id="la-next"]')).toBeVisible();
    await expect(page.locator('[data-event-id="la-this"]')).toHaveCount(0);
    // No Today badge on a week that has no today.
    await expect(page.locator('.fsc-content').getByText('Today', { exact: true })).toHaveCount(0);

    await page.getByTestId('look-ahead-home').click();
    await expect(page.locator('.fsc-header-title')).toHaveText(weekTitle(0));
    await expect(page.getByTestId('look-ahead-words')).toHaveCount(0);
    await expect(page.getByTestId('look-ahead-home')).toHaveCount(0);
    await expect(page.locator('[data-event-id="la-this"]')).toBeVisible();
  });

  test('a week past the usual fetch window has its events: the first step widens the fetch', async ({ page, request }) => {
    const asked = await weekList(page, request);
    await expect(page.locator('[data-event-id="la-this"]')).toBeVisible();
    // At rest the hub is asked for its default window, which stops short of the far event.
    expect(asked.some((q) => new URLSearchParams(q).get('timeMax'))).toBe(false);

    const forward = page.getByTestId('look-ahead-forward');
    await forward.click();
    await forward.click();
    await forward.click();
    await expect(page.locator('.fsc-header-title')).toHaveText(weekTitle(3));
    await expect(page.getByTestId('look-ahead-words')).toHaveText('In 3 weeks');
    await expect(page.locator('[data-event-id="la-far"]')).toBeVisible();
    await expect(page.locator('[data-event-id="la-far"]')).toContainText('Science fair');
    // One wider request reaching eight weeks on, asked for once.
    const widened = asked.map((q) => new URLSearchParams(q)).filter((q) => q.get('timeMax'));
    expect(widened.length).toBeGreaterThan(0);
    expect(Date.parse(widened[0].get('timeMax')!)).toBeGreaterThan(SUNDAY.getTime() + 8 * 7 * 86_400_000);
    expect(Date.parse(widened[0].get('timeMin')!)).toBeLessThan(SUNDAY.getTime() - 8 * 7 * 86_400_000 + 86_400_000);
  });

  test('a minute untouched slides back to this week, and a touch starts the minute again', async ({ page, request }) => {
    await weekList(page, request);
    await page.getByTestId('look-ahead-forward').click();
    await expect(page.getByTestId('look-ahead-words')).toHaveText('Next week');

    await page.clock.fastForward(WALL_SCROLL_IDLE_MS - 20_000);
    // Someone is still reading: a touch on the calendar starts the minute again.
    await page.locator('.fsc-content').dispatchEvent('pointerdown');
    await page.clock.fastForward(30_000);
    await expect(page.locator('.fsc-header-title')).toHaveText(weekTitle(1));
    await expect(page.getByTestId('look-ahead-home')).toBeVisible();

    await page.clock.fastForward(WALL_SCROLL_IDLE_MS);
    await expect(page.locator('.fsc-header-title')).toHaveText(weekTitle(0));
    await expect(page.getByTestId('look-ahead-words')).toHaveCount(0);
    await expect(page.locator('[data-event-id="la-this"]')).toBeVisible();
  });

  test('the month grid steps a month', async ({ page, request }) => {
    await weekList(page, request, { view: 'month-grid' });
    const title = page.locator('.fsc-header-title');
    await expect(title).toHaveText(monthTitle(NOW));
    await page.getByTestId('look-ahead-forward').click();
    const nextMonth = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1);
    await expect(title).toHaveText(monthTitle(nextMonth));
    await expect(page.getByTestId('look-ahead-words')).toHaveText('Next month');
    await expect(page.getByTestId('look-ahead-home')).toHaveText('Back to this month');
    await expect(page.locator('.fsc-content [role="grid"]')).toHaveAttribute('aria-label', monthTitle(nextMonth));

    await page.getByTestId('look-ahead-back').click();
    await page.getByTestId('look-ahead-back').click();
    const lastMonth = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
    await expect(title).toHaveText(monthTitle(lastMonth));
    await expect(page.getByTestId('look-ahead-words')).toHaveText('Last month');
  });

  test('a long stepped title steps down in size so the header stays on the wall', async ({ page, request }) => {
    // Wednesday December 9, 2026: three weeks on is the week that crosses the year.
    await weekList(page, request, {}, new Date(2026, 11, 9, 9, 41));
    const title = page.locator('.fsc-header-title');
    await expect(title).toHaveText('December 6 – 12, 2026');
    await expect(title).toHaveCSS('font-size', '37.8px');
    const forward = page.getByTestId('look-ahead-forward');
    await forward.click();
    await forward.click();
    await forward.click();
    await expect(title).toHaveText('December 27, 2026 – January 2, 2027');
    await expect(page.getByTestId('look-ahead-words')).toHaveText('In 3 weeks');
    const [header, badge] = await Promise.all([page.locator('.fsc-header').boundingBox(), page.locator('.fsc-view-badge').boundingBox()]);
    if (!header || !badge) throw new Error('the header has no boxes');
    expect(badge.x + badge.width).toBeLessThanOrEqual(header.x + header.width);
    const size = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThan(37.8);
    expect(size).toBeGreaterThan(37.8 * 0.6);

    // Back home the title has its full size again.
    await page.getByTestId('look-ahead-home').click();
    await expect(title).toHaveText('December 6 – 12, 2026');
    await expect(title).toHaveCSS('font-size', '37.8px');
  });

  test('with taps off the header has no arrows and keeps its height', async ({ page, request }) => {
    await weekList(page, request, { eventTapDetails: false });
    await expect(page.locator('.fsc-header-title')).toHaveText(weekTitle(0));
    await expect(page.locator('[data-event-id="la-this"]')).toBeVisible();
    await expect(page.getByTestId('look-ahead-bar')).toHaveCount(0);
    await expect(page.getByTestId('look-ahead-forward')).toHaveCount(0);
    const header = await page.locator('.fsc-header').boundingBox();
    expect(header?.height).toBeCloseTo(54, 0);
  });
});
