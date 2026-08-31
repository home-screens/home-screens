import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { windowAround } from '../helpers/schedule-windows';
import type { ModuleSchedule } from '@/types/config';

/**
 * Screen-level scheduling differs from the module-level tests above: a screen
 * whose `schedule` excludes "now" is dropped from the *rotating set* entirely
 * (ScreenRotator's `scheduledScreens`), rather than merely being hidden in
 * place. The empty-result fallback below guards against a blank kiosk when the
 * filter would leave nothing.
 */

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
 * the time-window test brackets "now" and is wrap-safe for any hour. The
 * bracketing technique lives in ../helpers/schedule-windows.ts (`windowAround`).
 */

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

test('a screen scheduled outside its window is skipped in rotation', async ({ page, request }) => {
  // The middle screen's window starts in the future, so it is excluded from the
  // rotating set now. The rotating set is [In A, In C] and the timer steps
  // In A -> In C -> In A, never landing on the off-window screen.
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('in-a', 'In A', [textModule('IN WINDOW A')]),
      makeScreen('off', 'Off', [textModule('OFF WINDOW SCREEN')], { schedule: windowAround(60, 180) }),
      makeScreen('in-c', 'In C', [textModule('IN WINDOW C')]),
    ],
    settings: { rotationIntervalMs: 1500 },
  }));
  await page.goto('/display');
  await expect(page.getByText('IN WINDOW A')).toBeVisible();
  // Rotation advances to the next in-window screen, proving the off-window one
  // was not part of the rotating set.
  await expect(page.getByText('IN WINDOW C')).toBeVisible({ timeout: 6000 });
  // The off-window screen never renders (only currentScreen mounts).
  await expect(page.getByText('OFF WINDOW SCREEN')).toBeHidden();
});

test('when every screen is scheduled out, the rotator falls back to enabled screens (no blank kiosk)', async ({ page, request }) => {
  // Both screens have future-starting windows, so the schedule filter would
  // leave nothing. ScreenRotator's `filtered.length > 0 ? filtered : enabledScreens`
  // fallback keeps the enabled set rotating instead of showing the empty state.
  // Rotation is frozen (default 1h interval) so index 0 stays put and the
  // assertion is stable.
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('out-a', 'Out A', [textModule('FALLBACK SCREEN A')], { schedule: windowAround(60, 180) }),
      makeScreen('out-b', 'Out B', [textModule('FALLBACK SCREEN B')], { schedule: windowAround(60, 180) }),
    ],
  }));
  await page.goto('/display');
  // The kiosk shows the fallback screen, not the empty-display watermark.
  await expect(page.getByText('FALLBACK SCREEN A')).toBeVisible();
  await expect(page.getByTestId('empty-display-hint')).toBeHidden();
});
