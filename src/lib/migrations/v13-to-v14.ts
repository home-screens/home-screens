import type { ScreenConfiguration } from '@/types/config';

/** Existing weather modules keep their current presentation because both new optional flags default to true. */
export const v13ToV14 = {
  version: 14,
  description: 'Daily weather forecast presentation is configurable',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({ ...config, version: 14 }),
};