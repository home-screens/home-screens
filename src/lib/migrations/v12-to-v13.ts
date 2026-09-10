import type { ScreenConfiguration } from '@/types/config';

/** The cross-file family transaction, not schema migration, removes people. */
export const v12ToV13 = {
  version: 13,
  description: 'Shared family roster available; preserve legacy calendar people for the family fold',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({ ...config, version: 13 }),
};
