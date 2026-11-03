import { test, expect } from '../fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedMeals, seedTodos, E2E_TODO_LIST_ID } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import type { ModuleType } from '@/types/config';

/**
 * List views a finger scrolls on a touch wall (WallScroller): with taps on,
 * the view draws more than fits, a scroll moves it, a "Back to ..." button
 * takes it home, and a minute after the last touch it glides home by itself.
 * With taps off the box clips where it always has and nothing moves it.
 */

/**
 * Wednesday of this week at 9:41, local time. A fixed weekday keeps the meal
 * List's home (today's heading, after Sunday to Tuesday) the same whatever
 * day the suite runs, and a morning keeps today's events all still to come.
 */
function wednesday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 2);
  d.setHours(9, 41, 0, 0);
  return d;
}
const NOW = wednesday();

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function day(offset: number): string {
  return localIso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset)).slice(0, 10);
}

/** Three events a day for two weeks: far more than a portrait agenda shows. */
function twoWeeksOfEvents() {
  const titles = ['Soccer practice', 'Dentist checkup', 'Piano lesson', 'Book club', 'Swim class'];
  return Array.from({ length: 14 * 3 }, (_, i) => {
    const offset = Math.floor(i / 3);
    const start = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset, 11 + (i % 3) * 3, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    return {
      id: `ev-${i}`, title: `${titles[i % titles.length]} ${i + 1}`, start: localIso(start), end: localIso(end), allDay: false,
      calendarColor: '#4073ff', sourceId: 'cal-primary', sourceName: 'Family',
    };
  });
}

/** Three meals every day of this week (a list longer than a small module), and a long shopping list. */
async function seedWeekOfMeals(request: APIRequestContext, items = 30) {
  const aisles = ['produce', 'dairy', 'meat', 'bakery', 'pantry'] as const;
  const names = ['Pancakes', 'Tacos', 'Chicken Soup', 'Oatmeal', 'Burgers', 'Stir Fry', 'Lasagne'];
  const savedMeals = names.map((name, i) => ({
    id: `m${i}`, name, emoji: '🍽️',
    ingredients: i === 0 ? Array.from({ length: items }, (_, j) => ({ name: `Item number ${j + 1}`, amount: '1 cup', category: aisles[j % aisles.length] })) : [],
  }));
  const plan = Array.from({ length: 15 * 3 }, (_, i) => ({
    slot: (['breakfast', 'lunch', 'dinner'] as const)[i % 3],
    mealId: `m${(i + 1) % names.length}`,
    date: day(Math.floor(i / 3) - 7),
  }));
  // The meal with the shopping list is tonight's dinner.
  const dinner = plan.find((p) => p.date === day(0) && p.slot === 'dinner');
  if (dinner) dinner.mealId = 'm0';
  await seedMeals(request, { savedMeals, plan });
}

async function show(page: Page, request: APIRequestContext, type: ModuleType, config: Record<string, unknown>, size: { w: number; h: number }) {
  const mod = buildModuleInstance(type, config);
  mod.id = 'listy';
  mod.size = size;
  mod.position = size.w >= 1080 ? { x: 0, y: 0 } : { x: 60, y: 120 };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings: matrixSettings() }));
  await page.goto('/display');
  await expect(page.locator('[data-module-id="listy"]')).toBeVisible();
}

const scrollTop = (box: Locator) => box.evaluate((el) => el.scrollTop);

/** A wheel over the middle of the box, as a mouse or a two-finger drag sends it. */
async function wheel(page: Page, box: Locator, deltaY: number) {
  const geo = await box.boundingBox();
  if (!geo) throw new Error('the scroller has no box');
  await page.mouse.move(geo.x + geo.width / 2, geo.y + geo.height / 2);
  await page.mouse.wheel(0, deltaY);
}

/** A one-finger drag up the box through Chromium's gesture recognizer, the path a touchscreen takes. */
async function fingerDrag(page: Page, box: Locator, dy: number) {
  const geo = await box.boundingBox();
  if (!geo) throw new Error('the scroller has no box');
  const x = geo.x + geo.width / 2;
  const y0 = geo.y + geo.height * 0.8;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - (dy * i) / 10 }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * The whole round trip on one scroller: it rests at `home`, a scroll moves it
 * away and shows the button, the button brings it back, and a scroll left
 * alone for the idle minute glides back on its own.
 */
async function roundTrip(page: Page, box: Locator, testId: string, label: string, away: number, home: number) {
  const button = page.getByTestId(`${testId}-home`);
  await expect.poll(() => scrollTop(box)).toBeCloseTo(home, -1);
  await expect(button).toHaveCount(0);

  await wheel(page, box, away);
  await expect.poll(async () => Math.abs((await scrollTop(box)) - home)).toBeGreaterThan(100);
  await expect(button).toBeVisible();
  await expect(button).toHaveText(label);

  await button.click();
  await expect.poll(() => scrollTop(box)).toBeCloseTo(home, -1);
  await expect(button).toHaveCount(0);
  // Let the glide's last frames land before the next wheel, which Chromium
  // would otherwise fold into the glide still running home.
  await page.waitForTimeout(1_000);

  await wheel(page, box, away);
  await expect(button).toBeVisible();
  await page.clock.fastForward(WALL_SCROLL_IDLE_MS - 5_000);
  // Not yet: a minute after the last touch, not before.
  await expect(button).toBeVisible();
  await page.clock.fastForward(6_000);
  await expect.poll(() => scrollTop(box)).toBeCloseTo(home, -1);
  await expect(button).toHaveCount(0);
}

test.describe('Full-Screen Calendar Agenda', () => {
  test('draws every day of the window and scrolls with taps on, then goes back to today', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await stubModuleData(page, { overrides: { calendar: twoWeeksOfEvents() } });
    await show(page, request, 'fullscreen-calendar', { view: 'agenda', eventTapDetails: true }, { w: 1080, h: 1920 });

    const box = page.getByTestId('fsc-agenda-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'on');
    // The last day of the 14-day window is drawn, below the fold.
    await expect(page.locator('[data-event-id="ev-41"]')).toBeAttached();
    const { scrollHeight, clientHeight } = await box.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight).toBeGreaterThan(clientHeight * 2);
    await roundTrip(page, box, 'fsc-agenda-scroll', 'Back to today', 1500, 0);
  });

  test('looks and stays as before with taps off', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await stubModuleData(page, { overrides: { calendar: twoWeeksOfEvents() } });
    await show(page, request, 'fullscreen-calendar', { view: 'agenda', eventTapDetails: false }, { w: 1080, h: 1920 });

    const box = page.getByTestId('fsc-agenda-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'off');
    await expect(box).toHaveCSS('overflow-y', 'hidden');
    await expect(page.locator('[data-event-id="ev-0"]')).toBeVisible();
    await wheel(page, box, 1500);
    await page.waitForTimeout(500);
    expect(await scrollTop(box)).toBe(0);
    await expect(page.getByTestId('fsc-agenda-scroll-home')).toHaveCount(0);
    await expect(page.getByTestId('fsc-agenda-scroll-thumb')).toHaveCount(0);
  });

  test.describe('real touch input', () => {
    test.use({ hasTouch: true });

    test('a finger drag scrolls the agenda', async ({ page, request }) => {
      await stubModuleData(page, { overrides: { calendar: twoWeeksOfEvents() } });
      await show(page, request, 'fullscreen-calendar', { view: 'agenda', eventTapDetails: true }, { w: 1080, h: 1920 });
      await page.waitForFunction(() => document.body.style.touchAction === 'pan-y');

      const box = page.getByTestId('fsc-agenda-scroll');
      await expect(page.locator('[data-event-id="ev-0"]')).toBeVisible();
      await fingerDrag(page, box, 700);
      await expect.poll(() => scrollTop(box)).toBeGreaterThan(300);
      await expect(page.getByTestId('fsc-agenda-scroll-home')).toHaveText('Back to today');
    });
  });
});

test.describe('Meal Planner List', () => {
  test('rests at today, scrolls back through the week with taps on, and goes back to today', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await seedWeekOfMeals(request);
    await show(page, request, 'meal-planner', { view: 'list', interactive: true }, { w: 520, h: 360 });

    const box = page.getByTestId('meal-list-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'on');
    // Home is today's heading at the top of the box, with the days before it
    // above (the week starts on Sunday; today is Wednesday; the module is
    // short enough for the week to scroll that far, see mealListScrollTop).
    const today = box.getByText('Today', { exact: true });
    await expect(today).toBeVisible();
    await expect.poll(async () => {
      const [b, t] = await Promise.all([box.boundingBox(), today.boundingBox()]);
      return Math.abs((t?.y ?? 0) - (b?.y ?? 0));
    }).toBeLessThan(4);
    const home = await scrollTop(box);
    expect(home).toBeGreaterThan(100);

    // Up to Sunday and back.
    await roundTrip(page, box, 'meal-list-scroll', 'Back to today', -1200, home);
  });

  test('stays pinned at today with taps off', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await seedWeekOfMeals(request);
    await show(page, request, 'meal-planner', { view: 'list', interactive: false }, { w: 520, h: 360 });

    const box = page.getByTestId('meal-list-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'off');
    await expect(box).toHaveCSS('overflow-y', 'hidden');
    await expect(box.getByText('Today', { exact: true })).toBeVisible();
    await expect.poll(() => scrollTop(box)).toBeGreaterThan(100);
    const home = await scrollTop(box);
    await wheel(page, box, -1200);
    await page.waitForTimeout(500);
    expect(await scrollTop(box)).toBe(home);
    await expect(page.getByTestId('meal-list-scroll-home')).toHaveCount(0);
  });
});

test.describe('Meal Planner Grocery List', () => {
  test('scrolls instead of turning pages with taps on, then goes back to the top', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await seedWeekOfMeals(request);
    await show(page, request, 'meal-planner', { view: 'grocery', interactive: true }, { w: 520, h: 640 });

    const box = page.getByTestId('meal-grocery-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'on');
    // Every row is there, and no page count.
    await expect(box.getByTestId('meal-grocery-item')).toHaveCount(30);
    await expect(page.getByTestId('meal-grocery-page')).toHaveCount(0);
    const { scrollHeight, clientHeight } = await box.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight).toBeGreaterThan(clientHeight * 1.5);
    await roundTrip(page, box, 'meal-grocery-scroll', 'Back to the top', 900, 0);
  });

  test('turns pages as before with taps off', async ({ page, request }) => {
    await seedWeekOfMeals(request);
    await show(page, request, 'meal-planner', { view: 'grocery', interactive: false }, { w: 520, h: 640 });

    const mod = page.locator('[data-module-id="listy"]');
    await expect(mod.getByTestId('meal-grocery-page')).toHaveText(/^1 of [2-9]$/);
    await expect(page.getByTestId('meal-grocery-scroll')).toHaveCount(0);
    // Only the first page's rows show.
    const shown = await mod.getByTestId('meal-grocery-item').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length);
    expect(shown).toBeLessThan(30);
  });

  test('the full-screen list stacks its pages for a finger with taps on', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    // More than two columns hold, even at the smallest type the list steps down to.
    await seedWeekOfMeals(request, 140);
    await show(page, request, 'fullscreen-meal-planner', { view: 'grocery', interactive: true }, { w: 1080, h: 1920 });

    const box = page.getByTestId('fmp-grocery-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'on');
    await expect(box.getByTestId('fmp-grocery-item')).toHaveCount(140);
    await expect(page.getByTestId('fmp-grocery-page')).toHaveCount(0);
    await expect.poll(() => box.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200);
    await roundTrip(page, box, 'fmp-grocery-scroll', 'Back to the top', 1200, 0);
  });
});

test.describe('To-Do List', () => {
  const ITEMS = 40;
  /** One list far longer than a small module: forty open items. */
  const longList = () => ({
    lists: [{
      id: E2E_TODO_LIST_ID, name: 'Before the trip',
      items: Array.from({ length: ITEMS }, (_, i) => ({ id: `t${i}`, text: `Thing number ${i + 1}` })),
    }],
  });

  test('draws every item and scrolls with taps on, then goes back to the top', async ({ page, request, sandboxDir }) => {
    await page.clock.install({ time: NOW });
    seedTodos(sandboxDir, longList());
    await show(page, request, 'todo', { listId: E2E_TODO_LIST_ID, interactive: true }, { w: 520, h: 640 });

    const box = page.getByTestId('todo-list-scroll');
    await expect(box).toHaveAttribute('data-wall-scroll', 'on');
    // Every row is there, and no "and N more".
    await expect(box.getByTestId('todo-item')).toHaveCount(ITEMS);
    await expect(page.getByTestId('todo-more')).toHaveCount(0);
    const { scrollHeight, clientHeight } = await box.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight).toBeGreaterThan(clientHeight * 1.5);
    await roundTrip(page, box, 'todo-list-scroll', 'Back to the top', 900, 0);

    // A row inside the scrolling box still ticks on a tap.
    const row = box.getByRole('button', { name: 'Thing number 1', exact: true });
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  test('fits what it can and counts the rest with taps off', async ({ page, request, sandboxDir }) => {
    seedTodos(sandboxDir, longList());
    await show(page, request, 'todo', { listId: E2E_TODO_LIST_ID, interactive: false }, { w: 520, h: 640 });

    const mod = page.locator('[data-module-id="listy"]');
    await expect(mod.getByTestId('todo-more')).toHaveText(/^and \d+ more$/);
    await expect(page.getByTestId('todo-list-scroll')).toHaveCount(0);
    const shown = await mod.getByTestId('todo-item').count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(ITEMS);
  });
});

test.describe('Frosted cards', () => {
  // A Pi 4 re-blurs a frosted card behind every scrolled frame; the glass rests while the list moves.
  test('drops the card\'s frosted glass while the list moves, and puts it back when it stops', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: twoWeeksOfEvents() } });
    // A small module: it draws inside the frosted card (full-screen modules draw their own background).
    const mod = buildModuleInstance('calendar', { viewMode: 'agenda', daysToShow: 14, eventTapDetails: true });
    mod.id = 'listy';
    mod.size = { w: 520, h: 560 };
    mod.position = { x: 60, y: 120 };
    mod.style = { ...mod.style, backdropBlur: 12 };
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings: matrixSettings() }));
    await page.goto('/display');
    const card = page.locator('[data-module-id="listy"] [data-module-card]');
    await expect(card).toHaveCSS('backdrop-filter', 'blur(12px)');
    await expect(page.getByTestId('calendar-agenda-scroll')).toHaveAttribute('data-wall-scroll', 'on');

    const moving = await page.getByTestId('calendar-agenda-scroll').evaluate(async (el) => {
      const scrolled = new Promise((resolve) => el.addEventListener('scroll', resolve, { once: true }));
      el.scrollTop = 600;
      await scrolled;
      const cardEl = el.closest('[data-module-card]')!;
      return { marked: cardEl.hasAttribute('data-wall-scrolling'), filter: getComputedStyle(cardEl).backdropFilter };
    });
    expect(moving).toEqual({ marked: true, filter: 'none' });
    await expect(card).not.toHaveAttribute('data-wall-scrolling');
    await expect(card).toHaveCSS('backdrop-filter', 'blur(12px)');
  });
});
