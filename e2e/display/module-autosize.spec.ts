import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { seedChores, seedMeals } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings, MODULE_FIXTURES } from '../helpers/module-fixtures';
import type { ModuleType } from '@/types/config';

/**
 * Type has to be sized for the box it is in.
 *
 * The suite could already tell you that a module rendered the right words in
 * the right place and did not overflow — and every one of those assertions
 * passed while weather, news, quote, dad joke and history rendered 16px type in
 * a 650px-tall box, because 16px in a 650px box is the most "fitting" result
 * physically possible. Every geometry assertion in the suite was one-sided.
 *
 * So this is the other side. Two renders per module, a small box and a large
 * one, and two properties that the shipped bug violated and a healthy module
 * cannot:
 *
 *   1. the largest type is a real fraction of the box (not lost in it), and
 *   2. the same module in a box three times taller renders visibly bigger type.
 *
 * Unit tests cannot cover this: they run in jsdom, which has no layout, so
 * `clientHeight` is 0 and every module test stubs ResizeObserver out. The
 * commit that shipped the bug added five careful unit tests for the branch it
 * broke; all five passed, because a stubbed observer reports nothing and a hook
 * that measures nothing looks exactly like one that measures correctly.
 */

/** Modules that size themselves off their measured box, via `useScaledFontSize`
 *  directly or through `ScaledAccentContent`. */
const AUTOSIZED: ModuleType[] = [
  'weather', 'news', 'quote', 'dad-joke', 'word-of-day', 'history',
  'clock', 'date', 'greeting', 'sticky-note', 'countdown', 'todo', 'affirmations',
];

/**
 * Modules that render the same size in any box, with the reason. An entry here
 * is a claim that the module is *meant* to be box-independent — not a place to
 * park one that fails. They are held to the opposite of property 2 (they must
 * NOT grow) and are excused property 1 in the large box, since a size that
 * never grows falls below any fill floor once the box is big enough.
 */
const FIXED_SIZE_REASONS: Partial<Record<string, string>> = {
  // The flip cards are authored at 28px times the module's own `scale` config
  // and ignore the box, so a countdown renders the same digits in a 220px card
  // and a 650px one. Deliberate today (`scale` is the control, and the E2E
  // variant rows pin 28 * scale exactly), but it does mean the module is the
  // one auto-sizing module whose headline does not follow its box.
  countdown: 'flip cards are 28px * config.scale, not box-derived',
};

/**
 * Floor, as a fraction of box height. The smallest healthy value measured
 * across these modules is 6.6%; the shipped bug produced 1.8% in the large box.
 * 4% sits between them with room on both sides.
 */
const MIN_FILL = 0.04;

/**
 * Growth between the two boxes, whose heights differ by 4.1x. The smallest
 * healthy growth measured is 2.46x (the clock, which stops growing once its
 * width becomes the binding constraint); the bug produced exactly 1.0x, the
 * same pixels in both boxes.
 */
const MIN_GROWTH = 2.0;

const SMALL = { w: 400, h: 220 };
const LARGE = { w: 900, h: 900 };

/**
 * The largest font size actually painted inside the module, and the height of
 * the card it is painted in. Only elements with their own visible text count,
 * so a wrapper's inherited size and a hidden row (news pages the rows it is not
 * showing with `display: none`) cannot stand in for what a person sees.
 */
async function largestType(page: Page, type: ModuleType): Promise<{ max: number; boxH: number }> {
  return page.evaluate((t) => {
    const root = document.querySelector(`[data-module-type="${t}"]`) as HTMLElement | null;
    if (!root || !root.firstElementChild) return { max: 0, boxH: 0 };
    const boxH = (root.firstElementChild as HTMLElement).getBoundingClientRect().height;
    let max = 0;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
      if (!ownText) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(fs) && fs > max) max = fs;
    }
    return { max, boxH };
  }, type);
}

async function renderAt(page: Page, request: Parameters<typeof renderOnDisplay>[1], type: ModuleType, size: { w: number; h: number }) {
  const fx = MODULE_FIXTURES[type];
  await stubModuleData(page);
  if (fx.seed === 'chores') await seedChores(request);
  if (fx.seed === 'meals') await seedMeals(request);
  const mod = buildModuleInstance(type, fx.config);
  mod.size = size;
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [mod])],
    settings: matrixSettings(),
  }));
  // The fixture's own assertion is the wait for real content: measuring a
  // loading state would measure the wrong tree entirely.
  await fx.expect(display.module(type), page);
}

for (const type of AUTOSIZED) {
  test(`${type} sizes its type for its box`, async ({ page, request }) => {
    await renderAt(page, request, type, SMALL);
    // Polled, not slept on: the measure-and-fit pass converges over a render or
    // two and the web font swap can move it again.
    await expect
      .poll(async () => {
        const { max, boxH } = await largestType(page, type);
        return boxH > 0 ? max / boxH : 0;
      }, { message: `${type} type is lost in a ${SMALL.w}x${SMALL.h} box` })
      .toBeGreaterThanOrEqual(MIN_FILL);
    const small = await largestType(page, type);

    await renderAt(page, request, type, LARGE);
    const reason = FIXED_SIZE_REASONS[type];
    if (!reason) {
      await expect
        .poll(async () => {
          const { max, boxH } = await largestType(page, type);
          return boxH > 0 ? max / boxH : 0;
        }, { message: `${type} type is lost in a ${LARGE.w}x${LARGE.h} box` })
        .toBeGreaterThanOrEqual(MIN_FILL);
    }
    const large = await largestType(page, type);

    if (reason) {
      expect(large.max, `${type} is listed as fixed-size (${reason}) but grew with its box`)
        .toBeLessThan(small.max * MIN_GROWTH);
      return;
    }
    expect(
      large.max / small.max,
      `${type} renders ${large.max.toFixed(1)}px in a ${LARGE.h}px box and ${small.max.toFixed(1)}px in a ${SMALL.h}px one: its type is not following its box`,
    ).toBeGreaterThanOrEqual(MIN_GROWTH);
  });
}
