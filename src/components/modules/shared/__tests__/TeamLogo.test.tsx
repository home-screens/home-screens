// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(),
  DISPLAY_FETCH_LONG_TIMEOUT_MS: 60_000,
}));

import { displayFetch } from '@/lib/display-fetch';
import { __resetAuthImageCacheForTests } from '@/components/display/useAuthImage';
import { TeamLogo } from '../TeamLogo';

const mockDisplayFetch = vi.mocked(displayFetch);

const LOGO = 'https://a.espncdn.com/i/teamlogos/nba/500/det.png';
const PROXIED = `/api/image-proxy?url=${encodeURIComponent(LOGO)}`;

function answer(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    blob: async () => new Blob(['png']),
    body: { cancel: vi.fn(async () => {}) },
  } as never;
}

beforeEach(() => {
  __resetAuthImageCacheForTests();
  URL.createObjectURL = vi.fn(() => 'blob:logo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TeamLogo', () => {
  it('asks the hub for the logo with the wall\'s own fetch, never as a bare picture address', async () => {
    mockDisplayFetch.mockResolvedValue(answer(200));
    const { container } = render(<TeamLogo src={LOGO} alt="Pistons" size={32} />);

    // A bare <img> to the hub cannot carry the display token, so on a hub
    // with a password every logo was turned away.
    expect(container.querySelector(`img[src^="/api/"]`)).toBeNull();

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(mockDisplayFetch).toHaveBeenCalledWith(PROXIED, expect.anything());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:logo');
    expect(img.getAttribute('alt')).toBe('Pistons');
    expect(img.style.width).toBe('32px');
  });

  it('keeps its place with nothing drawn while the logo loads and when it cannot be had', async () => {
    mockDisplayFetch.mockResolvedValue(answer(404));
    const { container } = render(<TeamLogo src={LOGO} alt="Pistons" size={32} />);

    const holds = () => {
      const box = container.firstElementChild as HTMLElement;
      expect(container.querySelector('img')).toBeNull();
      expect(box.style.width).toBe('32px');
      expect(box.style.height).toBe('32px');
    };
    holds();
    await waitFor(() => expect(mockDisplayFetch).toHaveBeenCalled());
    await Promise.resolve();
    holds();
  });

  it('holds the same space for a team with no logo and asks for nothing', () => {
    const { container } = render(<TeamLogo src="" alt="Nobody" size={24} />);
    expect((container.firstElementChild as HTMLElement).style.width).toBe('24px');
    expect(mockDisplayFetch).not.toHaveBeenCalled();
  });
});
