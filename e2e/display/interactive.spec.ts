import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { seedChores, seedMeals } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import type { ModuleInstance } from '@/types/config';

/** Local YYYY-MM-DD for today, matching how the meal planner keys plan entries. */
function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('interactive todo: tapping an item toggles and persists it', async ({ page, request }) => {
  const todo = buildModuleInstance('todo', {
    title: 'Tasks',
    interactive: true,
    items: [{ id: 'i1', text: 'TAP ME', completed: false }],
  });
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [todo])],
  }));

  const item = display.module('todo').getByText('TAP ME');
  const toggled = page.waitForResponse(
    (r) => r.url().includes('/api/todo/toggle') && r.request().method() === 'POST' && r.ok(),
  );
  await item.click();
  await toggled;

  // Persisted in data/todo-state.json (created on first toggle).
  await expect
    .poll(async () => {
      const res = await request.get('/api/todo/state');
      return (await res.json()).completed as Record<string, boolean>;
    })
    .toMatchObject({ i1: true });

  // Optimistic + server-confirmed: the row reports itself pressed.
  await expect(display.module('todo').getByRole('button', { name: /TAP ME/ })).toHaveAttribute('aria-pressed', 'true');
});

test('display-control: tapping Next enqueues a next-screen command', async ({ page, request }) => {
  const control = buildModuleInstance('display-control');
  await renderOnDisplay(page, request, baseConfig({
    screens: [
      makeScreen('a', 'A', [control]),
      makeScreen('b', 'B', [textModule('SCREEN B')]),
    ],
    settings: { rotationIntervalMs: 3_600_000 },
  }));

  // Drain any leftover queue from a prior test in this worker.
  await request.get('/api/display/commands');
  await page.getByRole('button', { name: 'Next screen' }).click();

  // Legacy target 'self' → no ?display= → the __default__ queue the kiosk polls.
  await expect
    .poll(async () => {
      const res = await request.get('/api/display/commands');
      return ((await res.json()).commands as Array<{ type: string }>).map((c) => c.type);
    }, { timeout: 6000 })
    .toContain('next-screen');
});

/**
 * Shared-state conditional visibility gate. The display filters modules through
 * `evaluateVisibility` (ScreenRenderer), and with no producer publishing the
 * referenced key the `whenUnknown` fallback governs: 'hide' removes the module,
 * 'show' keeps it. (The full producer → consumer flip, where a published value
 * changes the outcome at runtime, is exercised with a fixture plugin in the
 * plugin spec.)
 */
function conditioned(id: string, content: string, whenUnknown: 'hide' | 'show'): ModuleInstance {
  return textModule(content, {
    id,
    visibility: { conditions: [{ kind: 'state', sourceKey: 'demo.flag', equals: 'on' }], whenUnknown },
  });
}

test('a module whose visibility key is unknown is hidden when whenUnknown=hide', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      conditioned('gated', 'CONDITIONED CONTENT', 'hide'),
      textModule('ALWAYS VISIBLE', { id: 'always' }),
    ])],
  }));

  await expect(page.getByText('ALWAYS VISIBLE')).toBeVisible();
  await expect(page.locator('[data-module-id="gated"]')).toHaveCount(0);
});

test('the same module renders when whenUnknown=show', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [conditioned('gated', 'CONDITIONED CONTENT', 'show')])],
  }));

  await expect(page.getByText('CONDITIONED CONTENT')).toBeVisible();
});

/**
 * Chore-chart tap-to-complete on the kiosk display. Mirrors the /chores kid
 * test (e2e/chores/chores.spec.ts): the board-view chore card is a real button
 * that POSTs to /api/chores only when `allowDisplayComplete` is on. Each test
 * seeds its own member/chore ids so the shared completions store (persisted
 * per-worker across tests) can't leak a stale completion into the next.
 */
test.describe('chore-chart on display', () => {
  test('allowDisplayComplete true: tapping a chore persists via /api/chores', async ({ page, request }) => {
    await seedChores(request, {
      members: [{ id: 'cm-a', name: 'Riley', emoji: '🦊', color: '#f59e0b' }],
      chores: [{
        id: 'cc-a', name: 'Water the plants', emoji: '🪴', points: 1,
        frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
        assigneeIds: ['cm-a'], rotation: 'fixed',
      }],
    });
    const chart = buildModuleInstance('chore-chart', { view: 'board', allowDisplayComplete: true });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [chart])],
    }));

    const btn = display.module('chore-chart').getByRole('button', { name: /Water the plants/ });
    await expect(btn).toBeEnabled();

    const posted = page.waitForResponse(
      (r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok(),
    );
    await btn.click();
    await posted;

    // Completion persists in the shared chore store, exactly like the kid view.
    await expect
      .poll(async () => {
        const res = await request.get('/api/chores');
        return (await res.json()).completions as Array<{ choreId: string; memberId: string }>;
      })
      .toContainEqual(expect.objectContaining({ choreId: 'cc-a', memberId: 'cm-a' }));
  });

  test('allowDisplayComplete false: tapping a chore is inert', async ({ page, request }) => {
    await seedChores(request, {
      members: [{ id: 'cm-b', name: 'Sky', emoji: '🐢', color: '#10b981' }],
      chores: [{
        id: 'cc-b', name: 'Take out the trash', emoji: '🗑️', points: 1,
        frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
        assigneeIds: ['cm-b'], rotation: 'fixed',
      }],
    });

    // Belt-and-suspenders: flag any toggle POST so an inert tap is provable
    // even if the disabled button were somehow to fire.
    let togglePosted = false;
    await page.route('**/api/chores', async (route) => {
      if (route.request().method() === 'POST') togglePosted = true;
      await route.fallback();
    });

    const chart = buildModuleInstance('chore-chart', { view: 'board', allowDisplayComplete: false });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [chart])],
    }));

    const btn = display.module('chore-chart').getByRole('button', { name: /Take out the trash/ });
    await expect(btn).toBeDisabled();
    // force past the disabled-actionability guard; onClick is undefined so it's a no-op.
    await btn.click({ force: true });

    // No completion for this chore ever lands in the store, and no POST fired.
    await expect
      .poll(async () => {
        const res = await request.get('/api/chores');
        return (await res.json()).completions as Array<{ choreId: string; memberId: string }>;
      })
      .not.toContainEqual(expect.objectContaining({ choreId: 'cc-b', memberId: 'cm-b' }));
    expect(togglePosted).toBe(false);
  });
});

/**
 * Meal-planner `tapRecipeAction`: a saved meal with a recipeUrl becomes a tap
 * target on the display. 'qr' opens a fullscreen QR overlay, 'iframe' embeds the
 * recipe page; both are portaled to <body> as role="dialog". While an overlay is
 * open, `useInteractionHold` pauses screen rotation so the next screen doesn't
 * unmount it out from under the reader.
 */
test.describe('meal-planner recipe tap', () => {
  const RECIPE_URL = 'https://recipes.example.com/carbonara';

  function seedRecipeMeal(request: Parameters<typeof seedMeals>[0]) {
    return seedMeals(request, {
      savedMeals: [{ id: 'meal-1', name: 'Spaghetti Carbonara', emoji: '🍝', prepTime: 25, recipeUrl: RECIPE_URL }],
      plan: [{ slot: 'dinner', mealId: 'meal-1', date: isoToday() }],
    });
  }

  test("'qr' renders a QR overlay and dismisses", async ({ page, request }) => {
    // Block external so the QR overlay proves it makes zero upstream calls.
    await stubModuleData(page);
    await seedRecipeMeal(request);
    const meal = buildModuleInstance('meal-planner', { view: 'today', tapRecipeAction: 'qr' });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [meal])],
    }));

    await display.module('meal-planner').getByText('Spaghetti Carbonara').click();

    const dialog = page.getByRole('dialog', { name: 'Spaghetti Carbonara' });
    await expect(dialog).toBeVisible();
    // QR is rendered as an inline SVG (qrcode.react).
    await expect(dialog.locator('svg')).toBeVisible();

    // The QR variant dismisses on tapping anywhere in the overlay.
    await dialog.click();
    await expect(dialog).toBeHidden();
  });

  test("'iframe' renders a recipe iframe overlay and dismisses", async ({ page, request }) => {
    // Block external so the iframe's real src never actually loads upstream.
    await stubModuleData(page);
    await seedRecipeMeal(request);
    const meal = buildModuleInstance('meal-planner', { view: 'today', tapRecipeAction: 'iframe' });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [meal])],
    }));

    await display.module('meal-planner').getByText('Spaghetti Carbonara').click();

    const dialog = page.getByRole('dialog', { name: 'Spaghetti Carbonara' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('iframe')).toHaveAttribute('src', RECIPE_URL);

    // Close via the overlay's ✕ button (aria-label "Close").
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('rotation holds while a recipe overlay is open, then resumes', async ({ page, request }) => {
    await stubModuleData(page);
    await seedRecipeMeal(request);
    const meal = buildModuleInstance('meal-planner', { view: 'today', tapRecipeAction: 'qr' });
    // Short rotation so we can prove the overlay pins screen 1; two screens so
    // there is somewhere to advance to.
    await renderOnDisplay(page, request, baseConfig({
      screens: [
        makeScreen('s1', 'S1', [meal]),
        makeScreen('s2', 'S2', [textModule('SECOND SCREEN AFTER HOLD')]),
      ],
      settings: { rotationIntervalMs: 1500 },
    }));

    await page.getByText('Spaghetti Carbonara').click();
    const dialog = page.getByRole('dialog', { name: 'Spaghetti Carbonara' });
    await expect(dialog).toBeVisible();

    // Wall-time bracket: for well over 3 rotation intervals, screen 2 must never
    // mount. The poll returns 'advanced' the instant it does (failing the
    // assertion); otherwise it reports 'elapsed' once the hold window passes.
    const HOLD_MS = 6000;
    const started = Date.now();
    await expect
      .poll(async () => {
        if (await page.getByText('SECOND SCREEN AFTER HOLD').isVisible()) return 'advanced';
        return Date.now() - started > HOLD_MS ? 'elapsed' : 'holding';
      }, { timeout: HOLD_MS + 5000, intervals: [250] })
      .toBe('elapsed');
    await expect(dialog).toBeVisible();

    // Dismiss → hold releases → rotation resumes and screen 2 arrives.
    await dialog.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('SECOND SCREEN AFTER HOLD')).toBeVisible({ timeout: 8000 });
  });
});

/**
 * Todoist `allowComplete`: with the flag on, each task row shows a tap-to-close
 * circle that POSTs to /api/todoist/close and optimistically removes the row.
 * The close endpoint is stubbed at the browser boundary so no real Todoist call
 * is ever made.
 */
test.describe('todoist tap-to-complete', () => {
  test('allowComplete: tapping a task closes it via /api/todoist/close', async ({ page, request }) => {
    // Serve the todoist fixture ('Buy oat milk', task id 1001) and block external.
    await stubModuleData(page);

    // Intercept the close POST (registered AFTER stubModuleData so it wins for
    // this URL — Playwright matches most-recently-added handlers first).
    let closeCount = 0;
    let closedTaskId: string | undefined;
    await page.route('**/api/todoist/close', async (route) => {
      closeCount += 1;
      closedTaskId = (route.request().postDataJSON() as { taskId?: string })?.taskId;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    const todoist = buildModuleInstance('todoist', { allowComplete: true });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [todoist])],
    }));

    await expect(display.module('todoist').getByText('Buy oat milk')).toBeVisible();
    await display.module('todoist').getByRole('button').first().click();

    // The POST fires with the fixture task id, and the row optimistically leaves.
    await expect(display.module('todoist').getByText('Buy oat milk')).toBeHidden();
    expect(closeCount).toBe(1);
    expect(closedTaskId).toBe('1001');
  });
});

/**
 * Interactive todo persistence beyond the happy-path toggle above: un-toggling a
 * completed item writes `false`, and two items in the same module toggle
 * independently. State lives in data/todo-state.json via /api/todo/toggle.
 */
test.describe('todo toggle', () => {
  test('un-toggling a completed item persists false', async ({ page, request }) => {
    const todo = buildModuleInstance('todo', {
      title: 'Chores',
      interactive: true,
      items: [{ id: 'todo-untoggle-1', text: 'ALREADY DONE', completed: true }],
    });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [todo])],
    }));

    // Authored default is completed → the row reports itself pressed.
    const row = display.module('todo').getByRole('button', { name: /ALREADY DONE/ });
    await expect(row).toHaveAttribute('aria-pressed', 'true');

    const toggled = page.waitForResponse(
      (r) => r.url().includes('/api/todo/toggle') && r.request().method() === 'POST' && r.ok(),
    );
    await row.click();
    await toggled;

    // Persisted as false, not merely absent.
    await expect
      .poll(async () => {
        const res = await request.get('/api/todo/state');
        return (await res.json()).completed as Record<string, boolean>;
      })
      .toMatchObject({ 'todo-untoggle-1': false });
    await expect(row).toHaveAttribute('aria-pressed', 'false');
  });

  test('two items toggle independently', async ({ page, request }) => {
    const todo = buildModuleInstance('todo', {
      title: 'Chores',
      interactive: true,
      items: [
        { id: 'todo-indep-a', text: 'FIRST ITEM', completed: false },
        { id: 'todo-indep-b', text: 'SECOND ITEM', completed: false },
      ],
    });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [todo])],
    }));

    const first = display.module('todo').getByRole('button', { name: /FIRST ITEM/ });
    const second = display.module('todo').getByRole('button', { name: /SECOND ITEM/ });
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(second).toHaveAttribute('aria-pressed', 'false');

    // Tap only the first item.
    const firstToggled = page.waitForResponse(
      (r) => r.url().includes('/api/todo/toggle') && r.request().method() === 'POST' && r.ok(),
    );
    await first.click();
    await firstToggled;

    await expect(first).toHaveAttribute('aria-pressed', 'true');
    // The second item is untouched, in the DOM and in the store.
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(async () => {
        const res = await request.get('/api/todo/state');
        return (await res.json()).completed as Record<string, boolean>;
      })
      .toMatchObject({ 'todo-indep-a': true });

    // Now tap the second — the first stays completed.
    const secondToggled = page.waitForResponse(
      (r) => r.url().includes('/api/todo/toggle') && r.request().method() === 'POST' && r.ok(),
    );
    await second.click();
    await secondToggled;

    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const res = await request.get('/api/todo/state');
        return (await res.json()).completed as Record<string, boolean>;
      })
      .toMatchObject({ 'todo-indep-a': true, 'todo-indep-b': true });
  });
});

/**
 * display-control command surface. The touch widget (DisplayControlModule) fires
 * hub commands through `dispatchDisplayCommand` (src/lib/display-dispatch.ts) at a
 * resolved target: `self` → the display it renders on, `all` → broadcast, or a
 * specific slug. Every layout (panel/pad/bar) exposes exactly four controls —
 * Prev, Next, a hold-to-confirm Sleep, and a Brightness slider (verified against
 * PanelLayout/PadLayout/BarLayout). There is NO direct screen-jump/goto-screen or
 * pause control anywhere in the component, so those (guessed in the task plan)
 * are intentionally not exercised.
 *
 * Assertions read the hub queue via GET /api/display/commands, which DRAINS it.
 * The display client drains its OWN queue every 3s (useDisplayCommands), so
 * asserting on a self-polled queue would race that drain. To stay deterministic
 * we render the widget on a dedicated "controller" display and target a SIBLING
 * display that no browser ever polls — sibling queues are drained only by the
 * test. Slugs are unique per test because `fullyParallel: false` runs the whole
 * file in one server process with a shared in-memory queue.
 */
test.describe('display-control command surface', () => {
  /** A display whose single screen hosts a display-control widget. */
  function controllerDisplay(id: string, name: string, config: Record<string, unknown>) {
    return {
      id,
      name,
      screens: [makeScreen(`${id}-s`, `${name} screen`, [buildModuleInstance('display-control', config)])],
    };
  }
  /** A plain sibling display — never polled by a browser, so a race-free queue. */
  function siblingDisplay(id: string, name: string) {
    return {
      id,
      name,
      screens: [makeScreen(`${id}-s`, `${name} screen`, [textModule(`${name} CONTENT`)])],
    };
  }

  /** Drain (and clear) a display's queue, returning the full command objects. */
  async function drainCommands(request: APIRequestContext, display?: string) {
    const url = display ? `/api/display/commands?display=${display}` : '/api/display/commands';
    const res = await request.get(url);
    return ((await res.json()).commands ?? []) as Array<{ type: string; payload?: Record<string, unknown> }>;
  }
  async function drainTypes(request: APIRequestContext, display?: string): Promise<string[]> {
    return (await drainCommands(request, display)).map((c) => c.type);
  }

  test('the Previous button enqueues prev-screen at the resolved target', async ({ page, request }) => {
    const controller = controllerDisplay('prevctl', 'Prev Ctl', { defaultTarget: 'prevsib' });
    const sibling = siblingDisplay('prevsib', 'Prev Sib');
    await drainTypes(request, 'prevsib'); // clear any leftover from a prior test
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, sibling] }), '/display/prevctl',
    );

    await display.module('display-control').getByRole('button', { name: 'Previous screen' }).click();

    // Prev/Next are trailing-debounced (200ms), so the command lands just after the tap.
    await expect.poll(() => drainTypes(request, 'prevsib'), { timeout: 6000 }).toContain('prev-screen');
  });

  test('the Sleep button enqueues sleep after a hold-to-confirm', async ({ page, request }) => {
    const controller = controllerDisplay('sleepctl', 'Sleep Ctl', { defaultTarget: 'sleepsib' });
    const sibling = siblingDisplay('sleepsib', 'Sleep Sib');
    await drainTypes(request, 'sleepsib');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, sibling] }), '/display/sleepctl',
    );

    // useHoldConfirm fires onConfirm at durationMs (1000ms default) purely from a
    // held pointer — the completion timer does not need a release. A bubbling
    // pointerdown reaches React's delegated onPointerDown handler.
    const sleepBtn = display.module('display-control').getByRole('button', { name: 'Sleep (hold to confirm)' });
    await sleepBtn.dispatchEvent('pointerdown', { bubbles: true });
    await expect.poll(() => drainTypes(request, 'sleepsib'), { timeout: 6000, intervals: [150] }).toContain('sleep');
    await sleepBtn.dispatchEvent('pointerup', { bubbles: true });
  });

  test('the Brightness slider commits a brightness command carrying its value', async ({ page, request }) => {
    const controller = controllerDisplay('brightctl', 'Bright Ctl', { defaultTarget: 'brightsib' });
    const sibling = siblingDisplay('brightsib', 'Bright Sib');
    await drainTypes(request, 'brightsib');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, sibling] }), '/display/brightctl',
    );

    // Set the range to a distinctive value (React onChange), then release to commit.
    // The commit rides the POST-with-payload branch of dispatchDisplayCommand, so
    // the queued command carries `{ value }`.
    const slider = display.module('display-control').getByRole('slider');
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '70');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await slider.dispatchEvent('pointerup', { bubbles: true });

    let brightnessCmd: { type: string; payload?: Record<string, unknown> } | undefined;
    await expect
      .poll(async () => {
        const found = (await drainCommands(request, 'brightsib')).find((c) => c.type === 'brightness');
        if (found) brightnessCmd = found;
        return brightnessCmd?.type;
      }, { timeout: 6000 })
      .toBe('brightness');
    expect(brightnessCmd?.payload?.value).toBe(70);
  });

  test("defaultTarget 'all' broadcasts the command to every display queue", async ({ page, request }) => {
    const controller = controllerDisplay('bctl', 'B Ctl', { defaultTarget: 'all' });
    const one = siblingDisplay('bone', 'B One');
    const two = siblingDisplay('btwo', 'B Two');
    // Broadcast only fans out to displays the hub has SEEN; draining registers
    // each sibling in `knownDisplays` (and clears any leftovers).
    await drainTypes(request, 'bone');
    await drainTypes(request, 'btwo');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, one, two] }), '/display/bctl',
    );

    await display.module('display-control').getByRole('button', { name: 'Next screen' }).click();

    await expect.poll(() => drainTypes(request, 'bone'), { timeout: 6000 }).toContain('next-screen');
    await expect.poll(() => drainTypes(request, 'btwo'), { timeout: 6000 }).toContain('next-screen');
  });

  test('a specific slug target scopes the command to only that display queue', async ({ page, request }) => {
    const controller = controllerDisplay('sctl', 'S Ctl', { defaultTarget: 'starget' });
    const target = siblingDisplay('starget', 'S Target');
    const other = siblingDisplay('sother', 'S Other');
    await drainTypes(request, 'starget');
    await drainTypes(request, 'sother');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, target, other] }), '/display/sctl',
    );

    await display.module('display-control').getByRole('button', { name: 'Next screen' }).click();

    await expect.poll(() => drainTypes(request, 'starget'), { timeout: 6000 }).toContain('next-screen');
    // The unrelated display never received it (specific slug, not a broadcast).
    expect(await drainTypes(request, 'sother')).not.toContain('next-screen');
  });

  test('retargeting via the picker sends the next command to the newly selected display', async ({ page, request }) => {
    const controller = controllerDisplay('rctl', 'R Ctl', { defaultTarget: 'self', allowRetargeting: true });
    const alpha = siblingDisplay('ralpha', 'R Alpha');
    const beta = siblingDisplay('rbeta', 'R Beta');
    await drainTypes(request, 'ralpha');
    await drainTypes(request, 'rbeta');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, alpha, beta] }), '/display/rctl',
    );

    // The picker (chips) is present in multi-display mode; chips are labeled by
    // display name. Retarget from the render display (R Ctl) to R Beta, then tap Next.
    const mod = display.module('display-control');
    await mod.getByRole('button', { name: 'R Beta', exact: true }).click();
    await mod.getByRole('button', { name: 'Next screen' }).click();

    await expect.poll(() => drainTypes(request, 'rbeta'), { timeout: 6000 }).toContain('next-screen');
    // The previously-unselected display got nothing.
    expect(await drainTypes(request, 'ralpha')).not.toContain('next-screen');
  });

  test('a configured target missing from the registry never dispatches to the phantom slug', async ({ page, request }) => {
    // 'fghost' is a valid slug but absent from the registry → resolveInitialTarget
    // falls back to the render display (fctl). The exact fallback value is covered
    // by resolveInitialTarget.test.ts; here we assert the observable safety
    // property: the command does NOT leak to the phantom slug and does NOT
    // broadcast to the sibling. (fctl itself is self-polled, so we don't race its
    // own client by asserting on its queue.)
    const controller = controllerDisplay('fctl', 'F Ctl', { defaultTarget: 'fghost' });
    const present = siblingDisplay('fpresent', 'F Present');
    await drainTypes(request, 'fghost');
    await drainTypes(request, 'fpresent');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, present] }), '/display/fctl',
    );

    await display.module('display-control').getByRole('button', { name: 'Next screen' }).click();

    // Give the 200ms debounce + dispatch time to land before asserting the empties.
    await page.waitForTimeout(500);
    expect(await drainTypes(request, 'fghost')).not.toContain('next-screen');
    expect(await drainTypes(request, 'fpresent')).not.toContain('next-screen');
  });

  test('rapid double-tap on Next is debounced into a single command', async ({ page, request }) => {
    const controller = controllerDisplay('dctl', 'D Ctl', { defaultTarget: 'dsib' });
    const sibling = siblingDisplay('dsib', 'D Sib');
    await drainTypes(request, 'dsib');
    const display = await renderOnDisplay(
      page, request, baseConfig({ displays: [controller, sibling] }), '/display/dctl',
    );

    // Two native clicks in the same synchronous tick fall inside the 200ms
    // trailing-debounce window, so they collapse to one dispatch. (element.click()
    // dispatches a bubbling click that reaches React's onClick.)
    const nextBtn = display.module('display-control').getByRole('button', { name: 'Next screen' });
    await nextBtn.evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });

    // Settle past the debounce window (a wait, not the assertion), then count.
    await page.waitForTimeout(500);
    const types = await drainTypes(request, 'dsib');
    expect(types.filter((t) => t === 'next-screen')).toHaveLength(1);
  });
});
