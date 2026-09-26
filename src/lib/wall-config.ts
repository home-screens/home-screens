import type { ScreenConfiguration, DisplayNode } from '@/types/config';
import { configRevision } from './config';
import { LEGACY_DISPLAY_ID } from './display-filter';
import { hubTimezone } from './household-day';

/**
 * Trim every display except `displayId` down to the identity the display
 * client actually reads from a sibling: `display-control` targets other
 * displays by id and labels them by name, and nothing on the wall reads
 * another display's screens.
 *
 * `screens: []` on a sibling therefore means "not sent", not "empty". Only
 * the requested display's node is complete, which is what
 * `filterConfigForDisplay` resolves against. Anything that needs a real
 * sibling node must read the unfiltered config.
 */
function scopeToDisplay(config: ScreenConfiguration, displayId: string): ScreenConfiguration {
  const displays = config.displays?.map<DisplayNode>((display) =>
    display.id === displayId ? display : { id: display.id, name: display.name, screens: [] },
  );
  return { ...config, displays };
}

/**
 * What walls are sent, worked out once per cached config object. The cache
 * hands every poll the same object until config.json changes, so the
 * document's hash and each display's body are computed once per version
 * instead of once per poll. Safe only because that object is read-only.
 */
export interface WallAnswers {
  revision: string;
  bodies: Map<string, string>;
}
const wallAnswers = new WeakMap<ScreenConfiguration, WallAnswers>();

export function answersFor(config: ScreenConfiguration): WallAnswers {
  let answers = wallAnswers.get(config);
  if (!answers) {
    answers = { revision: configRevision(config), bodies: new Map() };
    wallAnswers.set(config, answers);
  }
  return answers;
}

export function wallBody(config: ScreenConfiguration, answers: WallAnswers, displayId: string): string {
  const kept = answers.bodies.get(displayId);
  if (kept !== undefined) return kept;
  // An unknown id leaves no matching node, so the client's filter returns null
  // and it self-heals to /display. That is the existing deleted-display path.
  const body = JSON.stringify(scopeToDisplay(config, displayId));
  // Only ids the config knows are kept, so made-up ids cannot grow the map.
  if (displayId === LEGACY_DISPLAY_ID || config.displays?.some((display) => display.id === displayId)) {
    answers.bodies.set(displayId, body);
  }
  return body;
}

/**
 * A wall's URL names its display, so the document's revision and the hub's
 * zone (the one header a wall reads besides the body) say what it would be
 * sent. URI-encoding keeps the zone inside the characters an ETag allows.
 */
export function wallEtag(revision: string, zone: string): string {
  return `"${revision}.${encodeURIComponent(zone)}"`;
}

/**
 * The ETag a wall's config poll would be answered with right now. The
 * heartbeat carries it, so a wall fetches its config only when this differs
 * from the ETag of the answer it last applied. Pass the cached config object.
 */
export function wallConfigEtag(config: ScreenConfiguration): string {
  return wallEtag(answersFor(config).revision, hubTimezone());
}
