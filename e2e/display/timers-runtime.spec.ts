import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { ScreenConfiguration } from '@/types/config';

/**
 * Kiosk-side timer BEHAVIOR. The sibling `timers.spec.ts` is geometry only
 * (each view's mockup-fit sizing across display shapes); here we drive the
 * session lifecycle through its real routes and assert what the display does.
 *
 * The mechanics that shape every timeout below (src/components/display/
 * TimerOverlay.tsx): the overlay polls `GET /api/timers/session` every
 * SESSION_POLL_MS (3s) for session *events* — start, pause, skip, cancel — and
 * derives the countdown locally from the session's epoch timestamps on a
 * TICK_MS (250ms) tick. So anything server-initiated (a pause posted by
 * /remote) rides at least one 3s poll, while anything time-derived (a step
 * elapsing, a hold surfacing, the session expiring) lands on the local tick
 * with no poll involved. `/api/timers/session` also caches reads for 1s, but
 * mutations invalidate it, so controls surface on the next poll either way.
 *
 * Every session here uses seconds-scale durations (MIN_STEP_SEC is 5) and the
 * `ring` view, whose dial holds the countdown, the "Done!" tap pill, and the
 * "Paused" pill — so one locator scope (`timer-dial`) covers the current step
 * without colliding with the routine chips rendered along the bottom.
 *
 * Isolation: there is exactly ONE session globally, and `start` replaces
 * whatever was running. A finished session lingers SESSION_LINGER_MS (15s) as
 * the celebration and cannot be cancelled (the route 404s on a non-running
 * session), so tests that assert the ABSENCE of a takeover start their own
 * session first rather than relying on the previous test having drained.
 */

const ROTATION_TEXT = 'TIMER ROTATION CONTENT';

/** Single screen of ordinary rotation content, sitting under any takeover. */
function timerConfig(displayIds?: string[]): ScreenConfiguration {
  const screens = [makeScreen('s', 'S', [textModule(ROTATION_TEXT)])];
  if (!displayIds) return baseConfig({ screens });
  return baseConfig({
    screens,
    displays: displayIds.map((id) => ({
      id,
      name: id,
      screens: [makeScreen(`${id}-s`, `${id} S`, [textModule(ROTATION_TEXT)])],
    })),
  });
}

async function startQuick(
  request: APIRequestContext,
  durationSec: number,
  targets: 'all' | string[] = 'all',
): Promise<void> {
  const res = await request.post('/api/timers/session', {
    data: { action: 'start', kind: 'quick', durationSec, targets, view: 'ring', sound: false },
  });
  expect(res.ok()).toBe(true);
}

/**
 * A two-step routine whose FIRST step is a hold: 5s of countdown, then it
 * waits for a tap instead of advancing. Step lengths are whole minutes on the
 * second step so the chip strip reads "10 min" and can never be mistaken for
 * the dial's clock-formatted countdown.
 */
const HOLD_ROUTINE = {
  routines: [{
    id: 'hold-r',
    name: 'Tap routine',
    icon: '🖐️',
    view: 'ring',
    sound: false,
    steps: [
      { id: 'h1', label: 'Wait for a tap', icon: '⏳', durationSec: 5, waitForTap: true },
      { id: 'h2', label: 'After the tap', icon: '➡️', durationSec: 600 },
    ],
  }],
};

async function startHoldRoutine(request: APIRequestContext): Promise<void> {
  const put = await request.put('/api/timers/routines', { data: HOLD_ROUTINE });
  expect(put.ok()).toBe(true);
  const res = await request.post('/api/timers/session', {
    data: { action: 'start', kind: 'routine', routineId: 'hold-r', targets: 'all', view: 'ring', sound: false },
  });
  expect(res.ok()).toBe(true);
}

async function control(request: APIRequestContext, action: string): Promise<void> {
  const res = await request.post('/api/timers/session', { data: { action } });
  expect(res.ok()).toBe(true);
}

const dial = (page: Page) => page.getByTestId('timer-dial');

/** The dial's live countdown, in whole seconds. */
async function readCountdownSec(page: Page): Promise<number> {
  const text = await dial(page).getByText(/^\d+:\d\d$/).first().innerText();
  const [m, s] = text.split(':').map(Number);
  return m * 60 + s;
}

// A running session in the worker's shared data/ would take over the display
// for every later spec in this worker — always clear it. A done/cancelled
// session can't be cancelled (404) and simply expires; ignore that failure.
test.afterEach(async ({ request }) => {
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
});

test('the countdown ticks down in real time between server polls', async ({ page, request }) => {
  await putConfig(request, timerConfig());
  await startQuick(request, 240);
  await page.clock.install();
  await page.goto('/display');

  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'ring');
  const first = await readCountdownSec(page);
  expect(first).toBeGreaterThan(0);

  // 2.5s is well inside one 3s session poll, so the decrease can only come
  // from the local 250ms tick re-materializing the session — which is the
  // whole point of the design (poll latency must not affect the countdown).
  // page.clock fakes that local tick directly instead of waiting on it.
  await page.clock.runFor(2500);
  const second = await readCountdownSec(page);

  expect(second).toBeLessThan(first);
  // Allow a second of slack either side of the 2.5s advance for render phase.
  expect(first - second).toBeGreaterThanOrEqual(2);
  expect(first - second).toBeLessThanOrEqual(4);
});

test('an elapsed timer flips to the celebration, then hands the screen back to rotation', async ({ page, request }) => {
  // Completion and the SESSION_LINGER_MS (15s) linger are both derived
  // client-side from epoch timestamps via materializeSession (src/lib/
  // timer-logic.ts) — a pure, idempotent function of (raw session, now). The
  // 3s session poll keeps refetching the SERVER's own materialization (using
  // the server's real, unfaked clock, so it still reports "running" while our
  // virtual time races ahead) — but re-applying the client's later fake `now`
  // to that raw data always re-derives the same or a further-advanced state,
  // so the poll can't undo what the local tick already advanced past. Fakes
  // the client's Date/setInterval and skips the wait entirely.
  await putConfig(request, timerConfig());
  await startQuick(request, 5); // MIN_STEP_SEC — the shortest legal session
  await page.clock.install();
  await page.goto('/display');

  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'ring');

  // Past the 5s mark: the overlay swaps the running view for the celebration.
  await page.clock.runFor(5_500);
  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'celebration');
  await expect(page.getByText("Time's up!")).toBeVisible();

  // Past the linger window: materializeSession returns null and the whole
  // overlay unmounts. Rotation kept running underneath the takeover the
  // entire time, so the display is left exactly where rotation would have put
  // it — assert on the overlay being GONE (the underlying module was in the
  // DOM all along, merely covered).
  await page.clock.runFor(15_500);
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);
  await expect(page.getByText(ROTATION_TEXT, { exact: true })).toBeVisible();
});

test('a wait-for-a-tap step holds the routine until the display is tapped', async ({ page, request }) => {
  await putConfig(request, timerConfig());
  await startHoldRoutine(request);
  await page.clock.install();
  await page.goto('/display');

  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expect(dial(page).getByText('Wait for a tap')).toBeVisible();

  // After its 5s the step does NOT advance: the countdown is replaced by the
  // "Done!" pill and the routine waits. Scoped to the dial so the chip strip's
  // own "✓ Done" markers can't satisfy it.
  await page.clock.runFor(5_500);
  await expect(dial(page).getByText('Done!')).toBeVisible();
  await expect(dial(page).getByText(/^\d+:\d\d$/)).toHaveCount(0);
  // The hold is stable, not a frame the render passed through.
  await page.clock.runFor(2_000);
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // Tapping anywhere on the takeover posts `step-done` — the same transition
  // as a remote skip — and tapDone() calls refresh() itself right after the
  // POST resolves, so the next step starts counting with no poll wait at all.
  await page.getByTestId('timer-overlay').click();

  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await expect(dial(page).getByText('After the tap')).toBeVisible();
  await expect(dial(page).getByText('Done!')).toHaveCount(0);
  await expect(dial(page).getByText(/^\d+:\d\d$/).first()).toBeVisible();
});

test('a session targeting other displays never takes over this one', async ({ page, request }) => {
  await putConfig(request, timerConfig(['main', 'kitchen']));

  // Targeted at 'main' only. `start` also replaces any session a previous test
  // left lingering, so the absence assertion below is about targeting alone.
  await startQuick(request, 240, ['main']);
  await page.clock.install();
  await page.goto('/display/kitchen');
  await expect(page.getByText(ROTATION_TEXT, { exact: true })).toBeVisible();

  // Ride out more than one full 3s poll (useDisplayCommands-style stable
  // effect deps, so an exact runFor is reliable — see commands-runtime.spec.ts):
  // the kitchen tab has definitely seen the running session and declined to
  // render it (TimerOverlay's `matches` check against session.targets),
  // rather than simply not having polled yet.
  await page.clock.runFor(4_500);
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);

  // Same display, now named in targets → it takes over on the next poll.
  await startQuick(request, 240, ['kitchen']);
  await page.clock.runFor(3_000);
  await expect(page.getByTestId('timer-overlay')).toBeVisible();
  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'ring');

  // And 'all' covers every display without naming it.
  await startQuick(request, 240, 'all');
  await page.clock.runFor(3_000);
  await expect(page.getByTestId('timer-overlay')).toBeVisible();
});

test('pausing from the hub freezes the countdown on the display; resuming restarts it', async ({ page, request }) => {
  // NOT converted to page.clock: resume shifts the step anchor by the pause
  // duration as the SERVER's real clock measured it (pause/resume are plain
  // HTTP POSTs, timestamped server-side). Faking only the client's clock would
  // let it race ahead of that real duration while "paused", and the gap gets
  // cashed in the instant resume un-pins effectiveNow — an apparent multi-
  // second jump that has nothing to do with the behavior under test. This one
  // genuinely needs the client and server on the same (real) clock.
  await putConfig(request, timerConfig());
  await startQuick(request, 240);
  await page.goto('/display');

  await expect(dial(page).getByText(/^\d+:\d\d$/).first()).toBeVisible();

  // Unlike elapsing time, a pause is a server EVENT — it reaches the display
  // on the next 3s session poll.
  await control(request, 'pause');
  await expect(dial(page).getByText('Paused')).toBeVisible({ timeout: 10_000 });

  // Frozen: materializeSession pins `effectiveNow` to pausedAt, so the same
  // second is still rendered after several local ticks.
  const frozen = await readCountdownSec(page);
  await page.waitForTimeout(3000);
  expect(await readCountdownSec(page)).toBe(frozen);

  // Resuming shifts the step anchor by the pause length — no time was lost, and
  // the countdown picks up from where it stopped rather than jumping.
  await control(request, 'resume');
  await expect(dial(page).getByText('Paused')).toHaveCount(0, { timeout: 10_000 });
  const resumed = await readCountdownSec(page);
  expect(resumed).toBeLessThanOrEqual(frozen);
  // The countdown restarts at the resume POST, but the display only notices on
  // its next SESSION_POLL_MS (3s) poll — so up to a full poll cycle ticks away
  // before the pill clears, plus a second of display rounding.
  expect(frozen - resumed).toBeLessThanOrEqual(4);

  await page.waitForTimeout(2500);
  expect(await readCountdownSec(page)).toBeLessThan(resumed);
});
