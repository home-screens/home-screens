import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import type { CalendarScale } from '@/components/modules/fullscreen-calendar/view-support';

/**
 * Shared jsdom harness for the module render tests: the ResizeObserver
 * stub, the en-US i18n wrapper, and the standard fullscreen scale.
 */

// jsdom doesn't ship ResizeObserver; the scaled-font / container-measure
// hooks need one at render time.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

export function installResizeObserverStub(): void {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

/** en-US provider with the modules + core dictionaries the calendar surfaces read. */
export function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

/** Portrait 1080×1920 CalendarScale the fullscreen view tests render at. */
export function testScale(over: Partial<CalendarScale> = {}): CalendarScale {
  return {
    bu: 10, width: 1080, height: 1920, orientation: 'portrait',
    densityMul: 1, typoMul: 1, isDark: true, eventStyle: 'wash',
    ...over,
  };
}
