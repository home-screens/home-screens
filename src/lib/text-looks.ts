/**
 * Text module looks: rules that change a Text module's colors, icon or words
 * while their conditions hold. Pure functions over config plus a shared-state
 * snapshot, so the wall, the editor preview, the editor's status pills and
 * the unit tests all share one authority.
 *
 * Semantics (documented on the types too):
 * - a look's `when` list is an implicit AND, evaluated by the same
 *   three-valued evaluator the visibility gate uses; empty means always
 * - rules run top to bottom; the first rule that sets a property wins for
 *   that property, so rules compose per field and list order is priority
 * - a look whose conditions are unknown (a key not yet on the bus) changes
 *   nothing; the module's own style is the fallback, so there is no default row
 */

import type { ModuleStyle, TextLook } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { collectSourceKeys, containsTimeCondition, evaluateConditionsTri, type ScheduleClock } from '@/lib/schedule';
import { extractSharedStateKeys } from '@/lib/shared-state-template';

/** The style properties a look can set, in the order the editor lists them. */
export const TEXT_LOOK_PROPERTIES = ['textColor', 'borderColor', 'backgroundColor', 'icon', 'text', 'opacity'] as const;
export type TextLookProperty = (typeof TEXT_LOOK_PROPERTIES)[number];

/** Opacity bounds, matching the calendar event rules' fade. */
export const TEXT_LOOK_OPACITY_MIN = 0.1;
export const TEXT_LOOK_OPACITY_MAX = 1;

/**
 * What one look is doing right now:
 * - `showing`: its conditions hold and at least one of its properties is in effect
 * - `overruled`: its conditions hold but every property it sets was already set by a rule above it
 * - `unmet`: its conditions are false
 * - `unknown`: a key it reads has not been published yet
 */
export type TextLookVerdict = 'showing' | 'overruled' | 'unmet' | 'unknown';

/** The merged overrides, each from the first matching rule that set it. */
export type TextLookOverrides = Partial<Pick<TextLook, TextLookProperty>>;

export interface TextLookResult {
  overrides: TextLookOverrides;
  /** Verdict per rule id, in list order. */
  verdicts: Map<string, TextLookVerdict>;
  /** Ids of the rules that set at least one property, in list order. */
  showing: string[];
}

const NO_OVERRIDES: TextLookOverrides = Object.freeze({});
const EMPTY_RESULT: TextLookResult = { overrides: NO_OVERRIDES, verdicts: new Map(), showing: [] };

/**
 * What the look sets for `property`, or undefined when it sets nothing there.
 * Blank words and a blank icon count as unset: the editor's Show text as
 * switch starts the words empty under a "Keep the content above" placeholder,
 * and an icon cleared to "" means the module's own icon. A blank that counted
 * as set wiped the words off the wall and, since the first rule to set a
 * property wins, hid the words of every look below it too.
 */
function lookValue(look: TextLook, property: TextLookProperty): unknown {
  const value = look[property];
  if ((property === 'text' || property === 'icon') && typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

/** True when the look sets at least one property. */
export function lookSetsAnything(look: TextLook): boolean {
  return TEXT_LOOK_PROPERTIES.some((p) => lookValue(look, p) !== undefined);
}

const NO_STATES: ReadonlyMap<string, SharedStateEntry> = new Map();

/** True when the look's conditions read the shared-state bus anywhere. */
function readsStateKeys(look: TextLook): boolean {
  const keys = new Set<string>();
  collectSourceKeys(look.when ?? [], keys);
  return keys.size > 0;
}

/**
 * Evaluate a looks list against a snapshot and a clock. Pure; the result for
 * an empty or absent list is a shared frozen constant so callers can
 * reference-compare it.
 *
 * `states` is null when the caller has no live values at all (the editor
 * with no display report and nothing on its own bus). That is not the same
 * as an empty bus, which is a fact about the wall: with null, a look that
 * reads a key cannot be judged, and neither can anything below it, since the
 * undecided look may overrule it. Looks above the first key-reading one are
 * still decided, so an unconditional or clock-only look at the top keeps its
 * verdict.
 */
export function resolveTextLooks(
  looks: readonly TextLook[] | undefined,
  states: ReadonlyMap<string, SharedStateEntry> | null,
  now: ScheduleClock = new Date(),
): TextLookResult {
  if (!looks || looks.length === 0) return EMPTY_RESULT;
  const overrides: TextLookOverrides = {};
  const verdicts = new Map<string, TextLookVerdict>();
  const showing: string[] = [];
  let undecided = false;
  for (const look of looks) {
    if (states === null && !undecided && readsStateKeys(look)) undecided = true;
    const held = undecided ? undefined : evaluateConditionsTri(look.when ?? [], states ?? NO_STATES, now);
    if (held === undefined) {
      verdicts.set(look.id, 'unknown');
      continue;
    }
    if (!held) {
      verdicts.set(look.id, 'unmet');
      continue;
    }
    let contributed = false;
    for (const property of TEXT_LOOK_PROPERTIES) {
      const value = lookValue(look, property);
      if (value === undefined || overrides[property] !== undefined) continue;
      (overrides as Record<string, unknown>)[property] = value;
      contributed = true;
    }
    verdicts.set(look.id, contributed ? 'showing' : 'overruled');
    if (contributed) showing.push(look.id);
  }
  return { overrides, verdicts, showing };
}

/**
 * Every shared-state key the looks read: condition keys plus `{key}` tokens
 * in a look's replacement text. Blank keys (a condition still being authored)
 * are left in, as `collectSourceKeys` does; callers that demand or subscribe
 * drop them.
 *
 * `expandText` runs over a look's text before its tokens are read. The wall
 * passes its template-variable expansion, so a token wrapped around a
 * `{{greeting}}`-style variable (`{key|default:{{greeting}}}`) is found the
 * way it is in the content; the token grammar itself has no nesting.
 */
export function collectTextLookKeys(
  looks: readonly TextLook[] | undefined,
  into: Set<string>,
  expandText: (text: string) => string = (text) => text,
): void {
  if (!looks) return;
  for (const look of looks) {
    if (look.when) collectSourceKeys(look.when, into);
    if (typeof look.text === 'string') {
      for (const key of extractSharedStateKeys(expandText(look.text))) into.add(key);
    }
  }
}

/** True when any look reads the clock, so the renderer must tick. */
export function textLooksNeedClock(looks: readonly TextLook[] | undefined): boolean {
  if (!looks) return false;
  return looks.some((look) => containsTimeCondition(look.when ?? []));
}

/**
 * The module style with a look's overrides applied. Fade multiplies the
 * card's own solidity, so a 50% fade on a card that is already half
 * see-through gives a quarter. Returns the same object when nothing applies.
 */
export function applyTextLook(style: ModuleStyle, overrides: TextLookOverrides): ModuleStyle {
  if (
    overrides.textColor === undefined
    && overrides.borderColor === undefined
    && overrides.backgroundColor === undefined
    && overrides.opacity === undefined
  ) {
    return style;
  }
  const next: ModuleStyle = { ...style };
  if (overrides.textColor !== undefined) next.textColor = overrides.textColor;
  if (overrides.borderColor !== undefined) {
    next.borderColor = overrides.borderColor;
    // A card with no border has nothing to recolor; a look that picks a
    // border color means to show one.
    if (!(next.borderWidth > 0)) next.borderWidth = 2;
  }
  if (overrides.backgroundColor !== undefined) next.backgroundColor = overrides.backgroundColor;
  if (overrides.opacity !== undefined) {
    const own = typeof style.opacity === 'number' && Number.isFinite(style.opacity) ? style.opacity : 1;
    next.opacity = Math.max(0, Math.min(1, own * overrides.opacity));
  }
  return next;
}

/**
 * The opacity the module puts on its own content for a look's fade, or
 * undefined when the card already fades it. ModuleWrapper bakes
 * `style.opacity` into the background color while backdrop blur is on (an
 * opaque card would hide the blur), so under blur, the default, the card's
 * opacity never reaches the text, the icon or the border. A look's fade is
 * meant to dim the whole module, so the content fades on its own in that
 * case; without blur the wrapper's opacity already covers everything and a
 * second layer would fade the content twice.
 */
export function lookContentOpacity(style: ModuleStyle, overrides: TextLookOverrides): number | undefined {
  if (overrides.opacity === undefined) return undefined;
  return style.backdropBlur > 0 ? overrides.opacity : undefined;
}
