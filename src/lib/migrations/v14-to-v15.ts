/**
 * Migration 015: the full-screen weather sky became one setting.
 *
 * `skyLayer` used to be `auto` (a flat wash tinted by the conditions) or
 * `off`, with a separate `animateConditions` toggle for falling rain and
 * snow. The sky is now `living` (animated clouds, rain, snow, stars and fog),
 * `still` (the flat wash) or `off`.
 *
 * - A module that had motion on keeps motion: `auto` becomes `living`.
 * - A module whose household turned motion off stays motionless: `auto` with
 *   `animateConditions: false` becomes `still`.
 * - `off` stays `off`.
 * - `animateConditions` is removed either way.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from '@/lib/config-modules';

export const v14ToV15 = {
  version: 15,
  description: 'Full-screen weather sky: auto plus animateConditions folded into living / still / off',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const modules = mapConfigModules(config, (mod) => {
      if (mod.type !== 'fullscreen-weather' || !mod.config) return mod;
      const cfg = mod.config as Record<string, unknown>;
      if (!('animateConditions' in cfg) && cfg.skyLayer !== 'auto') return mod;
      const { animateConditions, skyLayer, ...rest } = cfg;
      const next = skyLayer === 'off'
        ? 'off'
        : animateConditions === false ? 'still' : 'living';
      return { ...mod, config: { ...rest, skyLayer: next } as typeof mod.config };
    });
    return { ...config, ...modules, version: 15 };
  },
};
