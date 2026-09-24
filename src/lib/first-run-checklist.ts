import { isScreenEmpty } from '@/lib/display-filter';
import type { Screen } from '@/types/config';

export interface FirstRunSteps {
  template: boolean;
  /**
   * Someone is in the household. Chores, rewards, meals, timetables and the
   * calendar's name tags all hang off the roster, and an owner who follows
   * this card to the end used to arrive at a finished display having never
   * been asked for it.
   */
  family: boolean;
  /**
   * The town and the time zone are both saved. The Location page asks for the
   * two together, and without a zone every screen runs on the hub's own clock,
   * which on a stock Pi is UTC.
   */
  location: boolean;
  /**
   * Always false. Nothing on the hub records that `/remote` was ever opened,
   * and the checklist ticks steps off what is configured rather than off a
   * clicked link, so there is no honest signal to tick this one with. It stays
   * as a pointer and deliberately does not hold the card open.
   */
  phone: boolean;
  password: boolean;
}

export interface FirstRunChecklistInput {
  /** The person closed the card; it never comes back in this browser. */
  dismissed: boolean;
  /** Screens on the display being edited, or null before the config loads. */
  screens: Screen[] | null;
  /** A usable town (coordinates) is saved. */
  townSet: boolean;
  /** A household time zone is saved. */
  zoneSet: boolean;
  /** null while the hub has not answered about the household yet. */
  familySet: boolean | null;
  /** null while the hub has not answered about the password yet. */
  passwordSet: boolean | null;
}

export interface FirstRunChecklistState {
  /** Render the card at all. */
  show: boolean;
  steps: FirstRunSteps;
  /**
   * The town is saved and only the time zone is missing, so the location step
   * can say what is left instead of looking untouched.
   */
  onlyZoneMissing: boolean;
}

/**
 * Whether the getting-started card is still wanted, and which of its steps are
 * done.
 *
 * The card used to live only while every screen on the display was blank, so
 * step one's own button, which places modules, unmounted the card with steps
 * two to four unticked and unreachable. Step four is the only place in the
 * product that nudges an owner to set a password on a hub whose phone surface
 * holds all the family data, so it self-destructed within a minute of first
 * launch. The rule here is "until the steps are done, or until the person
 * closes it" instead.
 *
 * A pure function because the decision has three inputs from three different
 * places (the config, the hub, this browser's storage) and got them wrong; a
 * predicate spread across a component's render is not something a test can
 * hold still.
 */
export function resolveFirstRunChecklist(input: FirstRunChecklistInput): FirstRunChecklistState {
  const { dismissed, screens, townSet, zoneSet, familySet, passwordSet } = input;

  const steps: FirstRunSteps = {
    template: screens != null && screens.some((screen) => !isScreenEmpty(screen)),
    family: familySet === true,
    location: townSet && zoneSet,
    phone: false,
    password: passwordSet === true,
  };

  // Everything the editor knows without asking the hub. While any of it is
  // outstanding the install is plainly new, so the card shows straight away.
  const knownLocally = steps.template && steps.location;

  // Otherwise wait for the hub's answers about the household and the password:
  // on an install that needs nothing, flashing the card for the length of one
  // request is worse than the card arriving a moment late on the one install
  // that needs the nudge. A request that never answers leaves it quiet, which
  // errs toward not nagging.
  const show = !dismissed
    && screens != null
    && (!knownLocally || familySet === false || passwordSet === false);

  return { show, steps, onlyZoneMissing: townSet && !zoneSet };
}
