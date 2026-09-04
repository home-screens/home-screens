import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DISPLAY_OVERRIDE_FIELDS,
  SLEEP_OVERRIDE_FIELDS,
  ALERT_OVERRIDE_FIELDS,
  overrideUnitOf,
} from '../display-override-fields';

/**
 * Completeness ratchets for the per-display override model.
 *
 * `satisfies readonly (keyof DisplayNodeSettings)[]` proves every *listed*
 * field exists. It cannot prove either of the directions that actually drift,
 * because the lists are hand-maintained — "adding a new override field is a
 * two-step change", per the module's own doc comment:
 *
 * 1. A field on `DisplayNodeSettings` that no list names is an override the
 *    settings UI never offers.
 * 2. A field on `GlobalSettings` that `DisplayNodeSettings` never mirrors
 *    cannot be overridden at all. This is the one that bit:
 *    `showRotationProgress` sits on the same Defaults page as `swipeEnabled`,
 *    `setupHintEnabled` and `pauseEnabled`, all overridable, and was reachable
 *    only globally — so a household could not keep the dwell line on the
 *    kitchen panel and off the TV.
 *
 * Both interfaces are read out of the source because TypeScript types do not
 * exist at runtime — the same technique the E2E `meta` ratchets use.
 */

/** Field names declared on an interface in `src/types/config.ts`. */
function declaredFields(interfaceName: string): string[] {
  const source = readFileSync(join(process.cwd(), 'src/types/config.ts'), 'utf8');
  const start = source.indexOf(`export interface ${interfaceName} {`);
  expect(start, `${interfaceName} not found in src/types/config.ts`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

/**
 * `GlobalSettings` fields that are deliberately global-only, with the reason.
 *
 * Every entry is a decision someone made. "Nobody has asked for it" is not one
 * — a per-display rendering or interaction toggle with no entry here and no
 * mirror on `DisplayNodeSettings` is the drift this catches.
 */
const GLOBAL_ONLY: Record<string, string> = {
  latitude: 'server routes read location via readConfig, not filterConfigForDisplay (see the note on DisplayNodeSettings)',
  longitude: 'see latitude',
  locationName: 'see latitude',
  timezone: 'see latitude',
  weather: 'provider and units are fetched server-side per hub, not per display',
  calendar: 'sources are fetched once per hub and shared by every display',
  activeProfile: 'a display with its own profiles carries them on the DisplayNode itself',
  updateChannel: 'one hub, one software channel',
  advancedMode: 'an editor preference, not a display behaviour',
  telemetryEnabled: 'hub-level consent; a per-display opt-out would be meaningless',
  backupReminder: 'hub maintenance, surfaced in the editor',
  updateNotification: 'hub maintenance, surfaced in the editor',
  locale: 'global-only by design, like timeFormat (see LanguageFields)',
  formattingLocale: 'see locale',
  timeFormat: 'household preference, global-only by design (see TimeFormatFields)',
};

/**
 * Fields on the type that deliberately have no `OverrideRow`, with the reason.
 *
 * A field belongs here only when something else already owns it end to end.
 * "Not built yet" is not a reason — that is the drift this test exists to
 * catch, and it should fail until the field is either wired up or explained.
 */
const NOT_OVERRIDE_ROWS: Record<string, string> = {
  displayWidth: 'owned by the display node itself (per-display geometry), not an override of a global',
  displayHeight: 'owned by the display node itself (per-display geometry), not an override of a global',
  displayTransform: 'owned by the display node itself (per-display geometry), not an override of a global',
};

describe('per-display override field lists', () => {
  const lists = [...DISPLAY_OVERRIDE_FIELDS, ...SLEEP_OVERRIDE_FIELDS, ...ALERT_OVERRIDE_FIELDS] as string[];

  it('covers every field on DisplayNodeSettings, or explains why not', () => {
    const missing = declaredFields('DisplayNodeSettings').filter((f) => !lists.includes(f) && !(f in NOT_OVERRIDE_ROWS));
    expect(
      missing,
      `DisplayNodeSettings fields with no override list entry and no reasoned exemption: ${missing.join(', ')}. `
      + 'Add each to DISPLAY_OVERRIDE_FIELDS / SLEEP_OVERRIDE_FIELDS / ALERT_OVERRIDE_FIELDS, '
      + 'or to NOT_OVERRIDE_ROWS in this test with the reason it is owned elsewhere.',
    ).toEqual([]);
  });

  it('lists no field that is not on the type', () => {
    const declared = declaredFields('DisplayNodeSettings');
    const stale = lists.filter((f) => !declared.includes(f));
    expect(stale, `override list entries with no matching DisplayNodeSettings field: ${stale.join(', ')}`).toEqual([]);
  });

  it('names each field exactly once across the three lists', () => {
    const seen = new Set<string>();
    const duplicated = lists.filter((f) => (seen.has(f) ? true : (seen.add(f), false)));
    expect(duplicated, `fields in more than one override list: ${duplicated.join(', ')}`).toEqual([]);
  });

  it('exempts only fields the display node owns outright', () => {
    // Guards the escape hatch: an exemption must still be a real field, so a
    // renamed field cannot leave a stale excuse behind that hides the new name.
    const declared = declaredFields('DisplayNodeSettings');
    const bogus = Object.keys(NOT_OVERRIDE_ROWS).filter((f) => !declared.includes(f));
    expect(bogus, `NOT_OVERRIDE_ROWS names fields that no longer exist: ${bogus.join(', ')}`).toEqual([]);
  });

  it('mirrors every GlobalSettings field that a display can override, or explains why not', () => {
    const overridable = new Set(declaredFields('DisplayNodeSettings'));
    const unreachable = declaredFields('GlobalSettings')
      .filter((f) => !overridable.has(f) && !(f in GLOBAL_ONLY));
    expect(
      unreachable,
      `GlobalSettings fields a display cannot override and that are not declared global-only: ${unreachable.join(', ')}. `
      + 'Add each to DisplayNodeSettings (and to an override list), or to GLOBAL_ONLY in this test with the reason.',
    ).toEqual([]);
  });

  it('declares nothing global-only that is in fact overridable', () => {
    const overridable = new Set(declaredFields('DisplayNodeSettings'));
    const contradictory = Object.keys(GLOBAL_ONLY).filter((f) => overridable.has(f));
    expect(contradictory, `GLOBAL_ONLY names fields that ARE overridable: ${contradictory.join(', ')}`).toEqual([]);
  });

  it('resolves a unit member to the field that stands for it', () => {
    expect(overrideUnitOf('screensaver')).toBe('sleep');
    expect(overrideUnitOf('sleep')).toBe('sleep');
    expect(overrideUnitOf('rotationIntervalMs')).toBe('rotationIntervalMs');
  });
});
