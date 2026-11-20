import { describe, expect, it, vi } from 'vitest';
import { asRoutineSnapshot, saveRoutineList } from '../timer-client';
import type { Routine } from '@/types/timers';

const routine = { id: 'r1', name: 'Morning', steps: [] } as unknown as Routine;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('asRoutineSnapshot', () => {
  it('accepts only a list with a revision to quote', () => {
    expect(asRoutineSnapshot({ routines: [routine], revision: 'a' })).toEqual({ routines: [routine], revision: 'a' });
    expect(asRoutineSnapshot({ routines: [routine] })).toBeNull();
    expect(asRoutineSnapshot({ revision: 'a' })).toBeNull();
    expect(asRoutineSnapshot(null)).toBeNull();
  });
});

describe('saveRoutineList', () => {
  it('quotes the revision and hands back the saved list', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { routines: [routine], revision: 'b' }));
    expect(await saveRoutineList(fetcher, [routine], 'a', 'Not saved')).toEqual({ kind: 'saved', snapshot: { routines: [routine], revision: 'b' } });
    expect(fetcher.mock.calls[0][0]).toBe('/api/timers/routines');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ routines: [routine], revision: 'a' });
  });

  it('reports a list another phone saved first as a conflict carrying it', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(409, { error: 'Changed', code: 'timers.revision', reason: 'revision', routines: [], revision: 'z' }));
    expect(await saveRoutineList(fetcher, [routine], 'a', 'Not saved')).toEqual({ kind: 'conflict', snapshot: { routines: [], revision: 'z' } });
  });

  it('rejects a refusal with its code, so the tab can say it in the family\'s language', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(400, { error: 'too many routines (max 50)', code: 'timers.invalid' }));
    await expect(saveRoutineList(fetcher, [routine], 'a', 'Not saved')).rejects.toMatchObject({ code: 'timers.invalid' });
  });
});
