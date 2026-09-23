import type { ScreenConfiguration } from '@/types/config';

/** Existing calendar modules keep their event backgrounds because the new optional flag defaults to true. */
export const v13ToV14 = {
  version: 14,
  description: 'Calendar event backgrounds can be hidden',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({ ...config, version: 14 }),
};