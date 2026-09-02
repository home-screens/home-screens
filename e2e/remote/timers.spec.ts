import { test, expect } from '../fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { postHeartbeat, putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';
import type { MaterializedTimerSession, Routine } from '@/types/timers';

/**
 * /remote Timers tab — the invocation + authoring surface for display timers.
 *
 * Session/step math is covered at the lib level (timer-logic) and the takeover
 * rendering in e2e/display/timers.spec.ts; these specs drive the real TimersTab
 * and RoutineFormOverlay UI and assert the write reaches the stores the display
 * polls (`data/routines.json`, `data/timer-session.json`).
 *
 * Durations are deliberately long (10 min) wherever a timer must still be
 * running at assertion time, and control assertions are made on timestamps
 * rather than elapsed wall-clock, so nothing here waits on real minutes.
 */

const QUICK_LONG_SEC = 600;

/** Two long steps — long enough that neither elapses mid-test. */
const BEDTIME: Routine = {
  id: 'r-bedtime',
  name: 'Bedtime routine',
  icon: '🌙',
  view: 'ring',
  sound: false,
  steps: [
    { id: 's1', label: 'Pajamas on', icon: '👕', durationSec: 600 },
    { id: 's2', label: 'Brush teeth', icon: '🪥', durationSec: 600 },
  ],
};

async function getSession(request: APIRequestContext): Promise<MaterializedTimerSession | null> {
  const res = await request.get('/api/timers/session');
  expect(res.ok()).toBe(true);
  return (await res.json()).session;
}

async function getRoutines(request: APIRequestContext): Promise<Routine[]> {
  const res = await request.get('/api/timers/routines');
  expect(res.ok()).toBe(true);
  return (await res.json()).routines;
}

async function seedRoutines(request: APIRequestContext, routines: Routine[]): Promise<void> {
  const res = await request.put('/api/timers/routines', { data: { routines } });
  expect(res.ok()).toBe(true);
}

/** Start a session server-side so control specs don't depend on the start UI. */
async function startQuick(request: APIRequestContext, durationSec = QUICK_LONG_SEC): Promise<void> {
  const res = await request.post('/api/timers/session', {
    data: { action: 'start', kind: 'quick', durationSec, targets: 'all', view: 'face', sound: false },
  });
  expect(res.ok()).toBe(true);
}

async function startRoutine(request: APIRequestContext, routineId: string): Promise<void> {
  const res = await request.post('/api/timers/session', {
    data: { action: 'start', kind: 'routine', routineId, targets: 'all', sound: false },
  });
  expect(res.ok()).toBe(true);
}

async function openTimers(page: Page): Promise<void> {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Timers' }).click();
  await expect(page.getByRole('heading', { name: 'Timers' })).toBeVisible();
}

/** The saved-routine row, reached from its name (name div → text column → card). */
function routineCard(page: Page, name: string): Locator {
  return page.getByText(name, { exact: true }).locator('../..');
}

/** A step card inside the routine form (label input → its flex row → the card). */
function stepCard(page: Page, index: number): Locator {
  return page.getByPlaceholder('What to do').nth(index).locator('../..');
}

/** The control card's remaining-time readout, in seconds. */
async function remainingSeconds(page: Page): Promise<number> {
  const text = await page.getByText(/^\d+:\d\d$/).first().innerText();
  const [min, sec] = text.split(':').map(Number);
  return min * 60 + sec;
}

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
  // One session runs globally and both stores persist for the worker's whole
  // run, so each spec starts from "nothing running, no routines saved".
  // `cancel` 404s when idle — not an error worth asserting on.
  await request.post('/api/timers/session', { data: { action: 'cancel' } });
  await seedRoutines(request, []);
});

// A session left running would take over every display for later specs in this
// worker, and would put the replace-confirm sheet in front of their taps.
test.afterEach(async ({ request }) => {
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
});

// ── Quick timers ──────────────────────────────────────────────────────

test('a preset quick timer starts a session and shows the control card', async ({ page, request }) => {
  await openTimers(page);

  // exact: the "+1 min" control and the 10/15 min presets all contain "1 min".
  await page.getByRole('button', { name: '5 min', exact: true }).click();

  await expect(page.getByText('5 minute timer')).toBeVisible();
  await expect
    .poll(async () => {
      const s = await getSession(request);
      return s && [s.kind, s.status, s.steps[0].durationSec];
    })
    .toEqual(['quick', 'running', 300]);
});

test('the running card confirms once the display reports the timer on screen', async ({ page, request }) => {
  await startQuick(request);
  const session = await getSession(request);
  await openTimers(page);

  const ack = page.getByTestId('timer-ack');
  await expect(ack).toHaveText('Waiting for a display to pick it up…');

  // The (single, legacy) display heartbeats with the session it is showing.
  await postHeartbeat(request, { timerSessionId: session!.id });
  await expect(ack).toHaveText('Showing on the display', { timeout: 10000 });
});

test('a custom minutes-and-seconds quick timer starts', async ({ page, request }) => {
  await openTimers(page);

  // No routines are saved, so the quick section owns the only min/sec inputs
  // and the only "Start" button on screen.
  await page.getByLabel('Minutes').fill('1');
  await page.getByLabel('Seconds').fill('30');
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // Non-whole-minute quick timers are titled in clock notation.
  await expect(page.getByText('1:30 timer')).toBeVisible();
  await expect
    .poll(async () => (await getSession(request))?.steps[0].durationSec)
    .toBe(90);
});

test('starting a second timer asks before replacing the running one', async ({ page, request }) => {
  await startQuick(request);
  await openTimers(page);
  await expect(page.getByText('10 minute timer')).toBeVisible();

  await page.getByRole('button', { name: '1 min', exact: true }).click();
  await expect(page.getByText('A timer is already running. Starting a new one will stop it.')).toBeVisible();

  // The sheet's confirm is also labelled "Start"; it renders after the quick
  // section's own Start button.
  await page.getByRole('button', { name: 'Start', exact: true }).last().click();

  await expect
    .poll(async () => (await getSession(request))?.steps[0].durationSec)
    .toBe(60);
});

// ── Routine authoring ─────────────────────────────────────────────────

test('a routine created through the form persists and survives a reload', async ({ page, request }) => {
  await openTimers(page);
  await page.getByRole('button', { name: 'New routine' }).click();

  await page.getByPlaceholder('Morning routine').fill('After school');

  // The form opens with one blank step; fill it, then add a second one.
  await page.getByPlaceholder('What to do').nth(0).fill('Snack');
  await stepCard(page, 0).getByLabel('Minutes').fill('0');
  await stepCard(page, 0).getByLabel('Seconds').fill('30');

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByPlaceholder('What to do').nth(1).fill('Homework');
  await stepCard(page, 1).getByLabel('Minutes').fill('1');
  await stepCard(page, 1).getByLabel('Seconds').fill('0');
  // A hold step waits for a Done tap on the display instead of auto-advancing.
  await stepCard(page, 1).getByRole('button', { name: 'Wait for a Done tap' }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect
    .poll(async () => (await getRoutines(request)).map((r) => ({
      name: r.name,
      steps: r.steps.map((s) => [s.label, s.durationSec, s.waitForTap === true]),
    })))
    .toEqual([{
      name: 'After school',
      steps: [['Snack', 30, false], ['Homework', 60, true]],
    }]);

  // Routines are family data on disk, not editor config — a fresh load shows it.
  await openTimers(page);
  await expect(page.getByText('After school')).toBeVisible();
  // 90s total rounds to the 2 min shown in the row's summary line.
  await expect(page.getByText('2 steps · 2 min')).toBeVisible();
});

test('a routine can be edited from the list', async ({ page, request }) => {
  await seedRoutines(request, [BEDTIME]);
  await openTimers(page);

  await page.getByRole('button', { name: 'Edit routine' }).click();
  const name = page.getByPlaceholder('Morning routine');
  await expect(name).toHaveValue('Bedtime routine');
  await name.fill('Wind down');
  // Step lengths round-trip through the two-field min/sec editor: 10 min → 2.
  await stepCard(page, 0).getByLabel('Minutes').fill('2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect
    .poll(async () => {
      const [routine] = await getRoutines(request);
      return routine && [routine.id, routine.name, routine.steps[0].durationSec];
    })
    .toEqual([BEDTIME.id, 'Wind down', 120]);
});

test('a routine can be deleted from the list', async ({ page, request }) => {
  await seedRoutines(request, [BEDTIME]);
  await openTimers(page);

  await page.getByRole('button', { name: 'Edit routine' }).click();
  // Delete is a two-tap arm on one button: the label flips to "Really delete?".
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Really delete?' }).click();

  await expect.poll(async () => (await getRoutines(request)).length).toBe(0);
  await expect(page.getByText('Bedtime routine')).toHaveCount(0);
});

// ── Running a routine + control card ──────────────────────────────────

test('starting a saved routine shows the live control card', async ({ page, request }) => {
  await seedRoutines(request, [BEDTIME]);
  await openTimers(page);

  await routineCard(page, 'Bedtime routine').getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText('Pajamas on')).toBeVisible();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expect
    .poll(async () => {
      const s = await getSession(request);
      return s && [s.kind, s.name, s.stepIndex, s.status];
    })
    .toEqual(['routine', 'Bedtime routine', 0, 'running']);
});

test('the control card pauses and resumes a running timer', async ({ page, request }) => {
  await startQuick(request);
  await openTimers(page);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect.poll(async () => (await getSession(request))?.pausedAt !== undefined).toBe(true);

  // The countdown is frozen at the pause instant, not merely styled as paused.
  const frozen = await remainingSeconds(page);
  await page.waitForTimeout(1_500);
  expect(await remainingSeconds(page)).toBe(frozen);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(async () => (await getSession(request))?.pausedAt === undefined).toBe(true);
});

test('+1 min gives the running step another minute', async ({ page, request }) => {
  await startQuick(request);
  await openTimers(page);
  await expect(page.getByRole('button', { name: '+1 min' })).toBeVisible();

  const before = await remainingSeconds(page);
  const startedAtBefore = (await getSession(request))!.stepStartedAt;

  await page.getByRole('button', { name: '+1 min' }).click();

  // Exactly one minute of anchor shift, and the readout grows to match — an
  // assertion on the timestamp, so no wall-clock waiting is involved.
  await expect
    .poll(async () => (await getSession(request))!.stepStartedAt - startedAtBefore)
    .toBe(60_000);
  await expect.poll(async () => remainingSeconds(page)).toBeGreaterThan(before);
});

test('skip advances a routine to the next step', async ({ page, request }) => {
  await seedRoutines(request, [BEDTIME]);
  await startRoutine(request, BEDTIME.id);
  await openTimers(page);
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await expect(page.getByText('Brush teeth')).toBeVisible();
  await expect.poll(async () => (await getSession(request))?.stepIndex).toBe(1);
});

test('stop ends the session and removes the control card', async ({ page, request }) => {
  await startQuick(request);
  await openTimers(page);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  await expect(page.getByText('10 minute timer')).toHaveCount(0);
  // A cancelled session stays readable for the display's linger window, so the
  // check is "no longer running" rather than "gone".
  await expect
    .poll(async () => (await getSession(request))?.status ?? 'cleared')
    .not.toBe('running');
});
