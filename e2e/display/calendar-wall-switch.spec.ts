import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { putConfig, seedFamily, todayCalendarEvents } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import type { ModuleInstance } from '@/types/config';

/**
 * Switching a calendar's view and showing one person from a touch wall: the
 * row of view buttons under the heading, the "Whose calendar?" sheet, and the
 * minute after which both go back.
 */

const PEOPLE = [
  { id: 'ann', name: 'Ann', color: '#60a5fa' },
  { id: 'ben', name: 'Ben', color: '#fbbf24' },
  { id: 'cal', name: 'Cal', color: '#4ade80' },
];
const GROUPS = [{ id: 'kids', name: 'Kids', memberIds: ['ben', 'cal'] }];

/**
 * An event this month that the week holding today does not reach: on the
 * 1st once the week has left it behind, on the 25th before then. Only a
 * fetch of the whole month brings it to the wall.
 */
function elsewhereThisMonth() {
  const day = new Date();
  day.setDate(day.getDate() >= 12 ? 1 : 25);
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  return { ...todayCalendarEvents()[0], id: 'far-1', title: 'FAR EVENT', start: `${date}T12:00:00`, end: `${date}T13:00:00`, sourceId: 'house', sourceName: 'House' };
}

async function openWall(page: Page, request: APIRequestContext, sandboxDir: string, instance: ModuleInstance, owners: Record<string, string[]> = { ann: ['ann-cal'], ben: ['ben-cal'], cal: ['cal-cal'] }) {
  seedFamily(sandboxDir, PEOPLE, GROUPS);
  const base = todayCalendarEvents()[0];
  await stubModuleData(page, {
    // The hub's window rule: a borrowed view only draws what the wall asked for.
    calendarWindow: true,
    overrides: {
      calendar: [
        elsewhereThisMonth(),
        { ...base, id: 'ann-1', title: 'ANN EVENT', sourceId: 'ann-cal', sourceName: 'Ann' },
        { ...base, id: 'ben-1', title: 'BEN EVENT', sourceId: 'ben-cal', sourceName: 'Ben' },
        { ...base, id: 'house-1', title: 'HOUSE EVENT', sourceId: 'house', sourceName: 'House' },
      ],
    },
  });
  const config = baseConfig({ screens: [makeScreen('cal', 'Calendar', [instance])] });
  config.settings.calendar.icalSources = ['ann-cal', 'ben-cal', 'cal-cal', 'house'].map((id) => ({ id, name: id, type: 'ical' as const, url: `https://example.com/${id}.ics`, color: '#60a5fa', enabled: true }));
  config.settings.calendar.personSources = owners;
  await putConfig(request, config);
  await page.goto('/display');
  const mod = page.locator(`[data-module-id="${instance.id}"]`);
  await expect(mod.getByText('ANN EVENT').first()).toBeVisible();
  return mod;
}

const monthTitle = () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

test.describe('the full-screen calendar', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

  const fullscreen = (config: Record<string, unknown> = {}) =>
    buildModuleInstance('fullscreen-calendar', { view: 'week-list', eventTapDetails: true, wallViews: ['month-grid'], showOnePerson: true, ...config });

  test('switches views from the row under the heading, which takes the place of the view label', async ({ page, request, sandboxDir }) => {
    const mod = await openWall(page, request, sandboxDir, fullscreen());
    await expect(mod.getByTestId('calendar-switch-bar')).toBeVisible();
    await expect(mod.locator('.fsc-view-badge')).toHaveCount(0);
    await expect(mod.locator('[data-wall-view="week-list"]')).toHaveAttribute('aria-pressed', 'true');

    await mod.locator('[data-wall-view="month-grid"]').click();
    await expect(mod.locator('[data-wall-view="month-grid"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(mod.locator('.fsc-header-title')).toHaveText(monthTitle());
    // The own view's button is the way home.
    await mod.locator('[data-wall-view="week-list"]').click();
    await expect(mod.locator('.fsc-header-title')).not.toHaveText(monthTitle());
  });

  test('fills a borrowed Month with the whole month, not only the days its own view fetched', async ({ page, request, sandboxDir }) => {
    const mod = await openWall(page, request, sandboxDir, fullscreen());
    await expect(mod.getByText('FAR EVENT')).toHaveCount(0);
    await mod.locator('[data-wall-view="month-grid"]').click();
    await expect(mod.getByText('FAR EVENT').first()).toBeVisible();
  });

  test('shows one person with the shared calendar, then everyone again', async ({ page, request, sandboxDir }) => {
    const mod = await openWall(page, request, sandboxDir, fullscreen());
    await mod.getByTestId('calendar-person-button').click();
    const sheet = page.getByTestId('wall-person-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('wall-person-everyone')).toHaveAttribute('data-picked', '');
    // Only the people who own a calendar, and the group with one of them in it.
    await expect(sheet.getByTestId('wall-person-member')).toHaveText([/Ann.*1 event/s, /Ben.*1 event/s, /Cal.*0 events/s]);
    await expect(sheet.getByTestId('wall-person-group')).toHaveText([/Kids.*2 people/s]);

    await sheet.getByTestId('wall-person-member').filter({ hasText: 'Ann' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(mod.getByTestId('calendar-person-button')).toHaveAttribute('data-picked', 'member:ann');
    await expect(mod.getByText('BEN EVENT')).toHaveCount(0);
    await expect(mod.getByText('HOUSE EVENT').first()).toBeVisible();

    await mod.getByTestId('calendar-person-clear').click();
    await expect(mod.getByText('BEN EVENT').first()).toBeVisible();
    await expect(mod.getByTestId('calendar-person-button')).not.toHaveAttribute('data-picked', /./);
  });

  test('goes back to its own view and everyone a minute after the last touch', async ({ page, request, sandboxDir }) => {
    await page.clock.install();
    const mod = await openWall(page, request, sandboxDir, fullscreen());
    await mod.locator('[data-wall-view="month-grid"]').click();
    await expect(mod.locator('.fsc-header-title')).toHaveText(monthTitle());
    await mod.getByTestId('calendar-person-button').click();
    await page.getByTestId('wall-person-member').filter({ hasText: 'Ben' }).click();
    await expect(mod.getByTestId('calendar-person-button')).toHaveAttribute('data-picked', 'member:ben');

    await page.clock.fastForward(WALL_SCROLL_IDLE_MS - 10_000);
    await expect(mod.locator('[data-wall-view="month-grid"]')).toHaveAttribute('aria-pressed', 'true');
    await page.clock.fastForward(11_000);
    await expect(mod.locator('[data-wall-view="week-list"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(mod.locator('.fsc-header-title')).not.toHaveText(monthTitle());
    await expect(mod.getByTestId('calendar-person-button')).not.toHaveAttribute('data-picked', /./);
    // The view changes at once, with no fade waiting on animation frames.
    await expect(mod.locator('.fsc-content [role="grid"]')).toHaveCount(0);
    await expect(mod.getByText('ANN EVENT').first()).toBeVisible();
  });

  test('shows everyone again a minute after a person was picked', async ({ page, request, sandboxDir }) => {
    await page.clock.install();
    const mod = await openWall(page, request, sandboxDir, fullscreen());
    await mod.getByTestId('calendar-person-button').click();
    await page.getByTestId('wall-person-member').filter({ hasText: 'Ben' }).click();
    await expect(mod.getByText('ANN EVENT')).toHaveCount(0);
    await page.clock.fastForward(WALL_SCROLL_IDLE_MS + 1_000);
    await expect(mod.getByText('ANN EVENT').first()).toBeVisible();
  });

  test('keeps today’s look for a calendar saved before the row, and with nobody to choose between', async ({ page, request, sandboxDir }) => {
    const saved = fullscreen();
    delete (saved.config as Record<string, unknown>).wallViews;
    delete (saved.config as Record<string, unknown>).showOnePerson;
    const mod = await openWall(page, request, sandboxDir, saved);
    await expect(mod.getByTestId('calendar-switch-bar')).toHaveCount(0);
    await expect(mod.locator('.fsc-view-badge')).toBeVisible();
  });

  test('offers no person button while only one person owns a calendar', async ({ page, request, sandboxDir }) => {
    const mod = await openWall(page, request, sandboxDir, fullscreen(), { ann: ['ann-cal'] });
    await expect(mod.getByTestId('calendar-switch-bar')).toBeVisible();
    await expect(mod.getByTestId('calendar-person-button')).toHaveCount(0);
  });
});

test.describe('the Calendar card', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

  const card = (height: number) => {
    const instance = buildModuleInstance('calendar', { viewMode: 'week', eventTapDetails: true, wallViews: ['month'], showOnePerson: true });
    instance.position = { x: 60, y: 200 };
    instance.size = { w: 960, h: height };
    return instance;
  };

  test('shows the row on a tall card and switches it to Month', async ({ page, request, sandboxDir }) => {
    const mod = await openWall(page, request, sandboxDir, card(620));
    await expect(mod.getByTestId('calendar-switch-bar')).toBeVisible();
    await mod.locator('[data-wall-view="month"]').click();
    await expect(mod.locator('[data-wall-view="month"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(mod.getByTestId('look-ahead-bar')).toContainText(monthTitle());
  });

  test('leaves the row off a card too short for it', async ({ page, request, sandboxDir }) => {
    const mod = await openWall(page, request, sandboxDir, card(340));
    await expect(mod.getByTestId('calendar-switch-bar')).toHaveCount(0);
  });
});
