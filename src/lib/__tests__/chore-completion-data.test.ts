import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  readCompletions,
  writeCompletions,
  updateCompletionsAtomic,
} from '../chore-completion-data';
import type { ChoreCompletion } from '@/types/config';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

function completion(choreId: string): ChoreCompletion {
  return { choreId, memberId: 'kid-1', date: '2026-07-06' };
}

describe('chore-completion-data', () => {
  it('reads back what it writes', async () => {
    await writeCompletions({ completions: [completion('dishes')] });
    const data = await readCompletions();
    expect(data.completions).toHaveLength(1);
    expect(data.completions[0].choreId).toBe('dishes');
  });

  it('returns the empty default when the file does not exist', async () => {
    const data = await readCompletions();
    expect(data.completions).toEqual([]);
  });

  it('keeps a .bak of the previous contents on every write (torn-write rollback)', async () => {
    // This store must match its kid-data siblings (chore-data, reward-data,
    // todo-data, meal-data): completions feed points/rewards, so a torn
    // write needs a single-level rollback file.
    await writeCompletions({ completions: [completion('first')] });
    await writeCompletions({ completions: [completion('second')] });

    const bak = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'data', 'chore-completions.json.bak'), 'utf-8'),
    );
    expect(bak.completions.map((c: ChoreCompletion) => c.choreId)).toEqual(['first']);
  });

  it('a restore-style write racing an atomic toggle serializes — no lost updates', async () => {
    // Regression test for the backup-route bypass: the old restore path did a
    // raw tmp+rename write with its own fs helpers, so it could land in the
    // middle of the chores route's read-modify-write cycle and either be
    // clobbered by the toggle's stale snapshot or clobber the toggle. Both
    // paths now share one store, so the queue must serialize them.
    await writeCompletions({ completions: [] });

    // Toggle enqueued first — its mutator pauses mid-cycle to widen the
    // window the raw restore write used to slip into.
    const toggle = updateCompletionsAtomic(async (data) => {
      await new Promise((r) => setTimeout(r, 20));
      return { completions: [...data.completions, completion('dishes')] };
    });
    // Restore enqueued second, fired while the toggle is mid-mutation.
    const restore = writeCompletions({ completions: [completion('restored')] });

    const toggleResult = await toggle;
    await restore;

    // The toggle observed pre-restore state and committed before the restore.
    expect(toggleResult.completions.map((c) => c.choreId)).toEqual(['dishes']);

    // FIFO queue order: restore was enqueued after the toggle, so the final
    // on-disk state is exactly the restored bundle — not a torn mix, and the
    // restore was not overwritten by the toggle's in-flight snapshot.
    const final = await readCompletions();
    expect(final.completions.map((c) => c.choreId)).toEqual(['restored']);
  });

  it('an atomic toggle enqueued after a restore sees the restored data', async () => {
    await writeCompletions({ completions: [completion('old')] });

    const restore = writeCompletions({ completions: [completion('restored')] });
    const toggle = updateCompletionsAtomic((data) => ({
      completions: [...data.completions, completion('dishes')],
    }));

    await restore;
    const result = await toggle;

    // The toggle's read went through the queue, so it built on the restored
    // state, not the pre-restore file contents.
    expect(result.completions.map((c) => c.choreId)).toEqual(['restored', 'dishes']);
  });
});
