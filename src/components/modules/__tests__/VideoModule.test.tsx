// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type MediaListItem, type ModuleStyle, type VideoConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

// The module resolves library files through the typed media list; drive it here.
let mockList: MediaListItem[] | null = null;
const fetchDataCalls: string[] = [];
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => {
    fetchDataCalls.push(url);
    return [url ? mockList : null, null];
  },
}));

import VideoModule from '../VideoModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function makeConfig(overrides: Partial<VideoConfig> = {}): VideoConfig {
  return { source: 'file', file: 'clip.mp4', objectFit: 'cover', muted: true, loop: true, ...overrides };
}

function renderModule(config: VideoConfig, addressed: boolean) {
  const address = addressed ? { screenId: 's1', moduleId: 'm1' } : {};
  return render(<VideoModule config={config} style={style} {...address} />, { wrapper: Wrapper });
}

afterEach(() => {
  cleanup();
  mockList = null;
  fetchDataCalls.length = 0;
});

const TOKENIZED_URL = '/api/backgrounds/serve?file=clip.mp4&mt=token123';

describe('VideoModule source resolution', () => {
  it('resolves a library file to its tokenized list URL', () => {
    mockList = [
      { url: '/api/backgrounds/serve?file=other.mp4&mt=x', type: 'video' },
      { url: TOKENIZED_URL, type: 'video' },
    ];
    const { container } = renderModule(makeConfig(), true);
    expect(container.querySelector('video')?.getAttribute('src')).toBe(TOKENIZED_URL);
  });

  it('uses a direct URL without fetching the media list', () => {
    const { container } = renderModule(
      makeConfig({ source: 'url', url: 'https://example.com/clip.mp4' }),
      true,
    );
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://example.com/clip.mp4');
    expect(fetchDataCalls.every((u) => u === '')).toBe(true);
  });

  it('shows the empty state when nothing is configured', () => {
    const { getByText } = renderModule(makeConfig({ file: '' }), true);
    expect(getByText('Choose a video to play')).toBeTruthy();
  });

  it('shows the unavailable state when the file is gone from the library', () => {
    mockList = [{ url: '/api/backgrounds/serve?file=other.mp4', type: 'video' }];
    const { getByText } = renderModule(makeConfig(), true);
    expect(getByText("This video isn't available anymore")).toBeTruthy();
  });

  it('shows the loading state while the list is still fetching', () => {
    mockList = null;
    const { getByText } = renderModule(makeConfig(), true);
    expect(getByText('Loading video…')).toBeTruthy();
  });
});

describe('VideoModule YouTube URLs', () => {
  const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  it('renders the nocookie iframe embed on a real display', () => {
    const { container } = renderModule(makeConfig({ source: 'url', url: YT_URL }), true);
    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(iframe.getAttribute('src')).toContain('autoplay=1');
    expect(iframe.getAttribute('src')).toContain('mute=1');
    expect(container.querySelector('video')).toBeNull();
  });

  it('maps sound and loop toggles onto embed params', () => {
    const { container } = renderModule(
      makeConfig({ source: 'url', url: YT_URL, muted: false, loop: true }),
      true,
    );
    const src = container.querySelector('iframe')!.getAttribute('src')!;
    expect(src).toContain('mute=0');
    expect(src).toContain('loop=1');
    expect(src).toContain('playlist=dQw4w9WgXcQ');
  });

  it('shows the YouTube thumbnail + play badge in the editor, never the player', () => {
    const { container, getByTestId } = renderModule(makeConfig({ source: 'url', url: YT_URL }), false);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(getByTestId('video-play-badge')).toBeTruthy();
  });

  it('short youtu.be links work too', () => {
    const { container } = renderModule(
      makeConfig({ source: 'url', url: 'https://youtu.be/dQw4w9WgXcQ?si=abc' }),
      true,
    );
    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('/embed/dQw4w9WgXcQ');
  });

  it('non-YouTube URLs still use the <video> path', () => {
    const { container } = renderModule(
      makeConfig({ source: 'url', url: 'https://example.com/clip.mp4' }),
      true,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://example.com/clip.mp4');
  });
});

describe('VideoModule display vs editor context', () => {
  it('autoplays on a real display (address threaded)', () => {
    mockList = [{ url: TOKENIZED_URL, type: 'video' }];
    const { container, queryByTestId } = renderModule(makeConfig(), true);
    const video = container.querySelector('video')!;
    expect(video.hasAttribute('autoplay')).toBe(true);
    expect(video.muted).toBe(true);
    expect(queryByTestId('video-play-badge')).toBeNull();
  });

  it('shows a non-playing poster frame with a play badge in the editor', () => {
    const play = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    play.mockClear();
    mockList = [{ url: TOKENIZED_URL, type: 'video' }];
    const { container, getByTestId } = renderModule(makeConfig(), false);
    const video = container.querySelector('video')!;
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(getByTestId('video-play-badge')).toBeTruthy();
    expect(play).not.toHaveBeenCalled();
  });
});
