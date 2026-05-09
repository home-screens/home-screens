/**
 * Migration 005 — locale field added to GlobalSettings.
 *
 * Pure version bump. The new `settings.locale` and `settings.formattingLocale`
 * fields are both optional and resolved at read time (defaulting to en-US),
 * so no on-disk transform is needed. Bumping the version just lets newer
 * code distinguish "this config predates the locale picker" from "this
 * config could have a locale set".
 */

import type { ScreenConfiguration } from '@/types/config';

export const v4ToV5 = {
  version: 5,
  description: 'Add optional locale to GlobalSettings (no field changes — defaults resolved at read time)',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({ ...config, version: 5 }),
  down: (config: ScreenConfiguration): ScreenConfiguration => ({ ...config, version: 4 }),
};
