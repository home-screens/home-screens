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

const OFFLINE: DisplaySharedState = { entries: {}, reportedAt: null, states: null };

function freshDisplay(entries: Record<string, SharedStateEntry>): DisplaySharedState {
  return { entries, reportedAt: Date.now(), states: new Map(Object.entries(entries)) };
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

  it('filters tombstoned entries from the local view, matching display heartbeats', () => {
    const { result } = renderHook(() => useEditorSharedState('main'));
    act(() => {
      sharedStateStore.publish('plugin:ha:alive', 'yes');
      sharedStateStore.publish('plugin:ha:cleared', 'gone');
      sharedStateStore.clearKey('plugin:ha:cleared');
    });
    expect(result.current.source).toBe('editor');
    expect(result.current.states?.has('plugin:ha:alive')).toBe(true);
    expect(result.current.states?.has('plugin:ha:cleared')).toBe(false);
  });

  it('treats a fully tombstoned bus as no source at all', () => {
    const { result } = renderHook(() => useEditorSharedState('main'));
    act(() => {
      sharedStateStore.publish('plugin:ha:cleared', 'gone');
      sharedStateStore.clearKey('plugin:ha:cleared');
    });
    expect(result.current.source).toBeNull();
    expect(result.current.states).toBeNull();
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
