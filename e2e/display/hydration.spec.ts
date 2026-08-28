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
 * The browser clock, pinned to a date the server is nowhere near. Every module
 * here renders something derived from "now", so a pin this far off guarantees
 * the disagreement instead of waiting for a real midnight, minute or greeting
 * boundary to land inside the hydration window.
 *
 * A cross-DATE pin is the strong form of the ratchet: it also moves the month,
 * which is what the multi-month grid's fixed six-week layout exists to survive.
 * A module that goes back to deriving its child count from the clock turns this
 * red rather than failing once a month on a kiosk.
 */
function pinnedClock(): Date {
  return new Date('2021-03-04T09:17:00');
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
  // Six months at once: the grid's row count used to come from the date, so a
  // wide span makes it near-impossible for a pinned clock to land on a month
  // that happens to need the same number of rows as the server's.
  { name: 'multi-month · 6 months', type: 'multi-month', config: { monthCount: 6 } },
  // Adjacent days hidden: the rows that draw nothing are collapsed with a
  // date-dependent `flex`, which has to stay a suppressed attribute rather
  // than becoming a skipped child.
  { name: 'multi-month · no adjacent days', type: 'multi-month', config: { monthCount: 6, showAdjacentDays: false } },
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
