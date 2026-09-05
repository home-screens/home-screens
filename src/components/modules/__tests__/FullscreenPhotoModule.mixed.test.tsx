// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type FullscreenPhotoConfig, type MediaListItem, type ModuleStyle } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

let mockData: string[] | MediaListItem[] | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [mockData, null],
}));

// Bypass the blob-fetch: return API srcs verbatim so <img> carries them.
vi.mock('@/components/display/useAuthImage', () => ({
  useAuthImage: (src?: string) => src,
  useAuthImageState: (src?: string) => ({ url: src, status: src ? 'ready' : 'idle' }),
}));

import FullscreenPhotoModule from '../fullscreen-photo/FullscreenPhotoModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function makeConfig(overrides: Partial<FullscreenPhotoConfig> = {}): FullscreenPhotoConfig {
  return {
    directory: '', intervalMs: 10_000, transition: 'fade', objectFit: 'cover',
    shuffle: false, showClock: false, kenBurns: false, ...overrides,
  };
}

function renderFullscreen(config: FullscreenPhotoConfig) {
  return render(
    <FullscreenPhotoModule config={config} style={style} screenId="s1" moduleId="m1" />,
    { wrapper: Wrapper },
  );
}

/** The layer currently on top (zIndex 1), after every image reports loaded
 *  (jsdom never fires `load` itself; the crossfade waits for it). */
function activeElement(container: HTMLElement): Element | null {
  for (const img of container.querySelectorAll('img')) fireEvent.load(img);
  return [...container.querySelectorAll('img, video')].find(
    (el) => (el as HTMLElement).style.zIndex === '1',
  ) ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockData = null;
});

describe('FullscreenPhotoModule mixed media', () => {
  const MIXED: MediaListItem[] = [
    { url: '/api/immich/video?assetId=v1&mt=t', type: 'video', posterUrl: '/api/immich/serve?assetId=v1' },
    { url: '/api/immich/serve?assetId=p1', type: 'image' },
  ];

  it('renders a video slide first and advances to the photo on ended', () => {
    mockData = MIXED;
    const { container } = renderFullscreen(makeConfig({ mediaTypes: 'both' }));

    const video = activeElement(container);
    expect(video?.tagName).toBe('VIDEO');
    expect(video?.getAttribute('src')).toContain('assetId=v1');

    fireEvent(video!, new Event('ended'));

    const img = activeElement(container);
    expect(img?.tagName).toBe('IMG');
    expect(img?.getAttribute('src')).toContain('assetId=p1');
  });

  it('advances photo slides on the interval timer, wrapping back to the video', () => {
    mockData = MIXED;
    const { container } = renderFullscreen(makeConfig({ mediaTypes: 'both' }));

    fireEvent(activeElement(container)!, new Event('ended')); // video → photo
    act(() => vi.advanceTimersByTime(10_001)); // photo timer → wraps to video

    expect(activeElement(container)?.tagName).toBe('VIDEO');
  });

  it('force-advances a stalled video via the max-duration cap', () => {
    mockData = MIXED;
    const { container } = renderFullscreen(makeConfig({ mediaTypes: 'both', maxVideoDurationMs: 5000 }));

    expect(activeElement(container)?.tagName).toBe('VIDEO');
    act(() => vi.advanceTimersByTime(5001));
    expect(activeElement(container)?.tagName).toBe('IMG');
  });

  it('suppresses the transition and Ken Burns when a video is adjacent', () => {
    mockData = MIXED;
    const { container } = renderFullscreen(
      makeConfig({ mediaTypes: 'both', transition: 'fade', kenBurns: true }),
    );

    fireEvent(activeElement(container)!, new Event('ended'));
    const img = activeElement(container) as HTMLElement;
    expect(img.style.transition).toBe(''); // hard cut, no fade
    expect(img.style.animation).toBe(''); // Ken Burns pan/zoom disabled
  });

  it('keeps the transition and Ken Burns on all-photo lists', () => {
    mockData = ['/api/backgrounds/serve?file=a.jpg', '/api/backgrounds/serve?file=b.jpg'];
    const { container } = renderFullscreen(makeConfig({ kenBurns: true }));

    const img = activeElement(container) as HTMLElement;
    expect(img.tagName).toBe('IMG');
    expect(img.style.transition).toContain('opacity'); // fade preserved
    expect(img.style.animation).toContain('kb-'); // Ken Burns active
    act(() => vi.advanceTimersByTime(10_001));
    expect(activeElement(container)?.getAttribute('src')).toContain('b.jpg');
  });
});
