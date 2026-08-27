import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { VIEW_MATRIX } from '../helpers/view-matrix';
import type { ModuleType } from '@/types/config';

/**
 * Clock-derived modules must not throw a hydration mismatch.
 *
 * Anything that renders "now" produces one string on the server and another
 * on the client whenever a minute (or a greeting / date / midnight boundary)
 * falls between the two renders. React reports that as an uncaught error on
 * the display, and on a kiosk it fires roughly once an hour forever.
 *
 * Pinning the browser clock away from the server's makes the disagreement
 * certain instead of a once-an-hour flake, so this is a real ratchet rather
 * than a coin flip. Every module here already handles it (the text module via
 * `suppressHydrationWarning` plus a mount-deferred per-character branch; the
 * date, clock and countdown modules via `suppressHydrationWarning`), so a
 * regression in any of them turns this red.
 */
/**
 * The browser clock, pinned to the early hours of the SAME day the server is
 * on. That models the real hydration window — the client renders a moment
 * after the server, sometimes across a minute, hour, AM/PM or greeting
 * boundary — while keeping the calendar date identical.
 *
 * Deliberately not a different DATE: the multi-month grid emits 4, 5 or 6 week
 * rows depending on the month, so a cross-month pin changes the child count,
 * which `suppressHydrationWarning` cannot forgive (it covers only the element
 * it sits on, never a differing number of descendants). That residual case —
 * a display hydrating across a midnight that also changes a month's row count
 * — needs a fixed 6-row grid to close, which is a layout change, not a
 * suppression. Tracked separately rather than papered over here.
 */
function pinnedClock(): Date {
  const d = new Date();
  d.setHours(3, 7, 0, 0);
  return d;
}

interface Case {
  name: string;
  type: ModuleType;
  config: Record<string, unknown>;
}

const CASES: Case[] = [
  // The text module's template variables, across every render branch: plain
  // text, markdown (innerHTML), per-character animation, the typewriter, and
  // rotation. Per-character is the delicate one — it wraps every glyph in its
  // own span, so a resolved value that changes LENGTH changes the child count.
  { name: 'text · {{time}}', type: 'text', config: { content: 'Now: {{time}}', templateVariables: true } },
  { name: 'text · {{greeting}}', type: 'text', config: { content: '{{greeting}}, everyone', templateVariables: true } },
  { name: 'text · markdown', type: 'text', config: { content: '**Now: {{time}}**', templateVariables: true, markdown: true } },
  { name: 'text · per-char, stable length', type: 'text', config: { content: 'Now: {{time}}', templateVariables: true, effect: 'wave' } },
  { name: 'text · per-char, changing length', type: 'text', config: { content: '{{greeting}}!', templateVariables: true, effect: 'bounce' } },
  { name: 'text · typewriter', type: 'text', config: { content: 'Now: {{time}}', templateVariables: true, effect: 'typewriter' } },
  { name: 'text · rotation', type: 'text', config: { content: 'Now: {{time}}|{{greeting}}', templateVariables: true, rotationEnabled: true } },
  { name: 'year-progress', type: 'year-progress', config: {} },
  { name: 'multi-month', type: 'multi-month', config: {} },
  { name: 'countdown', type: 'countdown', config: { events: [{ id: 'e1', name: 'LAUNCH', date: '2099-12-31' }] } },
];

/**
 * Every view of the two multi-view modules whose whole job is the current
 * time. Each view renders its own markup, so the guard has to be per view —
 * the AM/PM span in the clock's classic view sits inside an already-suppressed
 * parent and still needed its own suppression, which one default-view case
 * would never have caught.
 */
for (const spec of VIEW_MATRIX) {
  if (spec.type !== 'clock' && spec.type !== 'date') continue;
  for (const view of spec.views) {
    CASES.push({ name: `${spec.type} · ${view}`, type: spec.type, config: { view } });
  }
}

for (const c of CASES) {
  test(`no hydration mismatch · ${c.name}`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    // Must be installed before navigation so the hydration pass sees it.
    await page.clock.setFixedTime(pinnedClock());

    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [textModule('E2E ANCHOR'), buildModuleInstance(c.type, c.config)])],
    }));
    await page.goto('/display');
    await expect(page.locator(`[data-module-type="${c.type}"]`).first()).toBeVisible();
    await page.waitForTimeout(700);

    expect(errors, `${c.name} logged a hydration/render error`).toEqual([]);
  });
}

/**
 * The per-character branch is deferred to after mount for template text (see
 * TextModule), so this pins that it still arrives — a deferral that never
 * upgraded would silently drop the wave/bounce/shake effect for anyone using
 * it with a {{token}}.
 */
test('per-character animation still applies to template text after mount', async ({ page, request }) => {
  await page.clock.setFixedTime(pinnedClock());
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      buildModuleInstance('text', { content: 'ABC {{time}}', templateVariables: true, effect: 'wave' }),
    ])],
  }));
  await page.goto('/display');
  const mod = page.locator('[data-module-type="text"]').first();
  await expect(mod).toBeVisible();
  // One span per glyph, each with its own staggered animation delay.
  await expect.poll(async () => mod.locator('span > span[style*="animation"]').count()).toBeGreaterThan(5);
});
