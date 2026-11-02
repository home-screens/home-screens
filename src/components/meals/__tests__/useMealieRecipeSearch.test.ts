// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { MealFetch } from '@/lib/meal-client';
import { useMealieRecipeSearch } from '../useMealieRecipeSearch';
import { HubUnreachableError } from '@/lib/hub-request';

afterEach(cleanup);

const search = (fetcher: MealFetch) =>
  renderHook(() => useMealieRecipeSearch(fetcher, { search: '', filter: 'favorites', enabled: true }));

describe('useMealieRecipeSearch', () => {
  /* A phone that lost the hub mid-search was told Mealie is down. */
  it('says a lost hub is a connection problem, not Mealie being down', async () => {
    const { result } = search(vi.fn().mockRejectedValue(new HubUnreachableError()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.problem).toBe('connection');
  });

  it('keeps Mealie\'s own reason when Mealie refused', async () => {
    const refused = { ok: false, status: 400, json: async () => ({ error: 'No.', failure: 'key-rejected' }) };
    const { result } = search(vi.fn().mockResolvedValue(refused));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.problem).toBe('token');
  });
});
