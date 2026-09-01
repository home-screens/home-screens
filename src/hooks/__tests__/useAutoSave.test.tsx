// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import type { ScreenConfiguration, ModuleInstance } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useAutoSave } from '../useAutoSave';

function makeConfig(): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
    },
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [] }],
  } as unknown as ScreenConfiguration;
}

function invalidModule(): ModuleInstance {
  return {
    id: 'mod-1',
    type: 'clock',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: {} as ModuleInstance['style'],
    // A committed typo (bad charset) — empty keys are legal "incomplete"
    // conditions now, so this is the state the validity gate still guards.
    visibility: { conditions: [{ kind: 'state', sourceKey: 'Bad Key!', equals: '' }] },
  } as ModuleInstance;
}

describe('useAutoSave validity gate', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useEditorStore.setState({ config: null, isDirty: false, isSaving: false, saveError: null, saveConflict: null });
  });

  it('holds auto-save while a save conflict waits on the user', async () => {
    const config = makeConfig();
    useEditorStore.setState({
      config, isDirty: true, isSaving: false, saveError: null,
      saveConflict: { theirs: makeConfig(), revision: 'rev-9' },
    });
    renderHook(() => useAutoSave());

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not attempt a save while the config is transiently invalid', async () => {
    const config = makeConfig();
    config.screens[0].modules.push(invalidModule());
    useEditorStore.setState({ config, isDirty: true, isSaving: false, saveError: null });

    renderHook(() => useAutoSave());
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(fetchMock).not.toHaveBeenCalled();
    // No failed attempt means no failure state — the panel's inline error
    // is the only signal for an untouched draft condition.
    expect(useEditorStore.getState().saveError).toBeNull();
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('resumes auto-save once the condition becomes valid', async () => {
    const config = makeConfig();
    config.screens[0].modules.push(invalidModule());
    useEditorStore.setState({ config, isDirty: true, isSaving: false, saveError: null });

    renderHook(() => useAutoSave());
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      useEditorStore.getState().updateModule('screen-1', 'mod-1', {
        visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'open' }] },
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().saveError).toBeNull();
    expect(useEditorStore.getState().isDirty).toBe(false);
  });

  it('still auto-saves a valid config normally', async () => {
    useEditorStore.setState({ config: makeConfig(), isDirty: true, isSaving: false, saveError: null });

    renderHook(() => useAutoSave());
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
