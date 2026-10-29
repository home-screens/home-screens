import { getAllScreens } from '@/lib/display-filter';
import type { ChoreChartConfig, FullscreenChoreCelebration, ScreenConfiguration } from '@/types/config';

const CHORE_MODULE_TYPES = ['chore-chart', 'fullscreen-chore-chart'];

/**
 * What the phone surfaces render with: the card chart's settings plus what a
 * finished day looks like, which only the full-screen chart can set. The
 * phone follows the first full-screen chart's choice so the wall and the
 * phone agree; a household with none celebrates the simple way.
 */
export type PhoneChoreConfig = ChoreChartConfig & { celebration: FullscreenChoreCelebration };

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
export function resolveChoreModuleConfig(config: ScreenConfiguration): PhoneChoreConfig | null {
  let modConfig: Record<string, unknown> | null = null;
  let celebration: FullscreenChoreCelebration | null = null;

  for (const screen of getAllScreens(config)) {
    for (const mod of screen.modules) {
      if (CHORE_MODULE_TYPES.includes(mod.type) && !modConfig) modConfig = mod.config;
      if (mod.type === 'fullscreen-chore-chart' && celebration === null) {
        celebration = (mod.config.celebration as FullscreenChoreCelebration | undefined) ?? 'simple';
      }
    }
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
    celebration: celebration ?? 'simple',
  };
}
