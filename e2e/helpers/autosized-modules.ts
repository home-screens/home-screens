import type { ModuleType } from '@/types/config';

/**
 * Modules that size their type off their measured box, via `useScaledFontSize`
 * or `useFitFontSize`.
 *
 * The list is enforced, not maintained by hand: a `meta` ratchet walks the
 * import graph of every entry in `module-components.ts` and fails if a module
 * reaching either hook is missing here, or if a row here no longer reaches one.
 */
export const AUTOSIZED_MODULES: ModuleType[] = [
  'affirmations', 'clock', 'countdown', 'dad-joke', 'date', 'greeting', 'history',
  'multi-month', 'news', 'quote', 'sticky-note', 'todo', 'weather', 'word-of-day',
];

/**
 * A reasoned exemption from one of the two properties the auto-size matrix
 * asserts. A reason here is a claim about how the module is *meant* to behave,
 * not a place to park one that fails.
 *
 * - `fill`: skip "the largest type is a real fraction of the card". Grid
 *   layouts break the assumption behind it, which is that the card height is
 *   the right denominator.
 * - `growth`: the module is meant to render the same size in any box, so the
 *   matrix asserts the opposite property (that it does NOT grow) instead.
 */
export interface AutoSizeExemption {
  fill?: string;
  growth?: string;
}

export const AUTOSIZE_EXEMPTIONS: Partial<Record<string, AutoSizeExemption>> = {
  countdown: {
    // The flip cards are authored at 28px times the module's own `scale` config
    // and ignore the box, so a countdown renders the same digits in a 220px card
    // and a 900px one. `scale` is the intended control and the E2E variant rows
    // pin 28 * scale exactly. A size that never grows also falls below any fill
    // floor once the box is big enough, so both properties are excused.
    growth: 'flip cards are 28px * config.scale, not box-derived',
    fill: 'see growth: a fixed size cannot hold a fraction of an arbitrary box',
  },
  'multi-month': {
    // Its largest type is a day number in a six-week by seven-day grid, so the
    // card height is the wrong denominator: 13.6px in a 900px card is one cell
    // of forty-two, not type lost in a void. It still has to grow with its box,
    // and does (2.67x across the pair).
    fill: 'a 6x7 grid: the cell, not the card, is what its type is sized against',
  },
};
