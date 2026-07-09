import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { ModuleSchedule } from '@/types/config';

/**
 * Module scheduling + visibility gating on the live display.
 *
 * The renderer's predicate is `isModuleRenderable` (ScreenRenderer.tsx):
 *   !backgroundProvider && enabled && schedule && visibility  — all AND-combined.
 *
 * The display evaluates schedules against a timezone-aware wall clock. With no
 * `settings.timezone`, that clock is `new Date()` (browser local), which is the
 * same machine and zone as this test runner — so a window/day computed here
 * lines up with what the display sees. Day-of-week is the most robust primitive
 * (it changes at a single instant), so the pure show/hide test keys off it;
 * the time-window test brackets "now" and is wrap-safe for any hour.
 */

/** A time window offset from the current minute, wrap-safe across midnight. */
function windowAround(startOffsetMin: number, endOffsetMin: number): ModuleSchedule {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { startTime: fmt(wrap(nowMin + startOffsetMin)), endTime: fmt(wrap(nowMin + endOffsetMin)) };
}

test('a module is shown on its scheduled day and hidden off it', async ({ page, request }) => {
  const today = new Date().getDay();
  const otherDay = (today + 3) % 7;
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [
      textModule('SCHEDULED TODAY', { schedule: { daysOfWeek: [today] }, position: { x: 100, y: 100 } }),
      textModule('SCHEDULED OTHER DAY', { schedule: { daysOfWeek: [otherDay] }, position: { x: 100, y: 400 } }),
    ])],
  }));
  await page.goto('/display');
  await expect(page.getByText('SCHEDULED TODAY')).toBeVisible();
  await expect(page.getByText('SCHEDULED OTHER DAY')).toBeHidden();
});

test('a module is shown inside its time window, hidden outside it, and inverted windows flip', async ({ page, request }) => {
  const inside = windowAround(-120, 120); // brackets now
  const future = windowAround(60, 180);   // starts in the future — excludes now
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [
      textModule('INSIDE WINDOW', { schedule: inside, position: { x: 100, y: 100 } }),
      textModule('OUTSIDE WINDOW', { schedule: future, position: { x: 100, y: 400 } }),
      textModule('INVERTED HIDDEN', { schedule: { ...inside, invert: true }, position: { x: 100, y: 700 } }),
    ])],
  }));
  await page.goto('/display');
  await expect(page.getByText('INSIDE WINDOW')).toBeVisible();
  await expect(page.getByText('OUTSIDE WINDOW')).toBeHidden();
  await expect(page.getByText('INVERTED HIDDEN')).toBeHidden();
});

test('enabled, schedule, and visibility conditions AND-combine at render time', async ({ page, request }) => {
  const today = new Date().getDay();
  const onSchedule: ModuleSchedule = { daysOfWeek: [today] };
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [
      // All three gates pass → visible.
      textModule('ALL GATES PASS', { enabled: true, schedule: onSchedule, position: { x: 100, y: 100 } }),
      // enabled:false alone hides it, even though the schedule matches today.
      textModule('DISABLED HIDDEN', { enabled: false, schedule: onSchedule, position: { x: 100, y: 300 } }),
      // Schedule matches, but a condition on an unpublished key + whenUnknown:'hide' hides it.
      textModule('CONDITION HIDDEN', {
        schedule: onSchedule,
        visibility: { conditions: [{ kind: 'state', sourceKey: 'sensor.never_published', equals: 'on' }], whenUnknown: 'hide' },
        position: { x: 100, y: 500 },
      }),
      // Same unpublished key but whenUnknown:'show' → the fallback keeps it visible.
      textModule('CONDITION SHOWN', {
        schedule: onSchedule,
        visibility: { conditions: [{ kind: 'state', sourceKey: 'sensor.never_published', equals: 'on' }], whenUnknown: 'show' },
        position: { x: 100, y: 700 },
      }),
    ])],
  }));
  await page.goto('/display');
  await expect(page.getByText('ALL GATES PASS')).toBeVisible();
  await expect(page.getByText('CONDITION SHOWN')).toBeVisible();
  await expect(page.getByText('DISABLED HIDDEN')).toBeHidden();
  await expect(page.getByText('CONDITION HIDDEN')).toBeHidden();
});
