// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type FullscreenPhotoConfig, type MediaListItem, type PhotoSlideshowConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { setupError, transientError, type FetchError } from '@/lib/fetch-error';

let mockData: MediaListItem[] | null = null;
let mockError: FetchError | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [mockData, mockError],
}));

let imageStatus: 'ready' | 'failed' | 'loading' = 'ready';
vi.mock('@/components/display/useAuthImage', () => ({
  useAuthImage: (src?: string) => src,
  useAuthImageState: (src?: string) => (imageStatus === 'ready' ? { url: src, status: src ? 'ready' : 'idle' } : { url: undefined, status: imageStatus }),
}));

const rotation = vi.hoisted(() => ({ shuffle: [] as boolean[] }));
vi.mock('@/hooks/useRotatingIndex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useRotatingIndex')>();
  return {
    ...actual,
    useMediaRotation: (...args: Parameters<typeof actual.useMediaRotation>) => {
      rotation.shuffle.push(!!args[2]);
      return actual.useMediaRotation(...args);
    },
  };
});

import FullscreenPhotoModule from '../fullscreen-photo/FullscreenPhotoModule';
import PhotoSlideshowModule from '../PhotoSlideshowModule';
import ImageModule from '../ImageModule';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

const fullscreen = (overrides: Partial<FullscreenPhotoConfig> = {}): FullscreenPhotoConfig => ({
  photoSource: { kind: 'onedrive', folderId: 'F1' }, intervalMs: 10_000, transition: 'fade', objectFit: 'cover',
  shuffle: false, showClock: false, kenBurns: false, ...overrides,
});
const slideshow = (overrides: Partial<PhotoSlideshowConfig> = {}): PhotoSlideshowConfig => ({
  photoSource: { kind: 'library', folder: '' }, intervalMs: 10_000, transition: 'fade', objectFit: 'cover', refreshIntervalMs: 600_000, ...overrides,
});

afterEach(() => {
  cleanup();
  mockData = null;
  mockError = null;
  imageStatus = 'ready';
  rotation.shuffle.length = 0;
});

describe('FullscreenPhotoModule when its list cannot be read', () => {
  it('says what needs setting up in plain words, never the error\'s own text', () => {
    mockError = setupError('connection', 'OneDrive', { message: 'Sign in to OneDrive again' });
    render(<FullscreenPhotoModule config={fullscreen()} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.queryByText('Sign in to OneDrive again')).toBeNull();
    expect(screen.getByText(enUSModules.common.setup.notConnected.replace('{service}', 'OneDrive'))).toBeTruthy();
    expect(screen.getByText(enUSModules.common.setup.finishInEditor)).toBeTruthy();
  });

  it('says it is not updating while a failed first read is tried again', () => {
    mockError = transientError('fetch failed: ECONNRESET');
    const { container } = render(<FullscreenPhotoModule config={fullscreen()} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.getByTestId('module-not-updating').textContent).toBe(enUSModules.common.notUpdating);
    expect(container.textContent).not.toContain('ECONNRESET');
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('shows the shared loading state, sized for the wall, while the first read is still out', () => {
    const { container } = render(<FullscreenPhotoModule config={fullscreen()} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByTestId('module-loading').textContent).toBe(enUSModules['photo-slideshow'].loading);
    expect(screen.queryByTestId('module-not-updating')).toBeNull();
    // 28 px on the 1080-wide canvas, not the editor's 16 px.
    expect((container.querySelector('[data-module-card]') as HTMLElement).style.fontSize).toBe('28px');
  });

  it('says the same empty-library words as the slideshow card, with the phone address', () => {
    mockData = [];
    render(<FullscreenPhotoModule config={fullscreen({ photoSource: { kind: 'library', folder: '' } })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.getByText(enUSModules.common.photoEmpty.noPhotos)).toBeTruthy();
    expect(screen.getByTestId('fullscreen-photo-remote-url')).toBeTruthy();
  });
});

describe('a single picture that has gone', () => {
  it('says so on a Full-Screen Photo', () => {
    const { container } = render(<FullscreenPhotoModule config={fullscreen({ file: '/api/backgrounds/serve?file=gone.jpg' })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.queryByText(enUSModules.image.unavailable)).toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText(enUSModules.image.unavailable)).toBeTruthy();
  });

  it('says so on an Image whose file the hub no longer has, and not while it is loading', () => {
    imageStatus = 'loading';
    const first = render(<ImageModule config={{ src: '/api/backgrounds/serve?file=gone.jpg', objectFit: 'cover', alt: '' }} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.queryByText(enUSModules.image.unavailable)).toBeNull();
    first.unmount();
    imageStatus = 'failed';
    render(<ImageModule config={{ src: '/api/backgrounds/serve?file=gone.jpg', objectFit: 'cover', alt: '' }} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.getByText(enUSModules.image.unavailable)).toBeTruthy();
  });

  it('says so on an Image whose link the browser cannot load', () => {
    const { container } = render(<ImageModule config={{ src: 'https://example.com/gone.png', objectFit: 'cover', alt: '' }} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(enUSModules.image.unavailable)).toBeTruthy();
  });
});

describe('PhotoSlideshowModule options it shares with Full-Screen Photo', () => {
  const TWO: MediaListItem[] = [{ url: '/api/backgrounds/serve?file=a.jpg', type: 'image' }, { url: '/api/backgrounds/serve?file=b.jpg', type: 'image' }];

  it('shuffles only when asked', () => {
    mockData = TWO;
    render(<PhotoSlideshowModule config={slideshow()} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(rotation.shuffle.every((on) => !on)).toBe(true);
    cleanup();
    rotation.shuffle.length = 0;
    render(<PhotoSlideshowModule config={slideshow({ shuffle: true })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(rotation.shuffle.every((on) => on)).toBe(true);
  });

  it('keeps its 800 ms fade and gains slide, zoom and the slow pan', () => {
    mockData = TWO;
    const fade = render(<PhotoSlideshowModule config={slideshow()} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(fade.container.querySelector('img')!.style.transition).toBe('opacity 800ms ease-in-out');
    expect(fade.container.querySelector('style')).toBeNull();
    fade.unmount();

    const slide = render(<PhotoSlideshowModule config={slideshow({ transition: 'slide', kenBurns: true })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    const img = slide.container.querySelector('img')!;
    fireEvent.load(img);
    expect(img.style.transition).toContain('transform 800ms');
    expect(slide.container.querySelector('style')!.textContent).toContain('@keyframes kb-a');
  });
});

describe('PhotoSlideshowModule with nothing to show', () => {
  it('points an empty library at the phone, in the words the full-screen photo uses', () => {
    mockData = [];
    const { container } = render(<PhotoSlideshowModule config={slideshow()} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.getByText(enUSModules.common.photoEmpty.noPhotos)).toBeTruthy();
    expect(container.textContent).toContain('/remote');
  });

  it('names the fix in the editor for a cloud source', () => {
    mockData = [];
    render(<PhotoSlideshowModule config={slideshow({ photoSource: { kind: 'onedrive', folderId: 'F1' } })} style={DEFAULT_MODULE_STYLE} />, { wrapper: Wrapper });
    expect(screen.getByText(enUSModules.common.photoEmpty.hint.checkFolder)).toBeTruthy();
  });
});
