import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/adopted-display-cache', () => ({ getAdoptedDisplayIds: vi.fn() }));

import { getAdoptedDisplayIds } from '@/lib/adopted-display-cache';
import { adoptedDisplayFromQuery, adoptedDisplayRefusal, requireAdoptedDisplay } from '../adopted-display-gate';

const adopted = vi.mocked(getAdoptedDisplayIds);
const ask = (query: string) => adoptedDisplayFromQuery(new NextRequest(`http://hub.local/api/display/power-state${query}`));

beforeEach(() => adopted.mockReset());

describe('adoptedDisplayFromQuery', () => {
  it('answers with the id for a display the hub has adopted', async () => {
    adopted.mockResolvedValue(['main', 'kitchen']);
    expect(await ask('?display=kitchen')).toEqual({ ok: true, displayId: 'kitchen' });
  });

  it.each(['', '?display=', '?display=../etc', '?display=Kitchen%20Wall'])('calls %j invalid without looking at the registry', async (query) => {
    expect(await ask(query)).toEqual({ ok: false, reason: 'invalid' });
    expect(adopted).not.toHaveBeenCalled();
  });

  it('names a well-formed id the hub has not adopted', async () => {
    adopted.mockResolvedValue(['main']);
    expect(await ask('?display=garage')).toEqual({ ok: false, reason: 'not-adopted', displayId: 'garage' });
  });

  it('lets only "main" through before any display exists', async () => {
    adopted.mockResolvedValue(null);
    expect(await ask('?display=main')).toEqual({ ok: true, displayId: 'main' });
    expect(await ask('?display=kitchen')).toMatchObject({ ok: false, reason: 'not-adopted' });
  });

  it('decides exactly as requireAdoptedDisplay does', async () => {
    adopted.mockResolvedValue(['main', 'kitchen']);
    for (const id of ['main', 'kitchen', 'garage']) {
      const viaQuery = await ask(`?display=${id}`);
      expect(viaQuery.ok).toBe((await requireAdoptedDisplay(id)) === null);
    }
  });
});

describe('adoptedDisplayRefusal', () => {
  it('answers 400 for a missing or malformed id and 403 for one not adopted', async () => {
    const invalid = adoptedDisplayRefusal({ ok: false, reason: 'invalid' });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid or missing display' });

    const refused = adoptedDisplayRefusal({ ok: false, reason: 'not-adopted', displayId: 'garage' });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "Display 'garage' is not adopted. Adopt it from the hub first." });
  });
});
