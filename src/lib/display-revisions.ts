import type { DisplayRevisions } from './display-heartbeat';
import { readBuildId } from './build-id';
import { readConfigCached } from './config-cache';
import { getInstalledRevision } from './plugins';
import { readSessionRevision } from './timer-data';
import { wallConfigEtag } from './wall-config';
import { choresEtag, rewardsEtag } from './chore-revisions';
import { householdToday } from './household-day';

async function orUndefined(read: () => Promise<string>): Promise<string | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

/**
 * What the heartbeat tells a wall about everything besides its commands.
 * Every value comes from a cached read, so a beat costs a few `stat`s.
 *
 * Each value is worked out on its own: an unreadable config.json must not
 * cost a wall its commands or its timer, so a failure only leaves that one
 * field out, and the wall keeps what it has for it.
 */
export async function readDisplayRevisions(): Promise<DisplayRevisions> {
  // Never throws: an unreadable config falls back to the hub's own zone.
  const today = await householdToday();
  const [buildId, plugins, config, timer, chores, rewards] = await Promise.all([
    orUndefined(readBuildId),
    orUndefined(getInstalledRevision),
    orUndefined(async () => wallConfigEtag(await readConfigCached())),
    orUndefined(readSessionRevision),
    orUndefined(() => choresEtag(today)),
    orUndefined(() => rewardsEtag(today)),
  ]);
  return { buildId, plugins, config, timer, chores, rewards };
}
