import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { readCompletions, writeCompletions } from '@/lib/chore-completion-data';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { readRewardData, writeRewardData } from '@/lib/reward-data';
import { readRoutinesFile, writeRoutinesFile } from '@/lib/timer-data';
import { writeBackupState } from '@/lib/backup-state';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { validateDisplays } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

// GET — export a full backup bundle
export const GET = withAuth(async () => {
  const [config, chores, completions, meals, rewards, routines] = await Promise.all([
    readConfig(),
    readChoreData(),
    readCompletions(),
    readMealData(),
    readRewardData(),
    readRoutinesFile(),
  ]);

  const bundle = {
    _type: 'home-screens-backup',
    _version: 1,
    _createdAt: new Date().toISOString(),
    config,
    chores,
    choreCompletions: completions,
    meals,
    rewards,
    routines,
  };

  // Record backup timestamp (fire-and-forget) — write both fields directly
  // to avoid a read-modify-write race with concurrent dismiss POSTs
  writeBackupState({
    lastBackupDate: new Date().toISOString(),
    lastDismissedDate: null,
  }).catch(() => {});

  return NextResponse.json(bundle);
}, 'Failed to create backup');

// Shape + displays validation — mirror /api/config PUT so a restore can't
// persist a config that the editor would reject. Without this gate, a
// malformed bundle (missing screens, duplicate display IDs, non-URL-safe
// slugs, etc.) would be written to config.json as-is and could break
// rendering or invalidate cross-references.
function validateRestoredConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') {
    return 'Invalid config: must be an object';
  }
  const c = config as Partial<ScreenConfiguration>;
  if (!Array.isArray(c.screens) || !c.settings) {
    return 'Invalid config: must include screens array and settings';
  }
  return validateDisplays(config as ScreenConfiguration);
}

// Fields a restore bundle may carry. Each optional file mirrors the type its
// writer expects; screens/settings let the legacy config-only format be
// recognized before it is written as a full ScreenConfiguration.
interface RestoreBundle {
  _type?: unknown;
  config?: ScreenConfiguration;
  chores?: Parameters<typeof writeChoreData>[0];
  choreCompletions?: Parameters<typeof writeCompletions>[0];
  meals?: Parameters<typeof writeMealData>[0];
  rewards?: Parameters<typeof writeRewardData>[0];
  routines?: Parameters<typeof writeRoutinesFile>[0];
  screens?: unknown;
  settings?: unknown;
}

// POST — restore from a backup bundle (or a legacy config-only file).
//
// Two safety properties beyond the raw writes:
//  1. Validate any incoming config (shape + displays) BEFORE any disk write,
//     so a bad bundle can't clobber config.json past the point of no return.
//  2. Snapshot the current on-disk state of every file we're about to touch,
//     run writes sequentially, and on any failure roll back the writes that
//     already landed. Each individual write is already atomic via tmp+rename
//     (json-store), but there's no cross-file transaction — without rollback
//     a mid-bundle failure leaves mixed old/new data across config, chores,
//     meals, rewards.
// A backup bundle is pure JSON (config + chores + meals + rewards) — this app
// stores no user-uploaded media — so even a very large family's export is a
// few MB at most. Cap the restore upload well above that but firmly bounded so
// the endpoint can't be used to exhaust memory with an oversized body.
const MAX_RESTORE_BYTES = 25 * 1024 * 1024; // 25 MB

export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<RestoreBundle>(request, {
    maxBytes: MAX_RESTORE_BYTES,
  });
  if (body instanceof NextResponse) return body;

  // New bundle format
  if (body._type === 'home-screens-backup') {
    if (body.config !== undefined) {
      const err = validateRestoredConfig(body.config);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    // Snapshot current state of every file we're about to touch BEFORE any
    // write, so we can roll back to a consistent pre-restore state on failure.
    const snapshots = {
      config: body.config ? await readConfig() : null,
      chores: body.chores ? await readChoreData() : null,
      completions: body.choreCompletions ? await readCompletions() : null,
      meals: body.meals ? await readMealData() : null,
      rewards: body.rewards ? await readRewardData() : null,
      routines: body.routines ? await readRoutinesFile() : null,
    };

    // Track which writes actually landed (post-await) so rollback only
    // reverts files that were actually mutated — the failing write itself
    // either completed the rename or didn't touch the file.
    const rollbacks: Array<() => Promise<void>> = [];
    try {
      if (body.config) {
        await writeConfig(body.config);
        rollbacks.push(() => writeConfig(snapshots.config!));
      }
      if (body.chores) {
        await writeChoreData(body.chores);
        rollbacks.push(() => writeChoreData(snapshots.chores!));
      }
      if (body.choreCompletions) {
        await writeCompletions(body.choreCompletions);
        rollbacks.push(() => writeCompletions(snapshots.completions!));
      }
      if (body.meals) {
        await writeMealData(body.meals);
        rollbacks.push(() => writeMealData(snapshots.meals!));
      }
      if (body.rewards) {
        await writeRewardData(body.rewards);
        rollbacks.push(() => writeRewardData(snapshots.rewards!));
      }
      if (body.routines) {
        await writeRoutinesFile(body.routines);
        rollbacks.push(() => writeRoutinesFile(snapshots.routines!));
      }
    } catch (err) {
      // Best-effort rollback in reverse order. allSettled so one failed
      // revert doesn't block the others — surface the original error either way.
      await Promise.allSettled(rollbacks.reverse().map((fn) => fn()));
      throw err;
    }

    return NextResponse.json({
      restored: {
        config: !!body.config,
        chores: !!body.chores,
        choreCompletions: !!body.choreCompletions,
        meals: !!body.meals,
        rewards: !!body.rewards,
        routines: !!body.routines,
      },
    });
  }

  // Legacy format: raw ScreenConfiguration object
  if (body.screens && Array.isArray(body.screens) && body.settings) {
    const err = validateRestoredConfig(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    await writeConfig(body as unknown as ScreenConfiguration);
    return NextResponse.json({ restored: { config: true } });
  }

  return NextResponse.json(
    { error: 'Unrecognized backup format' },
    { status: 400 },
  );
}, 'Failed to restore backup');
