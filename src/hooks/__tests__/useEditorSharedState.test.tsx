// @vitest-environment jsdom

/**
 * Tests for the editor's live shared-state source selection: a fresh display
 * snapshot wins, the editor tab's own bus is the fallback, and an empty or
 * fully tombstoned local bus never counts as a source (offline displays must
 * render neutral verdicts, not confident ones conjured from a silent bus).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { DisplaySharedState } from '@/hooks/useDisplaySharedState';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { useEditorSharedState } from '../useEditorSharedState';

// The hub-snapshot half is a poll loop over editorFetch; isolate it so each
// test dictates exactly what the display reported.
vi.mock('@/hooks/useDisplaySharedState', () => ({
  useDisplaySharedState: vi.fn(),
}));
const { useDisplaySharedState } = await import('@/hooks/useDisplaySharedState');
const mockDisplay = vi.mocked(useDisplaySharedState);

const OFFLINE: DisplaySharedState = { entries: {}, reportedAt: null, states: null, providerHealth: {} };

function freshDisplay(entries: Record<string, SharedStateEntry>): DisplaySharedState {
  return { entries, reportedAt: Date.now(), states: new Map(Object.entries(entries)), providerHealth: {} };
}

beforeEach(() => {
  sharedStateStore.__resetForTests();
  mockDisplay.mockReturnValue(OFFLINE);
});

afterEach(() => {
  cleanup();
  sharedStateStore.__resetForTests();
  vi.clearAllMocks();
});

describe('useEditorSharedState', () => {
  it('returns neutral (source null) when the display is offline and the local bus is empty', () => {
    const { result } = renderHook(() => useEditorSharedState('main'));
    expect(result.current.source).toBeNull();
    expect(result.current.states).toBeNull();
    expect(result.current.entries).toEqual({});
  });

  it('falls back to the editor bus when the display has not reported', () => {
    const { result } = renderHook(() => useEditorSharedState('main'));
    act(() => {
      sharedStateStore.publish('plugin:ha:light.tv', 'on');
    });
    expect(result.current.source).toBe('editor');
    expect(result.current.states?.get('plugin:ha:light.tv')?.value).toBe('on');
    expect(result.current.entries['plugin:ha:light.tv']?.value).toBe('on');
    expect(result.current.reportedAt).toBe(
      result.current.entries['plugin:ha:light.tv']?.updatedAt,
    );
  });

  it('prefers a fresh display snapshot over local values', () => {
    const displayEntry: SharedStateEntry = { value: 'off', updatedAt: Date.now() };
    mockDisplay.mockReturnValue(freshDisplay({ 'plugin:ha:light.tv': displayEntry }));
    const { result } = renderHook(() => useEditorSharedState('main'));
    act(() => {
      sharedStateStore.publish('plugin:ha:light.tv', 'on');
    });
    expect(result.current.source).toBe('display');
    expect(result.current.states?.get('plugin:ha:light.tv')?.value).toBe('off');
  });

  it('keeps tombstoned entries, matching how the display evaluates them', () => {
    // The display's own path (useSharedStateKeys → evaluateVisibility) still
    // sees a tombstoned key for its 15s grace window, so the editor must too.
    // Filtering them here made the editor announce "Hidden right now, waiting
    // for <key>" while the kiosk was still showing the module — a disagreement
    // that fired exactly when someone had the inspector open during a plugin
    // reload. `staleAt` is preserved so the UI can badge the value instead.
    const { result } = renderHook(() => useEditorSharedState('main'));
    act(() => {
      sharedStateStore.publish('plugin:ha:alive', 'yes');
      sharedStateStore.publish('plugin:ha:cleared', 'gone');
      sharedStateStore.clearKey('plugin:ha:cleared');
    });
    expect(result.current.source).toBe('editor');
    expect(result.current.states?.has('plugin:ha:alive')).toBe(true);
    expect(result.current.states?.has('plugin:ha:cleared')).toBe(true);
    expect(result.current.states?.get('plugin:ha:cleared')?.value).toBe('gone');
    expect(result.current.states?.get('plugin:ha:cleared')?.staleAt).toBeTypeOf('number');
    // The live key is not marked stale.
    expect(result.current.states?.get('plugin:ha:alive')?.staleAt).toBeUndefined();
  });

  it('still reports a source while the bus holds only tombstoned entries', () => {
    // Those entries are what the display is evaluating against right now, so
    // "no source at all" would be wrong for the whole grace window. Once the
    // TTL reaps them the bus is genuinely empty and the source goes null.
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useEditorSharedState('main'));
      act(() => {
        sharedStateStore.publish('plugin:ha:cleared', 'gone');
        sharedStateStore.clearKey('plugin:ha:cleared');
      });
      expect(result.current.source).toBe('editor');
      expect(result.current.states?.has('plugin:ha:cleared')).toBe(true);

      act(() => { vi.advanceTimersByTime(15_001); });
      expect(result.current.source).toBeNull();
      expect(result.current.states).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the neutral snapshot and skips the bus subscription when disabled', () => {
    const { result } = renderHook(() => useEditorSharedState('main', false));
    act(() => {
      sharedStateStore.publish('plugin:ha:light.tv', 'on');
    });
    expect(result.current.source).toBeNull();
    expect(result.current.states).toBeNull();
  });

  it('keeps result identity stable across re-renders when nothing changed', () => {
    const { result, rerender } = renderHook(() => useEditorSharedState('main'));
    act(() => {
      sharedStateStore.publish('plugin:ha:light.tv', 'on');
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
