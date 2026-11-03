// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ChoreDefinition } from '@/types/config';
import { DEFAULT_CHORE_SETTINGS } from '@/lib/chore-bonus';
import type { ChoreSnapshot } from '@/lib/chore-client';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

import { CHORE_SAVE_RETRY_MS, useChoreAutosave, type ChoreAutosaveSurface } from '../useChoreAutosave';

const chore = (id: string): ChoreDefinition => ({
  id, name: id, emoji: '🧹', timeOfDay: 'anytime', frequency: 'daily', points: 1, assignedTo: ['kid'],
} as unknown as ChoreDefinition);

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const WORDS = { refused: 'Could not save.', unreachable: 'The hub is out of reach.' };

/** Every PUT's body, and a hub whose answers are scripted per call. */
let puts: Array<{ chores: ChoreDefinition[]; force: boolean; revision: string | null }>;
let answers: Array<() => Response>;
let surface: { [K in keyof ChoreAutosaveSurface]: ReturnType<typeof vi.fn<ChoreAutosaveSurface[K]>> };

const snapshot = (chores: ChoreDefinition[], revision: string): ChoreSnapshot => ({ chores, settings: DEFAULT_CHORE_SETTINGS, revision });

beforeEach(() => {
  vi.useFakeTimers();
  puts = [];
  answers = [];
  surface = { show: vi.fn<ChoreAutosaveSurface['show']>(), conflict: vi.fn<ChoreAutosaveSurface['conflict']>(), saved: vi.fn<ChoreAutosaveSurface['saved']>(), failed: vi.fn<ChoreAutosaveSurface['failed']>() };
  state.request.mockReset();
  state.request.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method !== 'PUT') return Promise.resolve(reply(404, {}));
    const body = JSON.parse(init.body as string);
    puts.push(body);
    const answer = answers.shift();
    if (!answer) return Promise.resolve(reply(200, snapshot(body.chores, `r${puts.length}`)));
    return Promise.resolve(answer());
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

/** Let the debounce window pass and the request be answered. */
async function debounce() {
  await act(async () => { vi.advanceTimersByTime(500); });
  await settle();
}

function mount(initial: ChoreSnapshot) {
  return renderHook(
    ({ chores }: { chores: ChoreDefinition[] }) => useChoreAutosave(chores, surface, { initial, words: WORDS }),
    { initialProps: { chores: initial.chores } },
  );
}

describe('useChoreAutosave', () => {
  it('sends a failed save again until it lands, and tells the surface each way', async () => {
    const initial = snapshot([chore('dishes')], 'r0');
    const { result, rerender } = mount(initial);
    const edited = [chore('dishes'), chore('bins')];

    // A refusal shows the hub's own sentence; a reply with none shows this surface's words.
    answers.push(() => reply(500, { error: 'The disk is full.' }));
    rerender({ chores: edited });
    await debounce();
    expect(puts).toHaveLength(1);
    expect(surface.failed).toHaveBeenCalledWith('The disk is full.');
    expect(result.current.unsaved).toBe(true);
    expect(result.current.clean()).toBe(false);

    // Still refused: the retry timer keeps trying.
    answers.push(() => reply(500, {}));
    await act(async () => { vi.advanceTimersByTime(CHORE_SAVE_RETRY_MS); });
    await debounce();
    expect(puts).toHaveLength(2);
    expect(surface.failed).toHaveBeenLastCalledWith('Could not save.');
    expect(surface.saved).not.toHaveBeenCalled();

    // Back on the network: sent at once, and this time it lands.
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await debounce();
    expect(puts).toHaveLength(3);
    expect(puts[2].chores.map((c) => c.id)).toEqual(['dishes', 'bins']);
    expect(surface.saved).toHaveBeenCalledTimes(1);
    expect(result.current.unsaved).toBe(false);
    expect(result.current.clean()).toBe(true);

    // Landed: the timer sends nothing more.
    await act(async () => { vi.advanceTimersByTime(CHORE_SAVE_RETRY_MS * 2); });
    await debounce();
    expect(puts).toHaveLength(3);
  });

  it('never sends an adopted list back, and forces only an empty list that was edited to empty', async () => {
    const initial = snapshot([chore('dishes')], 'r0');
    const { result, rerender } = mount(initial);

    // A reload's copy (an empty one, even) is already saved.
    const reloaded = snapshot([], 'r5');
    act(() => result.current.adopt(reloaded));
    rerender({ chores: reloaded.chores });
    await debounce();
    expect(puts).toHaveLength(0);
    expect(surface.show).toHaveBeenCalledWith(reloaded);
    expect(result.current.session.currentRevision).toBe('r5');

    // Deleting the last chore is deliberate: sent past the hub's empty-list guard.
    rerender({ chores: [chore('bins')] });
    await debounce();
    rerender({ chores: [] });
    await debounce();
    expect(puts.map((p) => [p.chores.length, p.force, p.revision])).toEqual([[1, false, 'r5'], [0, true, 'r1']]);
  });

  it('shows the other surface\'s copy after a conflict instead of saving over it', async () => {
    const initial = snapshot([chore('dishes')], 'r0');
    const { result, rerender } = mount(initial);
    const theirs = [chore('dishes'), chore('laundry')];

    answers.push(() => reply(409, { reason: 'revision', ...snapshot(theirs, 'r9') }));
    rerender({ chores: [chore('dishes'), chore('bins')] });
    await debounce();
    expect(surface.conflict).toHaveBeenCalledTimes(1);
    expect(surface.show).toHaveBeenCalledWith(expect.objectContaining({ revision: 'r9' }));
    expect(surface.failed).not.toHaveBeenCalled();
    expect(result.current.unsaved).toBe(false);

    // Nothing is sent again on its own.
    await act(async () => { vi.advanceTimersByTime(CHORE_SAVE_RETRY_MS * 2); });
    await debounce();
    expect(puts).toHaveLength(1);
  });
});
