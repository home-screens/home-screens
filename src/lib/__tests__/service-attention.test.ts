import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readConfig = vi.fn();
const isAuthenticated = vi.fn();
vi.mock('@/lib/config', () => ({ readConfig: () => readConfig() }));
vi.mock('@/lib/google-auth', () => ({ isAuthenticated: () => isAuthenticated() }));

import { servicesNeedingAttention } from '@/lib/service-attention';
import { forgetServiceOutcome, noteServiceOutcome, __resetServiceOutcomesForTests } from '@/lib/service-outcomes';

const withGoogleCalendars = (ids: string[]) => ({ settings: { calendar: { googleCalendarIds: ids } } });

beforeEach(() => {
  __resetServiceOutcomesForTests();
  readConfig.mockResolvedValue(withGoogleCalendars([]));
  isAuthenticated.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe('servicesNeedingAttention', () => {
  it('is empty while everything works', async () => {
    noteServiceOutcome('immich', true);
    expect(await servicesNeedingAttention()).toEqual({});
  });

  it('asks Google for a new sign-in only while Google calendars are picked', async () => {
    isAuthenticated.mockResolvedValue(false);
    expect(await servicesNeedingAttention()).toEqual({});
    readConfig.mockResolvedValue(withGoogleCalendars(['primary']));
    expect(await servicesNeedingAttention()).toEqual({ google: 'signIn' });
  });

  it('flags a server whose last request got no answer, until one does or its address changes', async () => {
    noteServiceOutcome('immich', false);
    expect(await servicesNeedingAttention()).toEqual({ immich: 'unreachable' });
    noteServiceOutcome('immich', true);
    expect(await servicesNeedingAttention()).toEqual({});
    noteServiceOutcome('immich', false);
    forgetServiceOutcome('immich');
    expect(await servicesNeedingAttention()).toEqual({});
  });

  it('says nothing about Google when the config cannot be read', async () => {
    readConfig.mockRejectedValue(new Error('unreadable'));
    isAuthenticated.mockResolvedValue(false);
    expect(await servicesNeedingAttention()).toEqual({});
  });
});
