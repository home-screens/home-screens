import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { seedChores, seedMeals, seedTodos } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings, MODULE_FIXTURES } from '../helpers/module-fixtures';
import { AUTOSIZED_MODULES, AUTOSIZE_EXEMPTIONS } from '../helpers/autosized-modules';
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

async function renderAt(page: Page, request: Parameters<typeof renderOnDisplay>[1], sandboxDir: string, type: ModuleType, size: { w: number; h: number }) {
  const fx = MODULE_FIXTURES[type];
  await stubModuleData(page);
  if (fx.seed === 'chores') await seedChores(request);
  if (fx.seed === 'meals') await seedMeals(request);
  if (fx.seed === 'todos') seedTodos(sandboxDir);
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

/**
 * `largestType` twice in a row with the same answer.
 *
 * The type follows the box through a ResizeObserver callback, so there is a
 * frame between "the card is 900px now" and "the text is sized for 900px". A
 * single read can land in it, and the fill polls below cannot catch that: they
 * divide the stale font size by the NEW box height, and the floor they check
 * (4%) is low enough for the stale value to clear it. That is exactly how
 * word-of-day once reported 44.8px in the 900px box and 52.1px in the 220px
 * one, the small box's reading was the settled one, the large box's was not.
 */
async function settledType(page: Page, type: ModuleType): Promise<{ max: number; boxH: number }> {
  let previous = await largestType(page, type);
  let current = previous;
  await expect
    .poll(async () => {
      previous = current;
      current = await largestType(page, type);
      return current.max === previous.max && current.boxH === previous.boxH && current.boxH > 0;
    }, { message: `${type} never stopped resizing its type` })
    .toBe(true);
  return current;
}

for (const type of AUTOSIZED_MODULES) {
  test(`${type} sizes its type for its box`, async ({ page, request, sandboxDir }) => {
    await renderAt(page, request, sandboxDir, type, SMALL);
    // Polled, not slept on: the measure-and-fit pass converges over a render or
    // two and the web font swap can move it again.
    await expect
      .poll(async () => {
        const { max, boxH } = await largestType(page, type);
        return boxH > 0 ? max / boxH : 0;
      }, { message: `${type} type is lost in a ${SMALL.w}x${SMALL.h} box` })
      .toBeGreaterThanOrEqual(AUTOSIZE_EXEMPTIONS[type]?.fill ? 0 : MIN_FILL);
    const small = await settledType(page, type);

    await renderAt(page, request, sandboxDir, type, LARGE);
    const exempt = AUTOSIZE_EXEMPTIONS[type] ?? {};
    if (!exempt.fill) {
      await expect
        .poll(async () => {
          const { max, boxH } = await largestType(page, type);
          return boxH > 0 ? max / boxH : 0;
        }, { message: `${type} type is lost in a ${LARGE.w}x${LARGE.h} box` })
        .toBeGreaterThanOrEqual(MIN_FILL);
    }
    const large = await settledType(page, type);

    if (exempt.growth) {
      expect(large.max, `${type} is listed as fixed-size (${exempt.growth}) but grew with its box`)
        .toBeLessThan(small.max * MIN_GROWTH);
      return;
    }
    expect(
      large.max / small.max,
      `${type} renders ${large.max.toFixed(1)}px in a ${LARGE.h}px box and ${small.max.toFixed(1)}px in a ${SMALL.h}px one: its type is not following its box`,
    ).toBeGreaterThanOrEqual(MIN_GROWTH);
  });
}
