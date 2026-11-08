import { createHubRevision } from './hub-revision';

/**
 * The parts of the meals revision a wall's code may import as well as the
 * hub's (`meals-revision.ts` reads files, so it stays on the hub).
 */

/** The response header a meals answer carries: the revision it was read at. */
export const MEALS_REVISION_HEADER = 'X-Meals-Revision';

/**
 * Bumped whenever a save through Home Screens changed Mealie's plan
 * (`clearMealiePlanCache`), so the meals revision on the wall's heartbeat
 * moves for a plan that lives in Mealie as it does for one in `meals.json`.
 * A change made in Mealie's own pages is not seen here; the wall's minute poll
 * still covers that.
 */
export const mealiePlanRevision = createHubRevision('mealie-plan');
