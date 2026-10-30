import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedDayNotes, todayCalendarEvents } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';

/**
 * A calendar on the wall reads the day notes when they change, not on a
 * timer: the heartbeat names the file's revision (the ETag
 * `GET /api/day-notes` answers with), and the wall reads again only when
 * that moves. A note written on a phone is on the wall a few beats later.
 */

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function setUp(page: Page, request: APIRequestContext, sandboxDir: string, notes: Record<number, string | string[]>) {
  seedDayNotes(sandboxDir, notes);
  await stubModuleData(page, { overrides: { calendar: todayCalendarEvents() } });
  const cal = buildModuleInstance('calendar', { viewMode: 'daily', daysToShow: 3 });
  cal.id = 'cal';
  cal.size = { w: 900, h: 700 };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [cal])], settings: matrixSettings() }));
}

function watchReads(page: Page): string[] {
  const reads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/day-notes') reads.push(url.pathname);
  });
  return reads;
}

async function beats(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/display/commands', { timeout: 10_000 });
  }
}

test.describe('a calendar wall follows the day notes heartbeat', () => {
  test.describe.configure({ timeout: 60_000 });
  // Later specs in this worker draw calendars too; leave no note behind.
  test.afterEach(({ sandboxDir }) => seedDayNotes(sandboxDir, {}));

  test('reads the notes as it mounts, then nothing while nothing changes', async ({ page, request, sandboxDir }) => {
    await setUp(page, request, sandboxDir, { 0: 'Library books back' });
    const reads = watchReads(page);
    await page.goto('/display');
    const cal = page.locator('[data-module-id="cal"]');
    await expect(cal.locator('[data-day-note]')).toHaveText('Library books back');
    await beats(page, 1);
    const settled = reads.length;
    expect(settled).toBeGreaterThan(0);
    await beats(page, 4);
    expect(reads.slice(settled)).toEqual([]);
  });

  test('a note written on a phone is on the wall within a few beats, and gone again when removed, with no reload', async ({ page, request, sandboxDir }) => {
    await setUp(page, request, sandboxDir, {});
    const loads: string[] = [];
    page.on('load', () => loads.push(page.url()));
    await page.goto('/display');
    const cal = page.locator('[data-module-id="cal"]');
    await expect(cal).toContainText('Dentist Appointment');
    await expect(cal.locator('[data-day-note]')).toHaveCount(0);
    await beats(page, 1);

    const saved = await request.post('/api/day-notes', { data: { date: isoToday(), text: 'Picture day' } });
    expect(saved.ok(), `POST answered ${saved.status()}`).toBe(true);
    const { created } = (await saved.json()) as { created: { id: string } };
    await expect(cal.locator('[data-day-note]')).toHaveText('Picture day', { timeout: 10_000 });

    const removed = await request.delete(`/api/day-notes/${created.id}`);
    expect(removed.ok()).toBe(true);
    await expect(cal.locator('[data-day-note]')).toHaveCount(0, { timeout: 10_000 });
    expect(loads, 'the wall must pick the note up without reloading').toHaveLength(1);
  });
});
