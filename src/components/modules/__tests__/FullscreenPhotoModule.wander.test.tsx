// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type FullscreenPhotoConfig, type ModuleStyle } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { BurnInProtectionProvider } from '@/components/display/burn-in-context';
import { WANDER_REACH_X_PX, WANDER_REACH_Y_PX, pixelShiftMinute, wanderOffset } from '@/lib/pixel-shift';

/**
 * The overlay clock answers the display's burn-in protection by drifting
 * inside its band, a pixel a minute on the minute boundary, and holds still
 * without it. jsdom lays nothing out, so the band and the text never
 * measure and the full horizontal reach is assumed, as on the server
 * render. Same mocks as the mixed test.
 */

vi.mock('@/hooks/useFetchData', () => ({ useFetchData: () => [null, null] }));
vi.mock('@/components/display/useAuthImage', () => ({
  useAuthImage: (src?: string) => src,
  useAuthImageState: (src?: string) => ({ url: src, status: src ? 'ready' : 'idle' }),
}));

import FullscreenPhotoModule from '../fullscreen-photo/FullscreenPhotoModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };
const TINY = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const config: FullscreenPhotoConfig = {
  photoSource: { kind: 'library', folder: '' }, file: TINY, intervalMs: 10_000, transition: 'fade', objectFit: 'cover',
  shuffle: false, showClock: true, kenBurns: false,
};

function renderClock(protect: boolean) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <BurnInProtectionProvider value={protect}>{children}</BurnInProtectionProvider>
    </I18nProvider>
  );
  return render(<FullscreenPhotoModule config={config} style={style} screenId="s1" moduleId="m1" timezone="UTC" />, { wrapper: Wrapper });
}

const textBlock = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="fullscreen-photo-clock-text"]')!;
const band = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="fullscreen-photo-clock"]')!;

describe('FullscreenPhotoModule clock wander', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('holds still with no protection', () => {
    const { container } = renderClock(false);
    expect(textBlock(container).style.transform).toBe('');
    expect(band(container).style.paddingBottom).toBe('');
  });

  it('drifts inside the band, a pixel a minute on the boundary, with room below', () => {
    const start = Date.parse('2026-11-05T15:30:20Z');
    vi.setSystemTime(start);
    const { container } = renderClock(true);
    act(() => { vi.advanceTimersByTime(0); });
    const at = (minute: number) => {
      const { x, y } = wanderOffset(minute, WANDER_REACH_X_PX, WANDER_REACH_Y_PX);
      return `translate(${x}px, ${y}px)`;
    };
    const m0 = pixelShiftMinute(start);
    expect(textBlock(container).style.transform).toBe(at(m0));
    expect(band(container).style.paddingBottom).toBe(`${40 + WANDER_REACH_Y_PX}px`);
    expect(textBlock(container).style.transition).toBe('');

    act(() => { vi.advanceTimersByTime(39_000); });
    expect(textBlock(container).style.transform).toBe(at(m0));
    act(() => { vi.advanceTimersByTime(1_100); });
    expect(textBlock(container).style.transform).toBe(at(m0 + 1));
    expect(at(m0 + 1)).not.toBe(at(m0));
  });
});
