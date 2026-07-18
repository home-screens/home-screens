import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import type { Profile } from '@/types/config';

/**
 * Profile *runtime* auto-activation — the display-side behavior, not the
 * ProfilesSection CRUD UI (covered in e2e/editor/profiles-settings.spec.ts).
 *
 * `resolveProfileScreens` (src/lib/schedule.ts) drives the rotator's screen
 * set on every minute tick:
 *   1. the first profile whose `schedule` window contains "now" wins — its
 *      `screenIds` become the entire rotation set (auto-activation);
 *   2. otherwise the manually-set `activeProfile` id is used;
 *   3. otherwise all screens rotate (the default set).
 * ScreenRotator only mounts the *current* screen, so a screen that the active
 * profile excludes is entirely absent from the DOM — that absence is the
 * signal these specs assert on.
 *
 * Schedule windows are stamped relative to the real wall clock (like the
 * calendar/meal fixtures), because `isModuleVisible` reads the browser's live
 * `Date`. A window keyed on today's day-of-week reliably brackets "now"; one
 * keyed on a different day reliably excludes it — no fake timers needed.
 */

/** Day-of-week (0–6) offsets relative to the machine running the test. */
const TODAY = new Date().getDay();
const NOT_TODAY = (TODAY + 3) % 7;

/**
 * A time window guaranteed to contain "now" (±60 min, wrapping past midnight
 * when needed). No `daysOfWeek`, so only the time gate governs — that keeps it
 * robust at any hour, including the post-midnight arm of an overnight window
 * where `isModuleVisible` would otherwise attribute the tick to yesterday.
 */
function windowAroundNow(): { startTime: string; endTime: string } {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lo = (nowMin - 60 + 1440) % 1440;
  const hi = (nowMin + 60) % 1440;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { startTime: fmt(lo), endTime: fmt(hi) };
}

/** A default screen followed by a profile-only screen, with distinct text. */
function twoScreens(defaultText: string, profileText: string) {
  return [
    makeScreen('default-screen', 'Default', [textModule(defaultText)]),
    makeScreen('profile-screen', 'Profile', [textModule(profileText)]),
  ];
}

test('a scheduled profile auto-activates inside its day window and swaps the screen set', async ({ page, request }) => {
  const profile: Profile = {
    id: 'sched',
    name: 'Scheduled',
    screenIds: ['profile-screen'],
    schedule: { daysOfWeek: [TODAY] },
  };
  const config = baseConfig({ screens: twoScreens('DEFAULT SET SCREEN', 'SCHEDULED PROFILE SCREEN') });
  config.profiles = [profile];

  await renderOnDisplay(page, request, config);

  // Only the profile's screen rotates; the default-set screen is filtered out.
  await expect(page.getByText('SCHEDULED PROFILE SCREEN', { exact: true })).toBeVisible();
  await expect(page.getByText('DEFAULT SET SCREEN', { exact: true })).toHaveCount(0);
});

test('the same profile does not activate outside its day window; the default set rotates', async ({ page, request }) => {
  const profile: Profile = {
    id: 'sched',
    name: 'Scheduled',
    screenIds: ['profile-screen'],
    // Same profile as above, but scheduled for a day that is not today.
    schedule: { daysOfWeek: [NOT_TODAY] },
  };
  const config = baseConfig({ screens: twoScreens('DEFAULT SET SCREEN', 'SCHEDULED PROFILE SCREEN') });
  config.profiles = [profile];

  await renderOnDisplay(page, request, config);

  // No schedule match and no manual activeProfile → all screens; the first
  // (default) screen renders and the profile-only screen never mounts.
  await expect(page.getByText('DEFAULT SET SCREEN', { exact: true })).toBeVisible();
  await expect(page.getByText('SCHEDULED PROFILE SCREEN', { exact: true })).toHaveCount(0);
});

test('a scheduled profile auto-activates inside an explicit time window', async ({ page, request }) => {
  // Exercises the start/end time branch of isModuleVisible (the day-window
  // test above hits the "no times → whole day" special case instead).
  const profile: Profile = {
    id: 'sched',
    name: 'Scheduled',
    screenIds: ['profile-screen'],
    schedule: windowAroundNow(),
  };
  const config = baseConfig({ screens: twoScreens('DEFAULT SET SCREEN', 'TIME WINDOW PROFILE SCREEN') });
  config.profiles = [profile];

  await renderOnDisplay(page, request, config);

  await expect(page.getByText('TIME WINDOW PROFILE SCREEN', { exact: true })).toBeVisible();
  await expect(page.getByText('DEFAULT SET SCREEN', { exact: true })).toHaveCount(0);
});

test("each display auto-activates its own activeProfile, overriding the global one", async ({ page, request }) => {
  // Multi-display: every display owns its profiles + activeProfile, so
  // getActiveProfileId resolves per-display and ignores GlobalSettings.
  // The global activeProfile below is a dangling id — if it ever leaked into
  // a display, that display would find no matching profile and fall back to
  // ALL screens (its default-set screen first), which the assertions rule out.
  const config = baseConfig({
    settings: { activeProfile: 'global-unused' },
    displays: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [
          makeScreen('k-default', 'K Default', [textModule('KITCHEN DEFAULT')]),
          makeScreen('k-special', 'K Special', [textModule('KITCHEN SPECIAL')]),
        ],
        profiles: [{ id: 'k-night', name: 'Night', screenIds: ['k-special'] }],
        activeProfile: 'k-night',
      },
      {
        id: 'living',
        name: 'Living',
        screens: [
          makeScreen('l-default', 'L Default', [textModule('LIVING DEFAULT')]),
          makeScreen('l-special', 'L Special', [textModule('LIVING SPECIAL')]),
        ],
        profiles: [{ id: 'l-night', name: 'Night', screenIds: ['l-special'] }],
        activeProfile: 'l-night',
      },
    ],
  });

  await renderOnDisplay(page, request, config, '/display/kitchen');
  await expect(page.getByText('KITCHEN SPECIAL', { exact: true })).toBeVisible();
  await expect(page.getByText('KITCHEN DEFAULT', { exact: true })).toHaveCount(0);

  await renderOnDisplay(page, request, config, '/display/living');
  await expect(page.getByText('LIVING SPECIAL', { exact: true })).toBeVisible();
  await expect(page.getByText('LIVING DEFAULT', { exact: true })).toHaveCount(0);
});

test("a display that owns profiles but has none active does not inherit a global activeProfile that coincides with one of its own owned profile ids", async ({ page, request }) => {
  // The exact wrong-screens bug: an owning display leaves its own
  // `activeProfile` unset, and the GLOBAL settings.activeProfile happens to
  // equal an id that IS one of THAT display's owned profiles. This collision
  // arises naturally — `main`'s auto-seed copies the global profile ids
  // verbatim. getActiveProfileId (editor UI) correctly resolves "none active"
  // for an owning display with no override; filterConfigForDisplay must agree
  // and NOT leak the global into merged.settings.activeProfile. If it leaked,
  // the coincidentally-matching profile would auto-activate and swap the
  // screen set — so a visible default screen proves the leak is gone.
  const config = baseConfig({
    settings: { activeProfile: 'k-night' },
    displays: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [
          makeScreen('k-default', 'K Default', [textModule('KITCHEN DEFAULT')]),
          makeScreen('k-special', 'K Special', [textModule('KITCHEN SPECIAL')]),
        ],
        // Owns a profile whose id collides with the global activeProfile,
        // but sets no activeProfile of its own → should be "none active".
        profiles: [{ id: 'k-night', name: 'Night', screenIds: ['k-special'] }],
      },
    ],
  });

  await renderOnDisplay(page, request, config, '/display/kitchen');

  // No owned activeProfile and no leaked global → all screens rotate; the
  // default screen renders first and the profile-only screen never mounts.
  await expect(page.getByText('KITCHEN DEFAULT', { exact: true })).toBeVisible();
  await expect(page.getByText('KITCHEN SPECIAL', { exact: true })).toHaveCount(0);
});
