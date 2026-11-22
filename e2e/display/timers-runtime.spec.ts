import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, startQuickTimer } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { DEFAULT_MODULE_STYLE, type ModuleInstance, type ScreenConfiguration } from '@/types/config';

/**
 * Kiosk-side timer BEHAVIOR. The sibling `timers.spec.ts` is geometry only
 * (each view's mockup-fit sizing across display shapes); here we drive the
 * session lifecycle through its real routes and assert what the display does.
 *
 * The mechanics that shape every timeout below (src/components/display/
 * TimerOverlay.tsx): the overlay fetches `GET /api/timers/session` when the
 * display's 3s heartbeat names a new session revision, which only session
 * *events* change (start, pause, skip, cancel), and derives the countdown
 * locally from the session's epoch timestamps on a TICK_MS (250ms) tick. So
 * anything server-initiated (a pause posted by /remote) rides at least one 3s
 * beat, while anything time-derived (a step elapsing, a hold surfacing, the
 * session expiring) lands on the local tick with no request involved. Session
 * reads are cached for 1s, but mutations invalidate the cache, so controls
 * surface on the next beat either way.
 *
 * Every session here uses seconds-scale durations (MIN_STEP_SEC is 5) and the
 * `ring` view, whose dial holds the countdown and the "Done!" tap pill, so one
 * locator scope (`timer-dial`) covers the current step without colliding with
 * the routine chips rendered along the bottom. "Paused" is said by the wall's
 * button bar (`timer-controls`), which a tap or a pause brings up.
 *
 * Isolation: there is exactly ONE session globally, and `start` replaces
 * whatever was running. A finished session stays TIMES_UP_HOLD_MS (10 min) as
 * "Time's up!"; `cancel` ends it as well as a running one, which is what every
 * afterEach relies on. Tests that assert the ABSENCE of a takeover still start
 * their own session first rather than relying on the previous test's cleanup.
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

const startQuick = (request: APIRequestContext, durationSec: number, targets: 'all' | string[] = 'all') =>
  startQuickTimer(request, { durationSec, view: 'ring', targets });

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
  const { revision } = await (await request.get('/api/timers/routines')).json();
  const put = await request.put('/api/timers/routines', { data: { ...HOLD_ROUTINE, revision } });
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
const bar = (page: Page) => page.getByTestId('timer-controls');
const pausedWord = (page: Page) => bar(page).getByText('Paused', { exact: true });

/** The session as the hub has it now. */
async function hubSession(request: APIRequestContext): Promise<{ status: string; pausedAt?: number } | null> {
  return (await (await request.get('/api/timers/session')).json()).session;
}

/** The dial's live countdown, in whole seconds. */
async function readCountdownSec(page: Page): Promise<number> {
  const text = await dial(page).getByText(/^\d+:\d\d$/).first().innerText();
  const [m, s] = text.split(':').map(Number);
  return m * 60 + s;
}

// A running or finished session in the worker's shared data/ would take over
// the display for every later spec in this worker: always clear it. `cancel`
// ends a finished one too; an already-cancelled one answers 404, ignored.
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

test('an elapsed timer flips to the celebration, stays until its hold runs out, then hands the screen back to rotation', async ({ page, request }) => {
  // Completion and the TIMES_UP_HOLD_MS (10 min) hold are both derived
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

  // Well past the old 15 s it is still up: a parent who stepped out comes
  // back to it.
  await page.clock.runFor(60_000);
  await expect(page.getByText("Time's up!")).toBeVisible();

  // Past the hold: materializeSession returns null and the whole overlay
  // unmounts. Rotation kept running underneath the takeover the entire time,
  // so the display is left exactly where rotation would have put it: assert
  // on the overlay being GONE (the underlying module was in the DOM all
  // along, merely covered).
  await page.clock.runFor(10 * 60_000);
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
  // Real clock (see below), so the happy path alone spends ~20s waiting on 3s
  // session polls plus a 3s freeze check, too close to the default 30s.
  test.setTimeout(60_000);
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
  // A pause from anywhere brings the wall's buttons up, and the bar says so.
  await expect(pausedWord(page)).toBeVisible({ timeout: 10_000 });

  // Frozen: materializeSession pins `effectiveNow` to pausedAt, so the same
  // second is still rendered after several local ticks.
  const frozen = await readCountdownSec(page);
  await page.waitForTimeout(3000);
  expect(await readCountdownSec(page)).toBe(frozen);

  // Resuming shifts the step anchor by the pause length — no time was lost, and
  // the countdown picks up from where it stopped rather than jumping.
  await control(request, 'resume');
  await expect(pausedWord(page)).toHaveCount(0, { timeout: 10_000 });
  const resumed = await readCountdownSec(page);
  expect(resumed).toBeLessThanOrEqual(frozen);
  // The countdown restarts at the resume POST, but the display only notices on
  // its next SESSION_POLL_MS (3s) poll — so up to a full poll cycle ticks away
  // before the pill clears, plus a second of display rounding.
  expect(frozen - resumed).toBeLessThanOrEqual(4);

  await page.waitForTimeout(2500);
  expect(await readCountdownSec(page)).toBeLessThan(resumed);
});

test('a tap brings up the wall\'s buttons; Pause, +1 min and a held Stop act on the timer', async ({ page, request }) => {
  await putConfig(request, timerConfig());
  await startQuick(request, 240);
  await page.clock.install();
  await page.goto('/display');
  await expect(dial(page).getByText(/^\d+:\d\d$/).first()).toBeVisible();

  // A new timer shows its buttons for the first 8 s, so everyone learns they
  // are there; then a tap anywhere brings them back for another 8 s.
  await expect(bar(page)).toBeVisible();
  await page.clock.runFor(8_500);
  await expect(bar(page)).toHaveCount(0);
  await page.getByTestId('timer-overlay').click({ position: { x: 40, y: 40 } });
  await expect(bar(page)).toBeVisible();
  await page.clock.runFor(8_500);
  await expect(bar(page)).toHaveCount(0);

  await page.getByTestId('timer-overlay').click({ position: { x: 40, y: 40 } });
  await page.getByTestId('timer-pause').click();
  await expect(pausedWord(page)).toBeVisible();
  expect((await hubSession(request))?.pausedAt).toBeDefined();
  // Paused, the bar stays up however long nobody touches it.
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('timer-resume')).toBeVisible();

  await page.getByTestId('timer-resume').click();
  await expect(page.getByTestId('timer-pause')).toBeVisible();
  expect((await hubSession(request))?.pausedAt).toBeUndefined();

  const before = await readCountdownSec(page);
  await page.getByTestId('timer-add-minute').click();
  await expect.poll(() => readCountdownSec(page)).toBeGreaterThan(before + 50);

  // A short tap on Stop only says to keep holding.
  const stop = page.getByRole('button', { name: 'Stop (hold to confirm)' });
  await stop.click();
  await expect(page.getByRole('status').filter({ hasText: 'Keep holding to stop' })).toBeVisible();
  expect((await hubSession(request))?.status).toBe('running');

  // A full second's hold stops it everywhere and hands the wall back.
  await stop.hover();
  await page.mouse.down();
  await page.clock.runFor(1_200);
  await page.mouse.up();
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);
  await expect(page.getByText(ROTATION_TEXT, { exact: true })).toBeVisible();
});

test('a tap closes "Time\'s up!" on this display, and Stop from the hub ends it everywhere', async ({ page, request }) => {
  // Real clock: the reload below reads the hub's own view of the session,
  // which a faked page clock would contradict.
  test.setTimeout(45_000);
  await putConfig(request, timerConfig());
  await startQuick(request, 5);
  await page.goto('/display');
  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'celebration', { timeout: 15_000 });
  await expect(page.getByText('Tap to close')).toBeVisible();

  await page.getByTestId('timer-overlay').click();
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);
  await expect(page.getByText(ROTATION_TEXT, { exact: true })).toBeVisible();

  // Closing it was this display's own: a reload shows it again, until a Stop
  // ends it for every display.
  await page.reload();
  await expect(page.getByText("Time's up!")).toBeVisible();
  await control(request, 'cancel');
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0, { timeout: 10_000 });
});

test('the dock\'s Timers button starts a routine or a quick timer on this display', async ({ page, request }) => {
  const dock = {
    id: 'dock', type: 'display-control', position: { x: 60, y: 1600 }, size: { w: 960, h: 200 }, zIndex: 2,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { layout: 'dock', showTimers: true, defaultTarget: 'self', allowRetargeting: false, compact: false },
  } as ModuleInstance;
  await putConfig(request, baseConfig({ screens: [makeScreen('s', 'S', [textModule(ROTATION_TEXT), dock])] }));
  const { revision } = await (await request.get('/api/timers/routines')).json();
  expect((await request.put('/api/timers/routines', { data: { ...HOLD_ROUTINE, revision } })).ok()).toBe(true);
  // Nothing left running from an earlier test, which would ask before replacing.
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
  await page.goto('/display');

  await page.getByRole('button', { name: 'Timers' }).click();
  const sheet = page.getByTestId('timers-sheet');
  await expect(sheet.getByText('Tap routine')).toBeVisible();
  await expect(sheet.getByText('2 steps · 10 min')).toBeVisible();

  await sheet.getByText('5 min', { exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'face');
  const quick = await hubSession(request);
  expect(quick?.status).toBe('running');

  // Hold Stop, then start the routine the same way.
  await page.getByTestId('timer-overlay').click({ position: { x: 40, y: 40 } });
  const stop = page.getByRole('button', { name: 'Stop (hold to confirm)' });
  await stop.hover();
  await page.mouse.down();
  await page.waitForTimeout(1_300);
  await page.mouse.up();
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);

  await page.getByRole('button', { name: 'Timers' }).click();
  await page.getByTestId('timers-sheet').getByText('Tap routine').click();
  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'ring');
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
});

test('the panel\'s Timers button opens the sheet in an editor preview, which starts nothing', async ({ page, request }) => {
  const panel = {
    id: 'panel', type: 'display-control', position: { x: 60, y: 1400 }, size: { w: 960, h: 420 }, zIndex: 2,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { layout: 'panel', showTimers: true, defaultTarget: 'self', allowRetargeting: false, compact: false },
  } as ModuleInstance;
  await putConfig(request, baseConfig({ screens: [makeScreen('s', 'S', [textModule(ROTATION_TEXT), panel])] }));
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
  await page.goto('/display?preview=1');

  await page.getByRole('button', { name: 'Timers' }).click();
  const sheet = page.getByTestId('timers-sheet');
  await expect(sheet.getByTestId('timers-sheet-preview-note')).toBeVisible();
  await sheet.getByText('5 min', { exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(await hubSession(request)).toBeNull();
});
