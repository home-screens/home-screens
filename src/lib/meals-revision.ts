import { createHash } from 'crypto';
import { readBuildId } from './build-id';
import { fileSignature } from './file-signature';
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
export async function mealsRevision(): Promise<string> {
  const [build, file] = await Promise.all([readBuildId(), fileSignature(MEALS_FILE)]);
  const hash = createHash('sha256').update([build, file, mealiePlanRevision.current()].join('|')).digest('hex').slice(0, 24);
  return `"${hash}"`;
}
