// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import type { ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsAutosave } from '../useSettingsAutosave';

function makeConfig(rotationIntervalMs = 30_000): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs,
      displayWidth: 1080,
      displayHeight: 1920,
      displayTransform: '90',
      latitude: 0,
      longitude: 0,
      weather: { provider: 'open-meteo', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    },
    screens: [{ id: 's', name: 'S', backgroundImage: '', modules: [] }],
  } as unknown as ScreenConfiguration;
}

function mount() {
  return renderHook(() => {
    const settings = useEditorStore((s) => s.config?.settings);
    const updateSettings = useEditorStore((s) => s.updateSettings);
    const saveConfig = useEditorStore((s) => s.saveConfig);
    const storeIsSaving = useEditorStore((s) => s.isSaving);
    const storeSaveError = useEditorStore((s) => s.saveError);
    return useSettingsAutosave({ settings, updateSettings, saveConfig, storeIsSaving, storeSaveError });
  });
}

describe('useSettingsAutosave', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    useEditorStore.setState({
      config: makeConfig(), isDirty: false, isSaving: false, saveError: null,
      saveConflict: null, configGeneration: 0, configRevision: 'rev-1',
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('re-hydrates the form when the whole config is replaced, dropping unsaved edits', () => {
    const { result } = mount();
    expect(result.current.state.display.rotationInterval).toBe(30);
    act(() => { result.current.updateGroup('display', { rotationInterval: 60 }); });
    expect(result.current.state.display.rotationInterval).toBe(60);

    // "Load their changes" / a reload: new config object, generation bumped.
    act(() => {
      useEditorStore.setState({ config: makeConfig(45_000), configGeneration: 1 });
    });
    expect(result.current.state.display.rotationInterval).toBe(45);

    // The hydration itself must not write back: no save fires.
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not re-hydrate on an ordinary settings mutation (a profile switch)', () => {
    const { result } = mount();
    act(() => { result.current.updateGroup('display', { rotationInterval: 60 }); });
    act(() => { useEditorStore.getState().updateSettings({ activeProfile: 'night' }); });
    expect(result.current.state.display.rotationInterval).toBe(60);
  });

  it('holds its auto-save while a save conflict waits on the user', () => {
    const { result } = mount();
    act(() => {
      useEditorStore.setState({ saveConflict: { theirs: makeConfig(), revision: 'rev-9' } });
    });
    act(() => { result.current.updateGroup('display', { rotationInterval: 60 }); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
