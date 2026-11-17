import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => null) }));
vi.mock('@/lib/config', () => ({ updateConfigAtomic: vi.fn() }));
vi.mock('@/lib/photo-sources/art', () => ({ isCollectionPainting: (id: string) => id === 'Q1' || id === 'Q2' }));

import { updateConfigAtomic } from '@/lib/config';
import { POST } from '../route';

let saved: { settings: Record<string, unknown> };
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/art/hidden', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

beforeEach(() => {
  saved = { settings: { locale: 'en-US', artHidden: ['Q1'] } };
  vi.mocked(updateConfigAtomic).mockReset();
  vi.mocked(updateConfigAtomic).mockImplementation(async (mutate) => { saved = (await mutate(saved as never)) as never; return saved as never; });
});

describe('POST /api/art/hidden', () => {
  it('hides a painting of the collection and shows it again', async () => {
    expect(await (await post({ id: 'Q2', hidden: true })).json()).toEqual({ hidden: ['Q1', 'Q2'] });
    expect(saved.settings).toEqual({ locale: 'en-US', artHidden: ['Q1', 'Q2'] });
    expect(await (await post({ id: 'Q1', hidden: false })).json()).toEqual({ hidden: ['Q2'] });
  });

  it('leaves no empty list in the settings', async () => {
    await post({ id: 'Q1', hidden: false });
    expect(saved.settings).toEqual({ locale: 'en-US' });
    saved = { settings: { artHidden: ['Q1', 'Q2'] } };
    expect(await (await post({ hidden: [] })).json()).toEqual({ hidden: [] });
    expect(saved.settings).toEqual({});
  });

  it('refuses a painting that is not in the collection and a request that does not say which way', async () => {
    expect((await post({ id: 'Q999', hidden: true })).status).toBe(400);
    expect((await post({ id: 'Q1' })).status).toBe(400);
    expect((await post({ id: 7, hidden: true })).status).toBe(400);
    expect(updateConfigAtomic).not.toHaveBeenCalled();
  });
});
