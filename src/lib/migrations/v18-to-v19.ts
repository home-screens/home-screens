import type { ScreenConfiguration } from '@/types/config';

/**
 * Migration 019: a module may carry an open button (`openButtonScreen`) and
 * a screen may show only when opened (`rotation: 'opened'`, staying for its
 * `goBackAfterMs` once opened).
 *
 * Every new field is optional and its absence means what the config meant
 * before (no button, the screen takes its turn), so nothing in an existing
 * file changes. The step exists because the shapes of `ModuleInstance` and
 * `Screen` changed, and a release that reads these fields must not be
 * stepped back to by one that would drop them on its next save.
 */
export const v18ToV19 = {
  version: 19,
  description: 'Open buttons on modules; screens that show only when opened',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({ ...config, version: 19 }),
};
