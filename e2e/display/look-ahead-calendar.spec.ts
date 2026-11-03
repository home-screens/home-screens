import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';

/**
 * Look-ahead on the small Calendar: on a touch wall with "Tap an event to see
 * details" on, arrows step the view a week (a month, its run of days) forward
 * or back, "This week" goes straight back, and a minute untouched slides it
 * back by itself. With taps off nothing changes.
 */

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Local YYYY-MM-DD. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The first day of the week holding `d`, Sunday first, as the module's default `startDay`. */
function sundayOf(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

/** "November 8 – 14", as the heading writes a run of days. */
function dayRange(start: Date, end: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).formatRange(start, end).replace(/[  ]/g, ' ');
}

const NOW = new Date();
const THIS_SUNDAY = sundayOf(NOW);
const NEXT_SUNDAY = addDays(THIS_SUNDAY, 7);

function event(id: string, title: string, day: Date) {
  return { id, title, start: `${iso(day)}T17:00:00`, end: `${iso(day)}T18:00:00`, allDay: false, calendarColor: '#3b82f6', sourceId: 'cal-family', sourceName: 'Family' };
}

const EVENTS = [
  // All day, so it is still upcoming for the Agenda at any hour the spec runs.
  { ...event('la-now', 'Piano lesson', NOW), start: iso(NOW), end: iso(addDays(NOW, 1)), allDay: true },
  event('la-next', 'Swim meet', addDays(NEXT_SUNDAY, 2)),
  event('la-far', 'Grandma visits', addDays(THIS_SUNDAY, 7 * 6 + 3)),
];

function screen(config: Record<string, unknown>, size = { w: 760, h: 720 }) {
  const instance = buildModuleInstance('calendar', config);
  instance.size = size;
  return baseConfig({ screens: [makeScreen('s1', 'S1', [instance])], settings: matrixSettings() });
}

async function open(page: Page, request: Parameters<typeof renderOnDisplay>[1], config: Record<string, unknown>): Promise<Locator> {
  await stubModuleData(page, { overrides: { calendar: EVENTS } });
  const display = await renderOnDisplay(page, request, screen(config));
  return display.module('calendar');
}

test.describe('Look-ahead on the small Calendar', () => {
  test('steps the Week a week at a time, and This week goes straight back', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'week', eventTapDetails: true });
    const bar = mod.getByTestId('look-ahead-bar');
    await expect(bar.getByTestId('look-ahead-words')).toHaveText('This week');
    await expect(bar.getByTestId('look-ahead-dates')).toHaveText(dayRange(THIS_SUNDAY, addDays(THIS_SUNDAY, 6)));
    await expect(mod.getByTestId('look-ahead-home')).toHaveCount(0);
    await expect(mod.locator('[data-event-id="la-now"]')).toBeVisible();

    await mod.getByTestId('look-ahead-forward').click();
    await expect(bar.getByTestId('look-ahead-words')).toHaveText('Next week');
    await expect(bar.getByTestId('look-ahead-dates')).toHaveText(dayRange(NEXT_SUNDAY, addDays(NEXT_SUNDAY, 6)));
    await expect(mod.locator('[data-event-id="la-next"]')).toBeVisible();
    await expect(mod.locator('[data-event-id="la-now"]')).toHaveCount(0);
    // Next week has no today: no day is marked as one.
    await expect(mod.locator(`[data-open-day="${iso(NOW)}"]`)).toHaveCount(0);

    await mod.getByTestId('look-ahead-back').click();
    await mod.getByTestId('look-ahead-back').click();
    await expect(bar.getByTestId('look-ahead-words')).toHaveText('Last week');

    await mod.getByTestId('look-ahead-home').click();
    await expect(bar.getByTestId('look-ahead-words')).toHaveText('This week');
    await expect(mod.locator('[data-event-id="la-now"]')).toBeVisible();
  });

  test('asks for the weeks it can reach once, on the first step away', async ({ page, request }) => {
    const asked: string[] = [];
    page.on('request', (req) => { if (new URL(req.url()).pathname === '/api/calendar') asked.push(req.url()); });
    const mod = await open(page, request, { viewMode: 'week', eventTapDetails: true });
    await expect(mod.getByTestId('look-ahead-bar')).toBeVisible();
    const before = asked.length;

    await mod.getByTestId('look-ahead-forward').click();
    await expect.poll(() => asked.length).toBeGreaterThan(before);
    const widened = new URL(asked[asked.length - 1]);
    // Eight weeks on from this week's last day, and eight back.
    expect(new Date(widened.searchParams.get('timeMax')!).getTime()).toBeGreaterThanOrEqual(addDays(THIS_SUNDAY, 7 * 9).getTime());
    expect(new Date(widened.searchParams.get('timeMin')!).getTime()).toBeLessThanOrEqual(addDays(THIS_SUNDAY, -7 * 8).getTime());

    // Six weeks on, with nothing more to fetch.
    for (let i = 0; i < 5; i++) await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 6 weeks');
    await expect(mod.locator('[data-event-id="la-far"]')).toBeVisible();
    expect(asked.length).toBe(before + 1);
  });

  test('stops eight weeks either way, and says so when tapped past the end', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'week', eventTapDetails: true });
    const forward = mod.getByTestId('look-ahead-forward');
    for (let i = 0; i < 8; i++) await forward.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 8 weeks');
    await expect(forward).toHaveAttribute('aria-disabled', 'true');
    // Greyed, it still answers a finger (Playwright waits on aria-disabled unless forced).
    await forward.click({ force: true });
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 8 weeks');
    await expect(mod.getByTestId('look-ahead-limit')).toHaveText('Up to 8 weeks ahead');
  });

  /* Sam and Maya tapped the same spot again and hit the way back instead of the arrow. */
  test('keeps the arrows where they are when the way back appears', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'week', eventTapDetails: true });
    const back = mod.getByTestId('look-ahead-back');
    const forward = mod.getByTestId('look-ahead-forward');
    const [backBox, forwardBox] = [await back.boundingBox(), await forward.boundingBox()];
    await back.click();
    await expect(mod.getByTestId('look-ahead-home')).toBeVisible();
    expect(await back.boundingBox()).toEqual(backBox);
    expect(await forward.boundingBox()).toEqual(forwardBox);
    // A second tap in the same place steps again.
    await page.mouse.click(backBox!.x + backBox!.width / 2, backBox!.y + backBox!.height / 2);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('2 weeks ago');
  });

  /* Every tester swiped sideways on a calendar and lost the wall to the next screen. */
  test('a sideways swipe on the calendar steps its week, and elsewhere still changes screens', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: EVENTS } });
    const cal = buildModuleInstance('calendar', { viewMode: 'week', eventTapDetails: true });
    cal.size = { w: 760, h: 720 };
    const clock = buildModuleInstance('clock', {});
    clock.id = 'clock-here';
    clock.position = { x: 40, y: 1500 };
    const other = buildModuleInstance('clock', {});
    other.id = 'clock-next-screen';
    await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [cal, clock]), makeScreen('s2', 'S2', [other])],
      // Rotation frozen: the test is about the gesture, not the timer.
      settings: { ...matrixSettings(), rotationIntervalMs: 3_600_000 },
    }));
    const mod = page.locator(`[data-module-id="${cal.id}"]`);
    const box = (await mod.boundingBox())!;
    const swipe = async (x: number, y: number, dx: number) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 4 });
      await page.mouse.move(x + dx, y, { steps: 4 });
      await page.mouse.up();
    };
    await swipe(box.x + box.width * 0.7, box.y + box.height / 2, -300);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await swipe(box.x + box.width * 0.3, box.y + box.height / 2, 300);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('This week');
    await expect(page.locator(`[data-module-id="${other.id}"]`)).toHaveCount(0);
    // Off the calendar, the swipe is the display's again.
    const clockBox = (await page.locator(`[data-module-id="${clock.id}"]`).boundingBox())!;
    await swipe(clockBox.x + clockBox.width * 0.7, clockBox.y + clockBox.height / 2, -300);
    await expect(page.locator(`[data-module-id="${other.id}"]`)).toBeVisible();
  });

  test('slides back to this week a minute after the last touch', async ({ page, request }) => {
    await page.clock.install();
    const mod = await open(page, request, { viewMode: 'week', eventTapDetails: true });
    await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await page.clock.fastForward(WALL_SCROLL_IDLE_MS - 10_000);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await page.clock.fastForward(11_000);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('This week');
  });

  test('puts the arrows in the Month title and steps a month', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'month', eventTapDetails: true });
    const bar = mod.getByTestId('look-ahead-bar');
    const month = (d: Date) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
    await expect(bar).toContainText(month(NOW));
    await mod.getByTestId('look-ahead-forward').click();
    await expect(bar).toContainText(month(new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1)));
    await expect(mod.getByTestId('look-ahead-home')).toHaveText('Back to this month');
    await mod.getByTestId('look-ahead-home').click();
    await expect(bar).toContainText(month(NOW));
  });

  test('moves the Daily view by the days it shows', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'daily', daysToShow: 3, eventTapDetails: true });
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Today');
    await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 3 days');
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(dayRange(addDays(NOW, 3), addDays(NOW, 5)));
    await expect(mod.getByTestId('look-ahead-home')).toHaveText('Back to today');
  });

  /* Maya read a later Saturday under "Next week" as next Saturday. */
  test('lists a stepped Agenda\'s own week, every day of it, and nothing after', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'agenda', eventTapDetails: true });
    await expect(mod.locator('[data-event-id="la-now"]')).toBeVisible();
    await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await expect(mod.locator('[data-event-id="la-now"]')).toHaveCount(0);
    await expect(mod.locator('[data-event-id="la-next"]')).toBeVisible();
    // Seven days, six of them empty and saying so; Grandma's visit weeks later is not listed.
    await expect(mod.getByTestId('calendar-agenda-no-events')).toHaveCount(6);
    await expect(mod.locator('[data-event-id="la-far"]')).toHaveCount(0);
  });

  test('heads a view of several weeks with its dates, not "This week"', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'multi-week', weeksToShow: 3, gridTheme: 'banner', eventTapDetails: true });
    await expect(mod.getByTestId('look-ahead-words')).toHaveCount(0);
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(dayRange(THIS_SUNDAY, addDays(THIS_SUNDAY, 20)));
    await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(dayRange(NEXT_SUNDAY, addDays(NEXT_SUNDAY, 20)));
    await expect(mod.getByTestId('look-ahead-home')).toHaveText('Back to this week');
  });

  /* Maya scrolled a stepped list and "Back to today" took her to the top of next week instead. */
  test('on a stepped Agenda the scroll button says Back to the top', async ({ page, request }) => {
    const busy = Array.from({ length: 14 }, (_, i) => event(`la-busy-${i}`, `Practice ${i + 1}`, addDays(NEXT_SUNDAY, i % 7)));
    await stubModuleData(page, { overrides: { calendar: [...EVENTS, ...busy] } });
    const display = await renderOnDisplay(page, request, screen({ viewMode: 'agenda', eventTapDetails: true }, { w: 760, h: 420 }));
    const mod = display.module('calendar');
    await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    const list = mod.getByTestId('calendar-agenda-scroll');
    await list.evaluate((el) => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.scrollTop = el.scrollHeight; });
    await expect(mod.getByTestId('calendar-agenda-scroll-home')).toContainText('Back to the top');
  });

  /* On a Pi the new week takes a quarter of a second to draw; with no answer meanwhile, a tap gets tapped again. */
  test('an arrow looks pressed the moment a finger lands on it', async ({ page, request }) => {
    const mod = await open(page, request, { viewMode: 'week', eventTapDetails: true });
    const forward = mod.getByTestId('look-ahead-forward');
    const box = (await forward.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(forward).toHaveAttribute('data-pressed', '');
    await expect(forward).toHaveCSS('transform', /matrix\(0\.94/);
    await page.mouse.up();
    await expect(forward).not.toHaveAttribute('data-pressed', '');
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
  });

  test('draws no arrows with taps off', async ({ page, request }) => {
    for (const viewMode of ['week', 'month', 'daily']) {
      const mod = await open(page, request, { viewMode, eventTapDetails: false });
      await expect(mod.locator('[data-event-id="la-now"]')).toBeVisible();
      await expect(mod.getByTestId('look-ahead-bar')).toHaveCount(0);
      await expect(mod.getByTestId('look-ahead-forward')).toHaveCount(0);
    }
  });
});
