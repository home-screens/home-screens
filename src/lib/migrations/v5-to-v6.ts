/**
 * Migration 006 — countdown `scale` is now view-independent.
 *
 * `CountdownNextView` used to render its flip cards at `basePx * 1.3` while
 * `CountdownAllView` rendered at plain `basePx`, so the same `scale` produced
 * two different pixel sizes depending on the selected view (scale 3.4 on Next
 * out-rendered scale 4 on All). The multiplier is gone from the render path;
 * this migration folds it into the stored value so every existing Next-view
 * countdown keeps the size its owner picked.
 *
 * Rounded to one decimal to stay on the config section's 0.1 slider step: an
 * off-step value would snap (visibly) the first time the slider was touched.
 * Rounding error is at most 0.05 absolute, so it matters only at the small end
 * of the range — the worst case is the minimum scale 0.5 (0.65 → 0.7, +7.7%,
 * i.e. flip digits 18.2px → 19.6px), falling below 1% above scale ~1.3 and to
 * 0.45% at the old maximum. Sub-pixel-scale accuracy is not worth leaving a
 * value the slider cannot represent.
 *
 * The slider's max moved 4 → 5.2 for the same reason: 4 × 1.3 is the largest
 * value this migration can produce, and it must stay expressible.
 *
 * NOTE: `scale` is read by more than the flip cards — `CountdownNextView` also
 * derives its heading size and gap from it. Those coefficients were rebased by
 * 1/1.3 in the same change so this migration preserves the whole rendered
 * layout, not just the digits. Keep the two in lockstep.
 *
 * Modules with no explicit `view` default to 'all' at render time and are left
 * alone. A missing/invalid `scale` is treated as the render-time default of 1.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

/** The view-local multiplier removed from CountdownNextView. */
const NEXT_VIEW_MULTIPLIER = 1.3;

export const v5ToV6 = {
  version: 6,
  description: 'Fold the Next view\'s 1.3x render multiplier into countdown scale',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 6,
    ...mapConfigModules(config, (mod) => {
      if (mod.type !== 'countdown') return mod;
      const cfg = mod.config as Record<string, unknown>;
      if (cfg?.view !== 'next') return mod;
      const raw = cfg.scale;
      const current = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
      return {
        ...mod,
        config: { ...cfg, scale: Math.round(current * NEXT_VIEW_MULTIPLIER * 10) / 10 },
      } as typeof mod;
    }),
  }),
};
