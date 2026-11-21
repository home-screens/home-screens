/**
 * Every top-level field the worker reads off a beacon body into a column of
 * its own. The hub builds the body in `src/lib/telemetry.ts`; a test there
 * holds what it sends against this list, so a field renamed on one side
 * cannot quietly empty a column.
 */
export const BEACON_FIELDS = [
  'installId',
  'appVersion',
  'beaconVersion',
  'platform',
  'arch',
  'nodeVersion',
  'displayWidth',
  'displayHeight',
  'displayTransform',
  'screenCount',
  'moduleCount',
  'moduleTypes',
  'profileCount',
  'weatherProvider',
  'transitionEffect',
  'sleepEnabled',
  'alertsEnabled',
  'authEnabled',
  'hasGoogleCalendar',
  'hasIcalSources',
  'pluginCount',
  'displayCount',
  'displays',
  'hasOwnedProfiles',
  'hasSettingsOverride',
  'plugins',
] as const;

export type BeaconField = (typeof BEACON_FIELDS)[number];

/** A parsed body: only listed fields can be read, and each may be missing. */
export type BeaconBody = Partial<Record<BeaconField, unknown>>;
