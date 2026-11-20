import { fileEtag } from './file-etag';
import { MEALS_FILE } from './meal-data';
import { mealiePlanRevision } from './meals-hub-revision';

export { MEALS_REVISION_HEADER } from './meals-hub-revision';

/**
 * A revision for `GET /api/meals/data`, carried on the wall's heartbeat
 * (`readDisplayRevisions`) and on every answer, worked out from a `stat` of
 * `meals.json`, the running build and the Mealie plan's save counter. A meal
 * saved, planned, hearted or ticked from a phone reaches the wall within a
 * beat or two instead of on the meal modules' minute poll, which stays for
 * what the hub cannot see (a change in Mealie's own pages, the time format).
 */
export function mealsRevision(): Promise<string> {
  return fileEtag([MEALS_FILE], String(mealiePlanRevision.current()));
}
