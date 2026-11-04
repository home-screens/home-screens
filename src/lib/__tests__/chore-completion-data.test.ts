import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { readCompletions, updateCompletionsAtomic } from '../chore-completion-data';
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
    await updateCompletionsAtomic(() => ({ completions: [completion('dishes')] }));
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
    await updateCompletionsAtomic(() => ({ completions: [completion('first')] }));
    await updateCompletionsAtomic(() => ({ completions: [completion('second')] }));

    const bak = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'data', 'chore-completions.json.bak'), 'utf-8'),
    );
    expect(bak.completions.map((c: ChoreCompletion) => c.choreId)).toEqual(['first']);
  });
});

describe('validateCompletionsData', () => {
  it('accepts the lists the toggle route writes', async () => {
    const { validateCompletionsData } = await import('../chore-completion-data');
    expect(validateCompletionsData({ completions: [completion('dishes')] })).toBeNull();
    expect(validateCompletionsData({
      completions: [{ ...completion('dishes'), status: 'skipped', at: '2026-07-06T08:00:00.000Z' }],
      grabs: [completion('bins')],
      bonusResets: { bins: '2026-07-01T08:00:00.000Z' },
    })).toBeNull();
  });

  it.each([
    ['no completions list', { grabs: [] }, 'Chore history needs a list of what was done.'],
    ['a completion without a day', { completions: [{ choreId: 'dishes', memberId: 'kid-1' }] }, 'Each chore in the history needs the chore, the person and the day.'],
    ['a grab without a person', { completions: [], grabs: [{ choreId: 'bins', date: '2026-07-06' }] }, 'Each grabbed chore needs the chore, the person and the day.'],
    ['a put-back without a time', { completions: [], bonusResets: { bins: 4 } }, 'Each put-back needs the chore and the time it was put back.'],
  ])('refuses %s', async (_name, raw, message) => {
    const { validateCompletionsData } = await import('../chore-completion-data');
    expect(validateCompletionsData(raw)).toBe(message);
  });
});
