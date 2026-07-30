import { getAllScreens } from '@/lib/display-filter';
import type { ChoreChartConfig, ScreenConfiguration } from '@/types/config';

const CHORE_MODULE_TYPES = ['chore-chart', 'fullscreen-chore-chart'];

/**
 * Build the `ChoreChartConfig` the phone surfaces render with, from the first
 * chore module found anywhere in the configuration.
 *
 * Shared by `/remote` and `/chores` because they must agree: `/chores` uses a
 * null result to decide whether to show kids the empty state, while `/remote`
 * uses it to decide whether the Chores tab exists. When these were two
 * hand-rolled copies they could disagree, and both read the frozen legacy
 * `config.screens` pool — so a chore chart living on any display other than
 * the one that inherited the globals was invisible to both.
 *
 * Returns `null` when no chore module exists anywhere.
 *
 * `allowDisplayComplete` is always `true` here: the module-level toggle gates
 * tapping on the kiosk itself, not on a phone.
 */
export function resolveChoreModuleConfig(config: ScreenConfiguration): ChoreChartConfig | null {
  let modConfig: Record<string, unknown> | null = null;

  for (const screen of getAllScreens(config)) {
    for (const mod of screen.modules) {
      if (CHORE_MODULE_TYPES.includes(mod.type)) {
        modConfig = mod.config;
        break;
      }
    }
    if (modConfig) break;
  }

  if (modConfig === null) return null;

  return {
    weekStartDay: (modConfig.weekStartDay as 'sunday' | 'monday') ?? 'monday',
    showPoints: (modConfig.showPoints as boolean) ?? true,
    showStreaks: (modConfig.showStreaks as boolean) ?? true,
    showTimeOfDay: (modConfig.showTimeOfDay as boolean) ?? true,
    allowDisplayComplete: true,
    accentColor: (modConfig.accentColor as string) ?? '#f59e0b',
    view: 'board',
  };
}
