// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import { getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSModules from '@/translations/en-US/modules.json';
import EditorCanvas from '../EditorCanvas';

// jsdom doesn't ship ResizeObserver; the canvas fit-to-scale hook needs it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // The canvas previews never need real data; a never-resolving fetch keeps
  // the preview hooks idle without rejection noise.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// jsdom lays out nothing — clientWidth/clientHeight are 0, which drives the
// fit-to-container base scale negative. Report a viewport the 1080x1920
// canvas fits into at scale 1, so drag deltas map 1:1 to module pixels.
const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 2000 });
});
afterAll(() => {
  if (originalClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth);
  if (originalClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', originalClientHeight);
});

const MODULE_ID = 'text-1';

function makeConfig(): ScreenConfiguration {
  const mod: ModuleInstance = {
    id: MODULE_ID,
    type: 'text',
    position: { x: 100, y: 100 },
    size: { w: 400, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { ...getModuleDefinition('text')!.defaultConfig, content: 'RESIZE ME' },
  };
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
    screens: [
      {
        id: 'screen-1',
        name: 'Screen 1',
        backgroundImage: '',
        modules: [mod],
      },
    ],
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, modules: enUSModules }}>
      <DndContext>{children}</DndContext>
    </I18nProvider>
  );
}

/** Renders the canvas with the module already selected. */
function renderWithSelection() {
  useEditorStore.setState({
    config: makeConfig(),
    selectedDisplayId: null,
    selectedScreenId: 'screen-1',
    selectedModuleId: MODULE_ID,
    isDirty: false,
    _past: [],
    _future: [],
  });
  return render(
    <Wrapper>
      <EditorCanvas />
    </Wrapper>,
  );
}

function moduleSize(): { w: number; h: number } {
  const config = useEditorStore.getState().config!;
  return config.screens[0].modules[0].size;
}

/**
 * Drags the resize handle by (+80, +60) canvas pixels — both grid-aligned —
 * and releases. `trailing` dispatches the click the browser produces when
 * the gesture ends, on the target the browser would pick for it.
 *
 * The fit-to-container scale in jsdom is whatever the stubbed viewport
 * yields (and the canvas normalizes 1080x1920 to its long/short axes), so
 * the screen-space drag delta is derived from the rendered module wrapper —
 * its style width is exactly `size.w * effectiveScale`.
 */
function dragResizeHandle(
  screen: ReturnType<typeof render>,
  trailing: 'canvas' | 'handle' | 'none',
) {
  const wrapper = screen.container.querySelector('[data-module-id]') as HTMLElement;
  const scale = parseFloat(wrapper.style.width) / 400;
  const handle = screen.container.querySelector('[data-testid="selection-overlay"] .cursor-se-resize') as HTMLElement;
  fireEvent.mouseDown(handle, { clientX: 500, clientY: 300 });
  fireEvent.mouseMove(window, { clientX: 500 + 80 * scale, clientY: 300 + 60 * scale });
  fireEvent.mouseUp(window);
  if (trailing === 'canvas') {
    // Released away from the handle: the click fires on the nearest common
    // ancestor of the mousedown and mouseup targets — the canvas div.
    fireEvent.click(screen.getByTestId('editor-canvas'));
  } else if (trailing === 'handle') {
    // Released over the handle: the click targets the handle and bubbles.
    fireEvent.click(handle);
  }
}

beforeEach(() => {
  useEditorStore.setState({ snapEnabled: true });
});
afterEach(cleanup);

describe('EditorCanvas resize selection', () => {
  it('applies the resize and keeps the module selected after the trailing canvas click', () => {
    const screen = renderWithSelection();

    dragResizeHandle(screen, 'canvas');

    expect(moduleSize()).toEqual({ w: 480, h: 260 });
    expect(useEditorStore.getState().selectedModuleId).toBe(MODULE_ID);
  });

  it('keeps the module selected when the resize ends with a click on the handle itself', () => {
    const screen = renderWithSelection();

    dragResizeHandle(screen, 'handle');

    expect(useEditorStore.getState().selectedModuleId).toBe(MODULE_ID);
  });

  it('still deselects on a plain canvas click with no resize before it', () => {
    const screen = renderWithSelection();

    fireEvent.click(screen.getByTestId('editor-canvas'));

    expect(useEditorStore.getState().selectedModuleId).toBeNull();
  });

  it('does not swallow a later canvas click when the resize ends without a trailing click', () => {
    const screen = renderWithSelection();

    dragResizeHandle(screen, 'none');
    // No trailing click materialized (e.g. release outside the window); the
    // next genuine gesture is a fresh mousedown + click on the canvas.
    fireEvent.mouseDown(screen.getByTestId('editor-canvas'), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId('editor-canvas'), { clientX: 10, clientY: 10 });

    expect(useEditorStore.getState().selectedModuleId).toBeNull();
  });
});
