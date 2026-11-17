import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => null) }));
vi.mock('@/lib/background-rotation-cache', () => ({ rotationCacheStore: { read: vi.fn() } }));
vi.mock('@/lib/display-commands', () => ({ getDisplayStatus: vi.fn(), getAllDisplayStatuses: vi.fn() }));
vi.mock('@/lib/photo-sources/art', () => ({
  artAboutUrl: (file: string) => `about:${file}`,
  artThumbUrl: (file: string) => `thumb:${file}`,
}));

import { rotationCacheStore } from '@/lib/background-rotation-cache';
import { getAllDisplayStatuses, getDisplayStatus } from '@/lib/display-commands';
import { GET } from '../route';

const art = { id: 'Q4429116', file: 'The Magpie.jpg', title: 'The Magpie', artist: 'Claude Monet', year: 1868, museum: "Musée d'Orsay", label: 'brief', place: { style: 'placard', x: 1, y: 2, w: 3, tone: 'dark', unit: 1 } };
const status = (screenId: string) => ({ currentScreen: { index: 0, id: screenId, name: 'Living room' } }) as never;
const req = (query = '') => new NextRequest(`http://localhost/api/art/now${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rotationCacheStore.read).mockResolvedValue({
    art: { path: '/api/backgrounds/serve?file=rotation-art-x.jpg', sourceKey: 'k', fetchedAt: 1, intervalMinutes: 60, credit: { name: 'n', source: 's', art } },
    nasa: { path: '/api/backgrounds/serve?file=rotation-nasa-y.jpg', sourceKey: 'k', fetchedAt: 1, intervalMinutes: 60, credit: { name: 'n', source: 'NASA' } },
  } as never);
});

describe('GET /api/art/now', () => {
  it('answers the painting behind the screen a display is on', async () => {
    vi.mocked(getDisplayStatus).mockReturnValue(status('art'));
    const body = await (await GET(req('?display=kitchen'))).json();
    expect(body).toEqual({
      painting: { id: 'Q4429116', title: 'The Magpie', artist: 'Claude Monet', year: 1868, museum: "Musée d'Orsay", thumb: 'thumb:The Magpie.jpg', about: 'about:The Magpie.jpg' },
      screenId: 'art',
      display: 'kitchen',
    });
  });

  it('answers no painting for a screen with another picture, and for a display nobody has heard from', async () => {
    vi.mocked(getDisplayStatus).mockReturnValue(status('nasa'));
    expect(await (await GET(req('?display=kitchen'))).json()).toEqual({ painting: null });
    vi.mocked(getDisplayStatus).mockReturnValue(null);
    expect(await (await GET(req('?display=kitchen'))).json()).toEqual({ painting: null });
  });

  it('takes the first wall showing a painting when no display is named, and refuses a bad id', async () => {
    vi.mocked(getAllDisplayStatuses).mockReturnValue(new Map([['hall', status('nasa')], ['den', status('art')]]));
    expect(await (await GET(req())).json()).toMatchObject({ display: 'den', screenId: 'art', painting: { id: 'Q4429116' } });
    expect((await GET(req('?display=../x'))).status).toBe(400);
  });
});
