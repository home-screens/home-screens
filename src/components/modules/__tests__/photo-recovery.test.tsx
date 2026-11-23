// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type FullscreenPhotoConfig, type MediaListItem, type PhotoSlideshowConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

// The real picture cache over a hub that drops the first request and answers
// every later one: a WiFi blip at the moment the module mounted.
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(),
  DISPLAY_FETCH_LONG_TIMEOUT_MS: 60_000,
}));

let mockData: MediaListItem[] | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [mockData, null],
}));

import { displayFetch } from '@/lib/display-fetch';
import { __resetAuthImageCacheForTests } from '@/components/display/useAuthImage';
import FullscreenPhotoModule from '../fullscreen-photo/FullscreenPhotoModule';
import PhotoSlideshowModule from '../PhotoSlideshowModule';
import ImageModule from '../ImageModule';

const mockDisplayFetch = vi.mocked(displayFetch);
const PICTURE = '/api/backgrounds/serve?file=family/beach.jpg';
const HOUR = 60 * 60_000;

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

const fullscreen = (overrides: Partial<FullscreenPhotoConfig> = {}): FullscreenPhotoConfig => ({
  photoSource: { kind: 'library', folder: '' }, intervalMs: 10_000, transition: 'fade', objectFit: 'cover',
  shuffle: false, showClock: false, kenBurns: false, ...overrides,
});
const slideshow: PhotoSlideshowConfig = {
  photoSource: { kind: 'library', folder: '' }, intervalMs: 10_000, transition: 'fade', objectFit: 'cover', refreshIntervalMs: 600_000,
};

function hubBlipsOnce() {
  mockDisplayFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockDisplayFetch.mockResolvedValue({
    ok: true, status: 200, headers: new Headers({ etag: 'W/"1"' }), blob: async () => new Blob(['x']),
  } as never);
}

async function pass(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

const unavailable = () => screen.queryByText(enUSModules.image.unavailable);

beforeEach(() => {
  vi.useFakeTimers();
  __resetAuthImageCacheForTests();
  URL.createObjectURL = vi.fn(() => 'blob:beach');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockDisplayFetch.mockReset();
  mockData = null;
});

describe('a picture whose first read was lost to a network blip', () => {
  it('comes back on an Image card', async () => {
    hubBlipsOnce();
    const { container } = render(<ImageModule config={{ src: PICTURE, objectFit: 'cover', alt: '' }} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    await pass(0);
    expect(unavailable()).toBeTruthy();

    await pass(5_000);
    expect(unavailable()).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:beach');
  });

  it('comes back on a Full-Screen Photo showing one picture', async () => {
    hubBlipsOnce();
    const { container } = render(<FullscreenPhotoModule config={fullscreen({ file: PICTURE })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    await pass(0);
    expect(unavailable()).toBeTruthy();

    await pass(5_000);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:beach');
    // The sentence stays until the picture is really painted, then goes.
    expect(unavailable()).toBeTruthy();
    fireEvent.load(img);
    expect(unavailable()).toBeNull();
  });

  it('says so again if the same Full-Screen Photo fails a second time', async () => {
    hubBlipsOnce();
    const { container } = render(<FullscreenPhotoModule config={fullscreen({ file: PICTURE })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    await pass(0);
    await pass(5_000);
    const img = container.querySelector('img')!;
    fireEvent.load(img);
    expect(unavailable()).toBeNull();
    fireEvent.error(img);
    expect(unavailable()).toBeTruthy();
  });

  it('comes back in a slideshow of one picture', async () => {
    hubBlipsOnce();
    mockData = [{ url: PICTURE, type: 'image' }];
    const { container } = render(<PhotoSlideshowModule config={slideshow} style={DEFAULT_MODULE_STYLE} screenId="s1" moduleId="one-picture" />, { wrapper: Wrapper });
    await pass(0);
    const shown = () => [...container.querySelectorAll('img')].filter((img) => img.getAttribute('src'));
    expect(shown()).toHaveLength(0);

    await pass(5_000);
    expect(shown().length).toBeGreaterThan(0);
    expect(shown()[0].getAttribute('src')).toBe('blob:beach');
  });

  it('keeps saying a deleted picture is not available, and stops asking', async () => {
    mockDisplayFetch.mockResolvedValue({ ok: false, status: 404, headers: new Headers() } as never);
    render(<FullscreenPhotoModule config={fullscreen({ file: PICTURE })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    await pass(24 * HOUR);
    expect(unavailable()).toBeTruthy();
    expect(mockDisplayFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves no timer behind when the module goes away mid-wait', async () => {
    mockDisplayFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const { unmount } = render(<FullscreenPhotoModule config={fullscreen({ file: PICTURE })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    await pass(2 * HOUR);
    const asked = mockDisplayFetch.mock.calls.length;
    unmount();
    await pass(24 * HOUR);
    expect(mockDisplayFetch.mock.calls.length).toBe(asked);
    expect(vi.getTimerCount()).toBe(0);
  });
});
