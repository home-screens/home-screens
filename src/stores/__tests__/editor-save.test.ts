import { describe, it, expect } from 'vitest';
import type { ScreenConfiguration } from '@/types/config';
import {
  applyMutation,
  appendHistoryEntry,
  MAX_HISTORY,
  COALESCE_WINDOW_MS,
  COALESCE_KEYS,
  type HistoryEntry,
  type MutationBaseState,
} from '@/stores/editor-save';

/**
 * Direct unit tests for the history bookkeeping that used to live inside
 * the store factory's `mutateConfig` closure, where coalescing and stack
 * trimming were only reachable through full store interactions. `now` is
 * injected so window arithmetic is deterministic.
 */

function makeConfig(name = 'Screen 1'): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    },
    screens: [{ id: 'screen-1', name, backgroundImage: '', modules: [] }],
  };
}

function makeState(overrides?: Partial<MutationBaseState>): MutationBaseState {
  return {
    config: makeConfig(),
    selectedDisplayId: null,
    selectedScreenId: 'screen-1',
    selectedModuleId: null,
    _past: [],
    _future: [],
    _lastHistoryTime: 0,
    _lastHistoryActionKey: '',
    ...overrides,
  };
}

const rename = (name: string) => (config: ScreenConfiguration) => ({
  config: { ...config, screens: [{ ...config.screens[0], name }] },
});

describe('applyMutation', () => {
  it('returns null when there is no config to mutate', () => {
    expect(applyMutation(makeState({ config: null }), rename('x'))).toBeNull();
  });

  it('returns null on an empty partial — no dirty flag, no undo slot, no redo wipe', () => {
    // e.g. updateDisplaySettings against a display id that no longer exists.
    // Before the fix this marked the config dirty (triggering a save PUT),
    // burned an undo slot, and destroyed any pending redo.
    const staleFuture: HistoryEntry[] = [{
      config: makeConfig('redo target'),
      selectedDisplayId: null,
      selectedScreenId: null,
      selectedModuleId: null,
    }];
    const state = makeState({ _future: staleFuture });
    expect(applyMutation(state, () => ({}))).toBeNull();
    // The caller skips dispatch entirely, so the untouched state keeps its
    // redo stack — assert the input was not mutated either.
    expect(state._future).toBe(staleFuture);
    expect(state._past).toHaveLength(0);
  });

  it('pushes a history snapshot, marks dirty, and clears the redo stack', () => {
    const staleFuture: HistoryEntry[] = [
      { config: makeConfig('future'), selectedDisplayId: null, selectedScreenId: null, selectedModuleId: null },
    ];
    const result = applyMutation(makeState({ _future: staleFuture }), rename('renamed'), undefined, 1000)!;
    expect(result.config.screens[0].name).toBe('renamed');
    expect(result.isDirty).toBe(true);
    expect(result.saveError).toBeNull();
    expect(result._past).toHaveLength(1);
    expect(result._past[0].config.screens[0].name).toBe('Screen 1');
    expect(result._future).toEqual([]);
    expect(result._lastHistoryTime).toBe(1000);
    expect(result._lastHistoryActionKey).toBe('');
  });

  it('snapshots by deep copy so later mutation of the live config cannot corrupt history', () => {
    const state = makeState();
    const result = applyMutation(state, rename('renamed'), undefined, 1000)!;
    state.config!.screens[0].name = 'mutated-in-place';
    expect(result._past[0].config.screens[0].name).toBe('Screen 1');
  });

  it('coalesces a same-key mutation inside the window into the existing history entry', () => {
    const first = applyMutation(makeState(), rename('a'), { coalesce: 'k' }, 1000)!;
    const second = applyMutation(
      makeState({ ...first, config: first.config }),
      rename('b'),
      { coalesce: 'k' },
      1000 + COALESCE_WINDOW_MS - 1,
    )!;
    // Same stack, not a new entry: undo jumps back over both edits at once.
    expect(second._past).toBe(first._past);
    expect(second.config.screens[0].name).toBe('b');
  });

  it('does not coalesce once the window has elapsed', () => {
    const first = applyMutation(makeState(), rename('a'), { coalesce: 'k' }, 1000)!;
    const second = applyMutation(
      makeState({ ...first, config: first.config }),
      rename('b'),
      { coalesce: 'k' },
      1000 + COALESCE_WINDOW_MS,
    )!;
    expect(second._past).toHaveLength(2);
  });

  it('does not coalesce across different keys', () => {
    const first = applyMutation(makeState(), rename('a'), { coalesce: 'k1' }, 1000)!;
    const second = applyMutation(
      makeState({ ...first, config: first.config }),
      rename('b'),
      { coalesce: 'k2' },
      1001,
    )!;
    expect(second._past).toHaveLength(2);
  });

  it('never coalesces keyless mutations, even in rapid succession', () => {
    const first = applyMutation(makeState(), rename('a'), undefined, 1000)!;
    const second = applyMutation(
      makeState({ ...first, config: first.config }),
      rename('b'),
      undefined,
      1001,
    )!;
    expect(second._past).toHaveLength(2);
  });

  it('does not coalesce into an empty past stack', () => {
    // A matching key and timestamp but no history (e.g. right after load)
    // must still create the first entry.
    const result = applyMutation(
      makeState({ _lastHistoryActionKey: 'k', _lastHistoryTime: 999 }),
      rename('a'),
      { coalesce: 'k' },
      1000,
    )!;
    expect(result._past).toHaveLength(1);
  });

  it('trims the past stack to MAX_HISTORY from the head', () => {
    const full: HistoryEntry[] = Array.from({ length: MAX_HISTORY }, (_, i) => ({
      config: makeConfig(`old-${i}`),
      selectedDisplayId: null,
      selectedScreenId: null,
      selectedModuleId: null,
    }));
    const result = applyMutation(makeState({ _past: full }), rename('new'), undefined, 1000)!;
    expect(result._past).toHaveLength(MAX_HISTORY);
    // Oldest entry dropped; the fresh snapshot is at the tail.
    expect(result._past[0].config.screens[0].name).toBe('old-1');
    expect(result._past[MAX_HISTORY - 1].config.screens[0].name).toBe('Screen 1');
  });
});

describe('appendHistoryEntry', () => {
  it('appends without trimming below the cap', () => {
    const state = makeState() as MutationBaseState & { config: ScreenConfiguration };
    const next = appendHistoryEntry([], state);
    expect(next).toHaveLength(1);
  });

  it('drops from the head once the cap is exceeded', () => {
    const full: HistoryEntry[] = Array.from({ length: MAX_HISTORY }, (_, i) => ({
      config: makeConfig(`old-${i}`),
      selectedDisplayId: null,
      selectedScreenId: null,
      selectedModuleId: null,
    }));
    const state = makeState() as MutationBaseState & { config: ScreenConfiguration };
    const next = appendHistoryEntry(full, state);
    expect(next).toHaveLength(MAX_HISTORY);
    expect(next[0].config.screens[0].name).toBe('old-1');
  });
});

describe('COALESCE_KEYS', () => {
  it('produces distinct keys per entity so edits to different items never merge', () => {
    expect(COALESCE_KEYS.updateModule('m1')).not.toBe(COALESCE_KEYS.updateModule('m2'));
    expect(COALESCE_KEYS.updateModule('m1')).not.toBe(COALESCE_KEYS.moduleStyle('m1'));
  });
});
